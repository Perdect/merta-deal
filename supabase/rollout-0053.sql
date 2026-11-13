-- Merta Deal — rollout 0053: wholesale bulk orders with quotes.
-- Paste this whole file into the Supabase SQL editor (project qvpfnwdnnqxjrrjwpevj) and run it once.
-- It is idempotent: running it twice changes nothing. It adds columns to wholesale_orders, four
-- functions, and the wholesale-photos storage bucket. No existing data is changed or deleted.
-- ============================================================================
-- MERTA DEAL — Wholesale bulk orders with quotes (0053)
--
-- 0045 let a buyer order full cases of catalogue products that already carry a wholesale price.
-- This migration adds the missing half of a Hyperpure-style flow:
--   * a customer may list items that are NOT in the wholesale range (name, brand, quantity, unit,
--     optional photo). Those lines are requests, never priced or promised by the app.
--   * a submitted order waits for a person: staff review it, map each requested line to a real
--     catalogue product or mark it unavailable, adjust the case lines, and send a quote.
--   * the customer approves or declines the quote. Only an approved order can be placed, and
--     placing still goes through admin_confirm_wholesale_order → a real `orders` row that the
--     normal packing, reservation, rider and OTP flow delivers.
--   * the order carries its own delivery address, contact and instructions, so a buyer can send a
--     bulk order to a home, shop, hostel or office without changing their saved default.
--
-- Nothing here invents a product, a price or a stock figure: a requested line can only become
-- orderable by being mapped to a catalogue product that an admin has already priced for wholesale.
-- Statuses after `placed` are the real order's own (confirmed → packed → delivered); they are read
-- from that row and never copied here.
--
-- Idempotent. Depends on 0045 and 0048.
-- ============================================================================

insert into public.settings (key, value, "group", label, description, is_public) values
  ('wholesale_max_request_lines', '20', 'wholesale', 'Wholesale: items a customer may request', 'How many off-catalogue lines one bulk order may carry. Each one needs a person to price it.', false),
  ('wholesale_quote_lead_hours', '24', 'wholesale', 'Wholesale: quote reply time (hours)', 'Shown to the customer as how soon we reply with a quote. Set it to what you can keep.', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.wholesale_orders
  add column if not exists requested_items jsonb not null default '[]'::jsonb,
  add column if not exists address_id uuid references public.addresses(id) on delete set null,
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists delivery_notes text,
  add column if not exists quote_note text,
  add column if not exists quoted_at timestamptz,
  add column if not exists quoted_by uuid references public.profiles(id) on delete set null,
  add column if not exists submitted_at timestamptz;

do $$
begin
  alter table public.wholesale_orders drop constraint if exists wholesale_orders_status_check;
  alter table public.wholesale_orders add constraint wholesale_orders_status_check
    check (status in ('submitted', 'reviewing', 'quoted', 'proposed', 'approved', 'placed', 'declined', 'cancelled', 'expired'));
end $$;

create index if not exists wholesale_orders_open_idx on public.wholesale_orders (status, created_at desc)
  where status in ('submitted', 'reviewing', 'quoted');

-- ---------------------------------------------------------------------------
-- 2. Requested (off-catalogue) lines: validated, never priced here
-- ---------------------------------------------------------------------------
/**
 * Normalises what the customer typed into one line per item. Every line starts `pending`: it carries
 * no price and no promise. Staff resolve it later by mapping it to a catalogue product or marking it
 * unavailable.
 */
create or replace function public._wholesale_requested(p_requested jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_out jsonb := '[]'::jsonb; v_e record; v_n int := 0;
  v_max int := greatest(1, public.get_setting_num('wholesale_max_request_lines', 20)::int);
  v_name text; v_brand text; v_unit text; v_notes text; v_photo text; v_qty numeric;
begin
  for v_e in
    select e ->> 'name' as name, e ->> 'brand' as brand, e ->> 'quantity' as quantity, e ->> 'unit' as unit,
           e ->> 'notes' as notes, e ->> 'photo_url' as photo_url
      from jsonb_array_elements(coalesce(p_requested, '[]'::jsonb)) e
  loop
    v_name := btrim(coalesce(v_e.name, ''));
    if v_name = '' then continue; end if;
    v_n := v_n + 1;
    if v_n > v_max then raise exception 'WHOLESALE: You can request up to % items in one order. Send the rest as a second order.', v_max; end if;
    if char_length(v_name) not between 2 and 120 then raise exception 'WHOLESALE: Write the product name in 2 to 120 letters.'; end if;
    v_brand := nullif(btrim(coalesce(v_e.brand, '')), '');
    if char_length(coalesce(v_brand, '')) > 80 then raise exception 'WHOLESALE: That brand name is too long.'; end if;
    if coalesce(btrim(coalesce(v_e.quantity, '')), '') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' then raise exception 'WHOLESALE: Enter how much of % you need.', v_name; end if;
    v_qty := btrim(v_e.quantity)::numeric;
    if v_qty <= 0 then raise exception 'WHOLESALE: The quantity for % must be more than zero.', v_name; end if;
    v_unit := nullif(btrim(coalesce(v_e.unit, '')), '');
    if v_unit is null then raise exception 'WHOLESALE: Choose a unit for % (cases, kg, pieces…).', v_name; end if;
    if char_length(v_unit) > 40 then raise exception 'WHOLESALE: That unit is too long.'; end if;
    v_notes := nullif(btrim(coalesce(v_e.notes, '')), '');
    if char_length(coalesce(v_notes, '')) > 300 then raise exception 'WHOLESALE: The note on % is too long.', v_name; end if;
    v_photo := nullif(btrim(coalesce(v_e.photo_url, '')), '');
    if v_photo is not null and (v_photo !~ '^https://' or char_length(v_photo) > 500) then raise exception 'WHOLESALE: That photo could not be attached. Remove it and send the request again.'; end if;
    v_out := v_out || jsonb_build_object(
      'id', 'r' || v_n, 'name', v_name, 'brand', v_brand, 'quantity', v_qty, 'unit', v_unit,
      'notes', v_notes, 'photo_url', v_photo, 'status', 'pending',
      'product_id', null, 'product_name', null, 'cases', null, 'admin_note', null);
  end loop;
  return v_out;
end $$;
revoke all on function public._wholesale_requested(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Customer: send a bulk order
-- ---------------------------------------------------------------------------
/**
 * One bulk order: any number of wholesale catalogue lines plus any number of requested items.
 * When every catalogue line already has a wholesale price and nothing was requested, the order is
 * approved immediately (same as "order now" in 0045) and only waits for an admin to place it.
 * Otherwise it is `submitted` and waits for a quote — the customer is told exactly that.
 */
create or replace function public.submit_wholesale_order(
  p_items jsonb default '[]'::jsonb, p_requested jsonb default '[]'::jsonb, p_address_id uuid default null,
  p_delivery_date date default null, p_contact_name text default null, p_contact_phone text default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop public.kirana_shops := public._ensure_wholesale_buyer();
  v_snap jsonb; v_req jsonb; v_order public.wholesale_orders; v_addr public.addresses;
  v_date date := coalesce(p_delivery_date, current_date);
  v_min numeric := public.get_setting_num('wholesale_min_order_amount', 0);
  v_name text := nullif(btrim(coalesce(p_contact_name, '')), '');
  v_phone text := nullif(right(regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g'), 10), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_needs_quote boolean; v_lines int; v_reqs int; v_status text;
begin
  if v_date < current_date then raise exception 'WHOLESALE: Pick today or a later date.'; end if;
  if v_date > current_date + 30 then raise exception 'WHOLESALE: Pick a date within the next 30 days.'; end if;
  if char_length(coalesce(v_notes, '')) > 500 then raise exception 'WHOLESALE: The delivery note is too long.'; end if;
  if v_phone is not null and v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'WHOLESALE: Enter a 10-digit mobile number.'; end if;

  if p_address_id is not null then
    select * into v_addr from public.addresses where id = p_address_id and user_id = auth.uid();
    if v_addr.id is null then raise exception 'WHOLESALE: Choose one of your saved addresses.'; end if;
  else
    select * into v_addr from public.addresses where id = v_shop.address_id;
  end if;
  if v_addr.id is null then raise exception 'WHOLESALE: Add a delivery address first.'; end if;

  v_snap := public._wholesale_snapshot(p_items);
  v_req := public._wholesale_requested(p_requested);
  v_lines := (v_snap ->> 'line_count')::int;
  v_reqs := jsonb_array_length(v_req);
  if v_lines + v_reqs = 0 then raise exception 'WHOLESALE: Add at least one product or write what you need.'; end if;

  v_needs_quote := (v_snap ->> 'has_unpriced')::boolean or v_reqs > 0;
  v_status := case when v_needs_quote then 'submitted' else 'approved' end;
  if not v_needs_quote and (v_snap ->> 'subtotal')::numeric < v_min then raise exception 'WHOLESALE: The minimum wholesale order is ₹%.', v_min; end if;

  insert into public.wholesale_orders (shop_id, restock_date, status, items, requested_items, subtotal, delivery_fee, has_unpriced,
    address_id, contact_name, contact_phone, delivery_notes, shop_note, submitted_at, approved_at)
  values (v_shop.id, v_date, v_status, v_snap -> 'items', v_req, (v_snap ->> 'subtotal')::numeric,
    public.get_setting_num('wholesale_delivery_fee', 0), (v_snap ->> 'has_unpriced')::boolean,
    v_addr.id, coalesce(v_name, v_shop.owner_name), coalesce(v_phone, v_shop.phone), v_notes, v_notes, now(),
    case when v_needs_quote then null else now() end)
  returning * into v_order;

  if v_shop.address_id is null then update public.kirana_shops set address_id = v_addr.id, updated_at = now() where id = v_shop.id; end if;

  perform public.notify_admins(
    case when v_needs_quote then 'wholesale_request' else 'wholesale_approved' end,
    case when v_needs_quote then 'Wholesale quote needed: ' else 'Wholesale order: ' end || coalesce(v_shop.shop_name, v_shop.owner_name),
    case when v_needs_quote
      then format('%s sent a bulk order for %s: %s catalogue line(s), %s item(s) to price. Open Wholesale to quote it.', coalesce(v_shop.shop_name, v_shop.owner_name), to_char(v_date, 'DD Mon'), v_lines, v_reqs)
      else format('%s ordered wholesale for %s (₹%s). Confirm it under Wholesale to place it.', coalesce(v_shop.shop_name, v_shop.owner_name), to_char(v_date, 'DD Mon'), to_char(v_order.subtotal, 'FM9999990.00')) end,
    jsonb_build_object('wholesale_order_id', v_order.id, 'shop_id', v_shop.id, 'url', '/admin/wholesale?view=' || v_order.id));
  perform public.audit('wholesale.order.submit', 'wholesale_orders', v_order.id::text, null,
    jsonb_build_object('status', v_status, 'lines', v_lines, 'requested', v_reqs, 'subtotal', v_order.subtotal));
  return to_jsonb(v_order);
end $$;
revoke all on function public.submit_wholesale_order(jsonb, jsonb, uuid, date, text, text, text) from public, anon;
grant execute on function public.submit_wholesale_order(jsonb, jsonb, uuid, date, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Staff: review and quote
-- ---------------------------------------------------------------------------
/**
 * Staff price a submitted order. `p_items` is the final set of catalogue lines (quantities changed,
 * lines removed, and any substitution the staff chose for a requested item). `p_requested` resolves
 * each requested line by its id: `fulfilled` with the catalogue product it became, or `unavailable`.
 * What the customer wrote is never rewritten here — only its resolution is.
 * p_action 'save' keeps working privately (`reviewing`); 'send' puts it in front of the customer.
 */
create or replace function public.admin_quote_wholesale_order(
  p_id uuid, p_items jsonb default '[]'::jsonb, p_requested jsonb default '[]'::jsonb,
  p_delivery_fee numeric default null, p_note text default null, p_action text default 'save'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.wholesale_orders; v_shop public.kirana_shops; v_snap jsonb; v_req jsonb := '[]'::jsonb;
  v_e record; v_old jsonb; v_status text; v_pid uuid; v_pname text; v_cases int; v_anote text;
  v_fee numeric; v_pending int := 0; v_total numeric; v_action text := coalesce(nullif(btrim(coalesce(p_action, '')), ''), 'save');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_action not in ('save', 'send') then raise exception 'WHOLESALE: Choose save or send.'; end if;
  select * into v_order from public.wholesale_orders where id = p_id for update;
  if v_order.id is null then raise exception 'WHOLESALE: This order was not found.'; end if;
  if v_order.status not in ('submitted', 'reviewing', 'quoted') then raise exception 'WHOLESALE: A % order cannot be quoted.', v_order.status; end if;
  select * into v_shop from public.kirana_shops where id = v_order.shop_id;

  v_snap := public._wholesale_snapshot(coalesce(p_items, '[]'::jsonb));

  -- Resolve each requested line against what the customer originally wrote.
  for v_e in select e ->> 'id' as id, e ->> 'status' as status, e ->> 'product_id' as product_id, e ->> 'cases' as cases, e ->> 'admin_note' as admin_note
               from jsonb_array_elements(coalesce(p_requested, '[]'::jsonb)) e
  loop
    select value into v_old from jsonb_array_elements(v_order.requested_items) value where value ->> 'id' = v_e.id;
    if v_old is null then raise exception 'WHOLESALE: A requested item no longer exists. Reload the order.'; end if;
    v_status := coalesce(nullif(btrim(coalesce(v_e.status, '')), ''), 'pending');
    if v_status not in ('pending', 'fulfilled', 'unavailable') then raise exception 'WHOLESALE: Mark each requested item as added or unavailable.'; end if;
    v_anote := nullif(btrim(coalesce(v_e.admin_note, '')), '');
    if char_length(coalesce(v_anote, '')) > 300 then raise exception 'WHOLESALE: That note is too long.'; end if;
    v_pid := null; v_pname := null; v_cases := null;
    if v_status = 'fulfilled' then
      if v_e.product_id is null or v_e.product_id = '' then raise exception 'WHOLESALE: Pick the catalogue product for "%".', v_old ->> 'name'; end if;
      v_pid := v_e.product_id::uuid;
      select name into v_pname from public.products where id = v_pid;
      if v_pname is null then raise exception 'WHOLESALE: That product is not in the catalogue.'; end if;
      if not exists (select 1 from jsonb_array_elements(v_snap -> 'items') l where (l ->> 'product_id')::uuid = v_pid) then
        raise exception 'WHOLESALE: Add % to the order lines before marking "%" as added.', v_pname, v_old ->> 'name';
      end if;
      select (l ->> 'cases')::int into v_cases from jsonb_array_elements(v_snap -> 'items') l where (l ->> 'product_id')::uuid = v_pid;
    end if;
    if v_status = 'pending' then v_pending := v_pending + 1; end if;
    v_req := v_req || (v_old || jsonb_build_object('status', v_status, 'product_id', v_pid, 'product_name', v_pname, 'cases', v_cases, 'admin_note', v_anote));
  end loop;
  -- Lines the caller did not mention keep whatever they already had.
  for v_e in select value as line from jsonb_array_elements(v_order.requested_items) value loop
    if not exists (select 1 from jsonb_array_elements(v_req) r where r ->> 'id' = v_e.line ->> 'id') then
      v_req := v_req || v_e.line;
      if coalesce(v_e.line ->> 'status', 'pending') = 'pending' then v_pending := v_pending + 1; end if;
    end if;
  end loop;

  v_fee := coalesce(p_delivery_fee, v_order.delivery_fee, public.get_setting_num('wholesale_delivery_fee', 0));
  if v_fee < 0 then raise exception 'WHOLESALE: The delivery fee cannot be negative.'; end if;

  if v_action = 'send' then
    if (v_snap ->> 'line_count')::int = 0 then raise exception 'WHOLESALE: A quote needs at least one priced line.'; end if;
    if (v_snap ->> 'has_unpriced')::boolean then raise exception 'WHOLESALE: Set a wholesale price for every line before sending the quote.'; end if;
    if v_pending > 0 then raise exception 'WHOLESALE: % requested item(s) are still open. Add each one or mark it unavailable.', v_pending; end if;
  end if;

  update public.wholesale_orders
     set status = case when v_action = 'send' then 'quoted' else 'reviewing' end,
         items = v_snap -> 'items', requested_items = v_req, subtotal = (v_snap ->> 'subtotal')::numeric,
         has_unpriced = (v_snap ->> 'has_unpriced')::boolean, delivery_fee = v_fee,
         quote_note = nullif(btrim(coalesce(p_note, '')), ''),
         quoted_at = case when v_action = 'send' then now() else v_order.quoted_at end,
         quoted_by = case when v_action = 'send' then auth.uid() else v_order.quoted_by end,
         updated_at = now()
   where id = p_id returning * into v_order;

  if v_action = 'send' then
    v_total := v_order.subtotal + v_fee;
    perform public.notify_user(v_shop.owner_id, 'wholesale_review', 'Your wholesale quote is ready',
      format('Your bulk order for %s comes to ₹%s including delivery. Open it to approve or decline.', to_char(v_order.restock_date, 'DD Mon'), to_char(v_total, 'FM9999990.00')),
      jsonb_build_object('wholesale_order_id', v_order.id, 'url', '/account/wholesale'));
  end if;
  perform public.audit('wholesale.order.quote', 'wholesale_orders', p_id::text, null, jsonb_build_object('action', v_action, 'subtotal', v_order.subtotal, 'fee', v_fee));
  return to_jsonb(v_order);
end $$;
revoke all on function public.admin_quote_wholesale_order(uuid, jsonb, jsonb, numeric, text, text) from public, anon;
grant execute on function public.admin_quote_wholesale_order(uuid, jsonb, jsonb, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Customer: approve or decline the quote
-- ---------------------------------------------------------------------------
create or replace function public.shop_respond_wholesale_quote(p_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop public.kirana_shops := public._ensure_wholesale_buyer(); v_order public.wholesale_orders;
  v_min numeric := public.get_setting_num('wholesale_min_order_amount', 0); v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_order from public.wholesale_orders where id = p_id and shop_id = v_shop.id for update;
  if v_order.id is null then raise exception 'WHOLESALE: This order was not found.'; end if;
  if v_order.status <> 'quoted' then raise exception 'WHOLESALE: This order is % and cannot be answered here.', v_order.status; end if;
  if p_action = 'decline' then
    update public.wholesale_orders set status = 'declined', shop_note = coalesce(v_note, shop_note), updated_at = now() where id = p_id returning * into v_order;
    perform public.notify_admins('wholesale_request', 'Wholesale quote declined: ' || coalesce(v_shop.shop_name, v_shop.owner_name),
      format('%s declined the quote for %s.%s', coalesce(v_shop.shop_name, v_shop.owner_name), to_char(v_order.restock_date, 'DD Mon'), coalesce(' Reason: ' || v_note, '')),
      jsonb_build_object('wholesale_order_id', v_order.id, 'url', '/admin/wholesale?view=' || v_order.id));
    perform public.audit('wholesale.order.decline', 'wholesale_orders', p_id::text, null, jsonb_build_object('note', v_note));
    return to_jsonb(v_order);
  end if;
  if p_action <> 'approve' then raise exception 'WHOLESALE: Choose approve or decline.'; end if;
  if v_order.has_unpriced then raise exception 'WHOLESALE: This quote is not complete yet. Please wait for us to finish it.'; end if;
  if v_order.subtotal < v_min then raise exception 'WHOLESALE: The minimum wholesale order is ₹%.', v_min; end if;
  update public.wholesale_orders set status = 'approved', shop_note = coalesce(v_note, shop_note), approved_at = now(), updated_at = now()
   where id = p_id returning * into v_order;
  perform public.notify_admins('wholesale_approved', 'Wholesale quote approved: ' || coalesce(v_shop.shop_name, v_shop.owner_name),
    format('%s approved the quote for %s (₹%s). Confirm it under Wholesale to place it.', coalesce(v_shop.shop_name, v_shop.owner_name), to_char(v_order.restock_date, 'DD Mon'), to_char(v_order.subtotal, 'FM9999990.00')),
    jsonb_build_object('wholesale_order_id', v_order.id, 'url', '/admin/wholesale?view=' || v_order.id));
  perform public.audit('wholesale.order.approve_quote', 'wholesale_orders', p_id::text, null, jsonb_build_object('subtotal', v_order.subtotal));
  return to_jsonb(v_order);
end $$;
revoke all on function public.shop_respond_wholesale_quote(uuid, text, text) from public, anon;
grant execute on function public.shop_respond_wholesale_quote(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Placing: honour the order's own address, contact and quoted fee
-- ---------------------------------------------------------------------------
create or replace function public.admin_confirm_wholesale_order(p_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.wholesale_orders; v_shop public.kirana_shops; v_addr public.addresses; v_zone public.delivery_zones; v_pp jsonb := public.pickup_point();
  v_line record; v_inv public.inventory; v_order_id uuid; v_order_no text; v_otp text; v_fee numeric; v_tax numeric; v_total numeric; v_count int := 0;
  v_dist numeric := 0; v_rider numeric; v_hours jsonb := public.get_setting('business_hours'); v_start timestamptz; v_end timestamptz; v_open int; v_instructions text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.wholesale_orders where id = p_id for update;
  if v_order.id is null then raise exception 'WHOLESALE: This order was not found.'; end if;
  if v_order.status <> 'approved' then raise exception 'WHOLESALE: Only an order the buyer has approved can be placed (this one is %).', v_order.status; end if;
  if v_order.has_unpriced then raise exception 'WHOLESALE: Set a wholesale price for every item first.'; end if;
  select count(*) into v_open from jsonb_array_elements(coalesce(v_order.requested_items, '[]'::jsonb)) e where coalesce(e ->> 'status', 'pending') = 'pending';
  if v_open > 0 then raise exception 'WHOLESALE: % requested item(s) are still open. Add each one or mark it unavailable.', v_open; end if;
  select * into v_shop from public.kirana_shops where id = v_order.shop_id;
  if v_shop.status <> 'approved' then raise exception 'WHOLESALE: Wholesale ordering is paused for this buyer.'; end if;
  select * into v_addr from public.addresses where id = coalesce(v_order.address_id, v_shop.address_id);
  if v_addr.id is null then raise exception 'WHOLESALE: This buyer has no delivery address on file.'; end if;
  v_zone := public.find_zone(v_addr.pincode, v_addr.lat, v_addr.lng);
  if v_zone.id is null then raise exception 'WHOLESALE: The delivery address is outside the delivery area.'; end if;
  if v_addr.lat is not null and (v_pp ->> 'lat') is not null then
    v_dist := public.haversine_km(v_addr.lat, v_addr.lng, (v_pp ->> 'lat')::double precision, (v_pp ->> 'lng')::double precision);
  end if;

  -- A quote names a fee the customer approved, so that figure is honoured. Orders that never went
  -- through a quote keep the 0045 behaviour and take the fee from settings at placing time.
  v_fee := case when v_order.quoted_at is not null then coalesce(v_order.delivery_fee, 0) else public.get_setting_num('wholesale_delivery_fee', 0) end;
  v_tax := round(v_fee * public.get_setting_num('tax_rate_percent', 18) / 100, 2);
  v_total := v_order.subtotal + v_fee + v_tax;
  v_rider := public.get_setting_num('rider_base_earning', 20) + ceil(v_dist) * public.get_setting_num('rider_per_km_earning', 5);
  v_start := (v_order.restock_date::text || ' ' || coalesce(v_hours ->> 'open', '09:00') || ':00')::timestamp at time zone 'Asia/Kolkata';
  v_end := (v_order.restock_date::text || ' ' || case when coalesce(v_hours ->> 'close', '21:00') = '24:00' then '23:59' else coalesce(v_hours ->> 'close', '21:00') end || ':00')::timestamp at time zone 'Asia/Kolkata';
  if v_end < now() then v_start := now(); v_end := now() + interval '4 hours'; end if;
  v_order_no := public.generate_order_number();
  v_otp := public.secure_otp4();
  v_instructions := 'Wholesale order for ' || coalesce(v_shop.shop_name, v_shop.owner_name)
    || coalesce(' · contact ' || nullif(v_order.contact_name, ''), '') || coalesce(' ' || nullif(v_order.contact_phone, ''), '')
    || coalesce(' · ' || nullif(v_order.delivery_notes, ''), coalesce(' · ' || v_order.shop_note, ''));

  insert into public.orders (order_number, user_id, zone_id, status, delivery_type, scheduled_slot_start, scheduled_slot_end, address_snapshot, delivery_lat, delivery_lng,
    delivery_instructions, payment_method, payment_status, subtotal, item_discount, coupon_discount, delivery_fee, platform_fee, tax_amount, total, rider_earning, item_count, eta_minutes, promised_at, channel, kirana_shop_id)
  values (v_order_no, v_shop.owner_id, v_zone.id, 'placed', 'scheduled', v_start, v_end, to_jsonb(v_addr) - 'user_id', v_addr.lat, v_addr.lng,
    left(v_instructions, 500), 'cod', 'cod_pending', v_order.subtotal, 0, 0, v_fee, 0, v_tax, v_total, v_rider, 0, greatest(1, extract(epoch from (v_end - now()))::int / 60), v_end, 'wholesale', v_shop.id)
  returning id into v_order_id;
  insert into public.order_secrets (order_id, delivery_otp) values (v_order_id, v_otp);

  for v_line in select (e ->> 'product_id')::uuid as product_id, (e ->> 'units')::int as units, (e ->> 'cases')::int as cases, (e ->> 'case_size')::int as case_size, (e ->> 'price_per_case')::numeric as price_per_case, e ->> 'name' as name
      from jsonb_array_elements(v_order.items) e loop
    select * into v_inv from public.inventory where product_id = v_line.product_id for update;
    if v_inv.id is null or not v_inv.is_active then raise exception 'WHOLESALE: % is not in the catalogue any more.', v_line.name; end if;
    if v_inv.stock_qty < v_line.units then raise exception 'WHOLESALE: Not enough stock for % (% units needed, % available). Receive stock first or ask the buyer to reduce it.', v_line.name, v_line.units, v_inv.stock_qty; end if;
    insert into public.order_items (order_id, product_id, inventory_id, product_name, brand_name, pack_label, image_url, quantity, unit_price, unit_mrp, line_total)
    select v_order_id, p.id, v_inv.id, p.name, b.name, coalesce(p.pack_label, '') || ' × ' || v_line.case_size || ' (case)', p.image_url, v_line.units, round(v_line.price_per_case / v_line.case_size, 2), v_inv.mrp, round(v_line.cases * v_line.price_per_case, 2)
      from public.products p left join public.brands b on b.id = p.brand_id where p.id = v_line.product_id;
    v_count := v_count + v_line.units;
  end loop;
  perform public._order_reserve_stock(v_order_id);
  update public.orders set item_count = v_count where id = v_order_id;
  insert into public.payments (order_id, user_id, provider, method, amount, status) values (v_order_id, v_shop.owner_id, 'cod', 'cod', v_total, 'cod_pending');
  insert into public.order_status_history (order_id, status, actor_id, actor_role, note) values (v_order_id, 'placed', auth.uid(), 'admin', 'Wholesale order placed from the buyer''s approved order');
  perform public._auto_confirm_order(v_order_id);

  update public.wholesale_orders set status = 'placed', order_id = v_order_id, placed_at = now(), placed_by = auth.uid(), admin_note = nullif(btrim(coalesce(p_note, '')), ''), delivery_fee = v_fee, updated_at = now() where id = p_id;
  update public.wholesale_lists set next_run_date = public._next_restock_date(restock_day, v_order.restock_date), updated_at = now() where id = v_order.list_id and next_run_date = v_order.restock_date;
  perform public.notify_user(v_shop.owner_id, 'order_placed', 'Wholesale order ' || v_order_no || ' confirmed',
    format('Your wholesale order for %s is confirmed: %s units, ₹%s, pay on delivery. Track it under Orders.', to_char(v_order.restock_date, 'DD Mon'), v_count, to_char(v_total, 'FM9999990.00')),
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'status', 'confirmed'));
  perform public.audit('wholesale.order.place', 'wholesale_orders', p_id::text, null, jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'total', v_total));
  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'total', v_total, 'item_count', v_count);
end $$;
revoke all on function public.admin_confirm_wholesale_order(uuid, text) from public, anon;
grant execute on function public.admin_confirm_wholesale_order(uuid, text) to authenticated;

-- Cancelling now covers the quote statuses too.
create or replace function public.admin_cancel_wholesale_order(p_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.wholesale_orders; v_shop public.kirana_shops;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.wholesale_orders where id = p_id for update;
  if v_order.id is null then raise exception 'WHOLESALE: This order was not found.'; end if;
  if v_order.status not in ('submitted', 'reviewing', 'quoted', 'proposed', 'approved') then raise exception 'WHOLESALE: A % order cannot be cancelled here.', v_order.status; end if;
  update public.wholesale_orders set status = 'cancelled', admin_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now() where id = p_id returning * into v_order;
  update public.wholesale_lists set next_run_date = public._next_restock_date(restock_day, v_order.restock_date), updated_at = now() where id = v_order.list_id and next_run_date = v_order.restock_date;
  select * into v_shop from public.kirana_shops where id = v_order.shop_id;
  perform public.notify_user(v_shop.owner_id, 'wholesale_review', 'Wholesale order cancelled',
    coalesce(v_order.admin_note, 'Your wholesale order for ' || to_char(v_order.restock_date, 'DD Mon') || ' was cancelled. Call us if you have questions.'),
    jsonb_build_object('wholesale_order_id', v_order.id));
  return to_jsonb(v_order);
end $$;
revoke all on function public.admin_cancel_wholesale_order(uuid, text) from public, anon;
grant execute on function public.admin_cancel_wholesale_order(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Reads: carry the delivery address of each order
-- ---------------------------------------------------------------------------
create or replace function public.my_kirana_shop()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_shop public.kirana_shops := public._my_shop(); v_list public.wholesale_lists;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_shop.id is null then return jsonb_build_object('shop', null); end if;
  select * into v_list from public.wholesale_lists where shop_id = v_shop.id;
  return jsonb_build_object(
    'shop', to_jsonb(v_shop) || jsonb_build_object('address', (select to_jsonb(a) from public.addresses a where a.id = v_shop.address_id)),
    'list', case when v_list.id is null then null else to_jsonb(v_list) || jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('product_id', li.product_id, 'cases', li.cases, 'name', p.name, 'pack_label', p.pack_label, 'image_url', p.image_url) order by p.name)
      from public.wholesale_list_items li join public.products p on p.id = li.product_id where li.list_id = v_list.id), '[]'::jsonb)) end,
    'orders', coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object(
        'order_number', (select order_number from public.orders x where x.id = o.order_id),
        'order_status', (select status::text from public.orders x where x.id = o.order_id),
        'address', (select to_jsonb(a) from public.addresses a where a.id = o.address_id)) order by o.restock_date desc, o.created_at desc)
      from (select * from public.wholesale_orders where shop_id = v_shop.id order by restock_date desc limit 24) o), '[]'::jsonb),
    'settings', jsonb_build_object('min_order_amount', public.get_setting_num('wholesale_min_order_amount', 0), 'delivery_fee', public.get_setting_num('wholesale_delivery_fee', 0),
      'lead_days', public.get_setting_num('wholesale_review_lead_days', 2), 'quote_lead_hours', public.get_setting_num('wholesale_quote_lead_hours', 24),
      'max_request_lines', public.get_setting_num('wholesale_max_request_lines', 20))
  );
end $$;
revoke all on function public.my_kirana_shop() from public, anon;
grant execute on function public.my_kirana_shop() to authenticated;

create or replace function public.admin_wholesale_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'shops', coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('address', (select to_jsonb(a) from public.addresses a where a.id = s.address_id),
        'list', (select to_jsonb(l) from public.wholesale_lists l where l.shop_id = s.id),
        'orders_placed', (select count(*) from public.wholesale_orders o where o.shop_id = s.id and o.status = 'placed')) order by s.created_at desc) from public.kirana_shops s), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object('shop_name', s.shop_name, 'shop_phone', s.phone, 'owner_name', s.owner_name,
        'order_number', (select order_number from public.orders x where x.id = o.order_id), 'order_status', (select status::text from public.orders x where x.id = o.order_id),
        'address', (select to_jsonb(a) from public.addresses a where a.id = o.address_id))
        order by case o.status when 'submitted' then 0 when 'reviewing' then 1 when 'quoted' then 2 when 'approved' then 3 when 'proposed' then 4 else 5 end, o.restock_date desc)
      from (select * from public.wholesale_orders order by created_at desc limit 200) o join public.kirana_shops s on s.id = o.shop_id), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(w) || jsonb_build_object('name', p.name, 'pack_label', p.pack_label, 'image_url', p.image_url, 'retail_price', i.selling_price, 'stock_qty', i.stock_qty, 'product_active', p.is_active) order by p.name)
      from public.wholesale_products w join public.products p on p.id = w.product_id left join public.inventory i on i.product_id = p.id), '[]'::jsonb),
    'counts', jsonb_build_object('buyers', (select count(*) from public.kirana_shops),
      'approved_orders', (select count(*) from public.wholesale_orders where status = 'approved'),
      'open_requests', (select count(*) from public.wholesale_orders where status in ('submitted', 'reviewing')),
      'awaiting_customer', (select count(*) from public.wholesale_orders where status = 'quoted'))
  );
end $$;
revoke all on function public.admin_wholesale_overview() from public, anon;
grant execute on function public.admin_wholesale_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Photos a customer attaches to a requested item
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not present (local shim) — skipping bucket setup';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('wholesale-photos', 'wholesale-photos', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif'])
  on conflict (id) do nothing;
  execute 'drop policy if exists "public read wholesale photos" on storage.objects';
  execute 'drop policy if exists "own wholesale photo upload" on storage.objects';
  execute 'drop policy if exists "own wholesale photo manage" on storage.objects';
  execute $q$create policy "public read wholesale photos" on storage.objects for select using (bucket_id = 'wholesale-photos')$q$;
  execute $q$create policy "own wholesale photo upload" on storage.objects for insert to authenticated with check (bucket_id = 'wholesale-photos' and (storage.foldername(name))[1] = auth.uid()::text)$q$;
  execute $q$create policy "own wholesale photo manage" on storage.objects for all to authenticated using (bucket_id = 'wholesale-photos' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)) with check (bucket_id = 'wholesale-photos' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text))$q$;
end $$;
