-- Inventory reservations and passbook (0048)
--
-- Stock is tracked in three figures per listing (inventory row):
--   available  = inventory.stock_qty      (sellable now; every existing availability check keeps reading it)
--   reserved   = inventory.reserved_qty   (held for orders that are placed but not yet delivered)
--   physical   = available + reserved     (what is on the shelf)
-- Placing an order moves quantity from available to reserved; delivery removes it from reserved (physical
-- falls); cancellation / rejection / an approved "item short" exception moves it back to available.
-- orders.stock_state (reserved | released | finalised) makes every transition idempotent: a retried
-- cancel or a repeated delivery callback changes nothing. All movements go through _inv_move(), which
-- locks the row, refuses negatives and writes an append-only inventory_passbook entry with the balances
-- before and after. Writers that still insert inventory_movements directly (scan stock-in, goods receipts,
-- quick-edit adjustments) are mirrored into the passbook by a trigger. Passbook rows can never be
-- updated or deleted; a correction is a new row.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.inventory add column if not exists reserved_qty int not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_reserved_qty_nonneg') then
    alter table public.inventory add constraint inventory_reserved_qty_nonneg check (reserved_qty >= 0);
  end if;
end $$;
alter table public.orders add column if not exists stock_state text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_stock_state_check') then
    alter table public.orders add constraint orders_stock_state_check check (stock_state is null or stock_state in ('reserved', 'released', 'finalised'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Passbook: append-only, admin-readable
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_passbook (
  id bigint generated always as identity primary key,
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  kind text not null check (kind in ('reserve', 'release', 'deliver', 'exception_release', 'receive', 'adjust', 'correction', 'opening')),
  delta_available int not null,
  delta_reserved int not null,
  available_before int not null,
  available_after int not null,
  reserved_before int not null,
  reserved_after int not null,
  physical_before int generated always as (available_before + reserved_before) stored,
  physical_after int generated always as (available_after + reserved_after) stored,
  order_id uuid references public.orders(id) on delete set null,
  reference_id uuid,
  reference_type text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists inventory_passbook_inv_idx on public.inventory_passbook(inventory_id, id desc);
create index if not exists inventory_passbook_order_idx on public.inventory_passbook(order_id) where order_id is not null;
create index if not exists inventory_passbook_created_idx on public.inventory_passbook(created_at desc);
alter table public.inventory_passbook enable row level security;
drop policy if exists inventory_passbook_admin_read on public.inventory_passbook;
create policy inventory_passbook_admin_read on public.inventory_passbook for select using (public.is_admin());

create or replace function public.inventory_passbook_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'PASSBOOK_IMMUTABLE: passbook entries are never changed; record a correction instead';
end $$;
drop trigger if exists inventory_passbook_immutable_trg on public.inventory_passbook;
create trigger inventory_passbook_immutable_trg before update or delete on public.inventory_passbook
for each row execute function public.inventory_passbook_immutable();

-- ---------------------------------------------------------------------------
-- 3. The one way stock moves
-- ---------------------------------------------------------------------------
/**
 * Moves available / reserved stock on one listing inside the caller's transaction. Locks the row,
 * refuses a negative result, writes the passbook row (balances before and after) and, when available
 * stock changed, the legacy inventory_movements row that older screens read. p_legacy_reason is that
 * row's reason (order, cancel_restock, reject_restock, exception_release, manual_adjust, …).
 */
create or replace function public._inv_move(p_inventory_id uuid, p_kind text, p_delta_available int, p_delta_reserved int,
  p_order_id uuid default null, p_reference_id uuid default null, p_note text default null, p_legacy_reason text default null, p_reference_type text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv public.inventory; v_av int; v_rs int; v_name text; v_id bigint;
begin
  if coalesce(p_delta_available, 0) = 0 and coalesce(p_delta_reserved, 0) = 0 then return jsonb_build_object('ok', true, 'noop', true); end if;
  select * into inv from public.inventory where id = p_inventory_id for update;
  if inv.id is null then raise exception 'NOT_FOUND: inventory %', p_inventory_id; end if;
  v_av := inv.stock_qty + coalesce(p_delta_available, 0);
  v_rs := inv.reserved_qty + coalesce(p_delta_reserved, 0);
  if v_av < 0 then
    if p_kind = 'reserve' then raise exception 'INSUFFICIENT_STOCK'; else raise exception 'NEGATIVE_STOCK'; end if;
  end if;
  if v_rs < 0 then raise exception 'RESERVATION_MISMATCH: % would leave reserved stock below zero', p_kind; end if;
  select name into v_name from public.products where id = inv.product_id;
  perform set_config('app.passbook', 'on', true);
  update public.inventory set stock_qty = v_av, reserved_qty = v_rs where id = inv.id;
  -- A pooled (loose) product rewrites stock_qty from grams; re-read so the passbook shows the real figure.
  select stock_qty into v_av from public.inventory where id = inv.id;
  if coalesce(p_delta_available, 0) <> 0 then
    insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id, note)
    values (inv.id, p_delta_available, coalesce(p_legacy_reason, p_kind), coalesce(p_order_id, p_reference_id), auth.uid(), p_note);
  end if;
  insert into public.inventory_passbook (inventory_id, product_id, kind, delta_available, delta_reserved, available_before, available_after, reserved_before, reserved_after,
    order_id, reference_id, reference_type, actor_id, actor_name, note)
  values (inv.id, inv.product_id, p_kind, coalesce(p_delta_available, 0), coalesce(p_delta_reserved, 0), inv.stock_qty, v_av, inv.reserved_qty, v_rs,
    p_order_id, p_reference_id, p_reference_type, auth.uid(), public._actor_name(), p_note)
  returning id into v_id;
  perform set_config('app.passbook', 'off', true);
  return jsonb_build_object('ok', true, 'passbook_id', v_id, 'available', v_av, 'reserved', v_rs, 'physical', v_av + v_rs, 'product', v_name);
end $$;
revoke all on function public._inv_move(uuid, text, int, int, uuid, uuid, text, text, text) from public, anon, authenticated;

-- Writers that still insert inventory_movements themselves (scan stock-in, goods receipts, pools) get a
-- passbook row from this trigger; _inv_move marks its own legacy rows so they are not written twice.
create or replace function public.inventory_movements_passbook()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.inventory; v_kind text;
begin
  if coalesce(current_setting('app.passbook', true), 'off') = 'on' then return new; end if;
  if coalesce(new.delta, 0) = 0 then return new; end if;
  select * into inv from public.inventory where id = new.inventory_id;
  if inv.id is null then return new; end if;
  v_kind := case
    when new.reason in ('grn', 'restock', 'stock_in', 'purchase', 'received') then 'receive'
    when new.reason in ('correction', 'count', 'stock_count', 'recount') then 'correction'
    when new.reason in ('order', 'wholesale') then 'reserve'
    when new.reason in ('cancel_restock', 'reject_restock') then 'release'
    when new.reason = 'exception_release' then 'exception_release'
    else 'adjust' end;
  insert into public.inventory_passbook (inventory_id, product_id, kind, delta_available, delta_reserved, available_before, available_after, reserved_before, reserved_after,
    order_id, reference_id, reference_type, actor_id, actor_name, note)
  values (inv.id, inv.product_id, v_kind, new.delta, 0, inv.stock_qty - new.delta, inv.stock_qty, inv.reserved_qty, inv.reserved_qty,
    case when v_kind in ('reserve', 'release', 'exception_release') then new.reference_id end,
    case when v_kind in ('reserve', 'release', 'exception_release') then null else new.reference_id end,
    case when new.reason = 'grn' then 'goods_receipt' when new.stock_pool_id is not null then 'stock_pool' else null end,
    new.actor_id, coalesce(new.actor_name, public._actor_name()), coalesce(new.note, new.reason));
  return new;
end $$;
drop trigger if exists inventory_movements_passbook_trg on public.inventory_movements;
create trigger inventory_movements_passbook_trg after insert on public.inventory_movements
for each row execute function public.inventory_movements_passbook();

-- ---------------------------------------------------------------------------
-- 4. Order-level transitions (idempotent through orders.stock_state)
-- ---------------------------------------------------------------------------
/** Reserve every line of an order (available → reserved). No-op if already reserved. */
create or replace function public._order_reserve_stock(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.stock_state is not null then return; end if;
  for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
    perform public._inv_move(v_item.inventory_id, 'reserve', -v_item.quantity, v_item.quantity, o.id, null, 'Order ' || o.order_number, 'order');
    update public.inventory set sold_count = sold_count + v_item.quantity where id = v_item.inventory_id;
  end loop;
  update public.orders set stock_state = 'reserved' where id = o.id;
end $$;
revoke all on function public._order_reserve_stock(uuid) from public, anon, authenticated;

/** Give an order's reservation back to available stock (cancel / reject / payment expired). No-op unless reserved. */
create or replace function public._order_release_stock(p_order_id uuid, p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; n int := 0;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.stock_state is distinct from 'reserved' then return 0; end if;
  for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
    perform public._inv_move(v_item.inventory_id, 'release', v_item.quantity, -v_item.quantity, o.id, null, coalesce(p_note, 'Order ' || o.order_number || ' cancelled'), 'cancel_restock');
    update public.inventory set sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
    n := n + 1;
  end loop;
  update public.orders set stock_state = 'released' where id = o.id;
  return n;
end $$;
revoke all on function public._order_release_stock(uuid, text) from public, anon, authenticated;

/** Delivered: the reserved quantity leaves physical stock. No-op unless reserved. */
create or replace function public._order_finalise_stock(p_order_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; n int := 0;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.stock_state is distinct from 'reserved' then return 0; end if;
  for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
    perform public._inv_move(v_item.inventory_id, 'deliver', 0, -v_item.quantity, o.id, null, 'Order ' || o.order_number || ' delivered');
    n := n + 1;
  end loop;
  update public.orders set stock_state = 'finalised' where id = o.id;
  return n;
end $$;
revoke all on function public._order_finalise_stock(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Existing orders: in-flight ones become reservations; closed ones are recorded as such
-- ---------------------------------------------------------------------------
update public.orders set stock_state = 'finalised' where stock_state is null and status in ('delivered', 'completed');
update public.orders set stock_state = 'released' where stock_state is null and status in ('cancelled', 'rejected');
with live as (
  select oi.inventory_id, sum(oi.quantity)::int as qty
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where oi.inventory_id is not null and o.stock_state is null
    and o.status in ('placed', 'confirmed', 'preparing', 'ready_for_pickup', 'rider_assigned', 'out_for_delivery')
  group by oi.inventory_id
), moved as (
  update public.inventory i set reserved_qty = i.reserved_qty + l.qty from live l where l.inventory_id = i.id returning i.id, i.product_id, i.stock_qty, i.reserved_qty, l.qty
)
insert into public.inventory_passbook (inventory_id, product_id, kind, delta_available, delta_reserved, available_before, available_after, reserved_before, reserved_after, note)
select id, product_id, 'opening', 0, qty, stock_qty, stock_qty, reserved_qty - qty, reserved_qty, 'Reservations opened for orders in progress (0048)' from moved;
update public.orders set stock_state = 'reserved' where stock_state is null
  and status in ('placed', 'confirmed', 'preparing', 'ready_for_pickup', 'rider_assigned', 'out_for_delivery');

-- ---------------------------------------------------------------------------
-- 6. place_order (0043 body): lines are reserved, not deducted
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_address_id uuid,
  p_payment_method public.payment_method,
  p_delivery_type public.delivery_type default 'standard',
  p_instructions text default null,
  p_scheduled_start timestamptz default null,
  p_scheduled_end timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_cart public.carts; v_sum jsonb; v_addr public.addresses;
  v_order_id uuid; v_order_no text; v_total numeric; v_sub numeric;
  v_otp text; v_item record; v_zone_id uuid; v_pay_status public.payment_status; v_provider public.payment_provider;
  v_eta int; v_coupon_id uuid; v_coupon_code text; v_coupon_disc numeric; v_rider_earning numeric;
  v_wallet numeric; v_auto boolean; v_referral_credit_id uuid; v_brand text := coalesce(public.get_setting('brand_name') #>> '{}', 'Merta Deal');
  v_upi_now boolean := public.get_setting_bool('upi_pay_now_enabled', false) and public.get_setting_bool('upi_on_delivery_enabled', false)
    and coalesce(public.get_setting('upi_id') #>> '{}', '') <> '';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_payment_method not in ('cod','upi','card','netbanking','wallet','razorpay') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_payment_method = 'cod' and not public.get_setting_bool('cod_enabled', true) then raise exception 'COD_DISABLED'; end if;

  select * into v_cart from public.carts where user_id = v_uid and status = 'active' for update;
  if v_cart.id is null or not exists (select 1 from public.cart_items where cart_id = v_cart.id) then raise exception 'CART_EMPTY'; end if;

  select * into v_addr from public.addresses where id = p_address_id and user_id = v_uid;
  if v_addr.id is null then raise exception 'ADDRESS_NOT_FOUND'; end if;

  select id into v_referral_credit_id from public.free_delivery_credits
    where user_id = v_uid and redeemed_order_id is null
      and (expires_at is null or expires_at > now())
      and (not first_order_only or not exists (select 1 from public.orders o where o.user_id = v_uid and o.status not in ('cancelled', 'rejected')))
    order by granted_at limit 1 for update skip locked;

  v_sum := public.cart_summary(p_address_id, p_delivery_type);
  if not (v_sum ->> 'serviceable')::boolean then raise exception 'NOT_SERVICEABLE: %', v_sum ->> 'service_message'; end if;
  if jsonb_array_length(v_sum -> 'issues') > 0 then raise exception 'ITEMS_UNAVAILABLE: %', (v_sum -> 'issues')::text; end if;
  if not (v_sum ->> 'meets_min_order')::boolean then raise exception 'MIN_ORDER: Minimum order amount is ₹%', v_sum ->> 'min_order_amount'; end if;
  if p_delivery_type = 'express' and not coalesce((v_sum #>> '{zone,express_supported}')::boolean, false) then raise exception 'EXPRESS_UNAVAILABLE'; end if;
  if p_delivery_type = 'scheduled' and (p_scheduled_start is null or p_scheduled_start < now()) then raise exception 'INVALID_SLOT'; end if;
  if not public.is_business_open() and p_delivery_type <> 'scheduled' then raise exception 'CLOSED: % is closed right now. Please order during business hours.', v_brand; end if;

  v_sub := (v_sum ->> 'subtotal')::numeric;
  v_total := (v_sum ->> 'total')::numeric;
  v_coupon_disc := (v_sum ->> 'coupon_discount')::numeric;
  v_coupon_id := case when v_coupon_disc > 0 then (v_sum #>> '{coupon,coupon_id}')::uuid end;
  v_coupon_code := case when v_coupon_disc > 0 then v_sum #>> '{coupon,code}' end;
  v_zone_id := (v_sum #>> '{zone,id}')::uuid;
  v_eta := (v_sum ->> 'eta_max_minutes')::int;
  v_rider_earning := public.get_setting_num('rider_base_earning', 20) + ceil((v_sum ->> 'distance_km')::numeric) * public.get_setting_num('rider_per_km_earning', 5);

  if p_payment_method = 'wallet' then
    select wallet_balance into v_wallet from public.profiles where id = v_uid for update;
    if v_wallet < v_total then raise exception 'INSUFFICIENT_WALLET'; end if;
  end if;

  v_pay_status := case when p_payment_method = 'cod' then 'cod_pending' when p_payment_method = 'wallet' then 'paid' else 'pending' end;
  v_provider := case when p_payment_method = 'cod' then 'cod' when p_payment_method = 'wallet' then 'wallet'
    when p_payment_method = 'upi' and v_upi_now then 'upi' else 'razorpay' end;
  v_order_no := public.generate_order_number();
  v_otp := public.secure_otp4();

  insert into public.orders (
    order_number, user_id, zone_id, status, delivery_type, scheduled_slot_start, scheduled_slot_end,
    address_snapshot, delivery_lat, delivery_lng, delivery_instructions, payment_method, payment_status,
    subtotal, item_discount, coupon_id, coupon_code, coupon_discount, delivery_fee, platform_fee, tax_amount, total,
    rider_earning, item_count, eta_minutes, promised_at
  ) values (
    v_order_no, v_uid, v_zone_id, 'placed', p_delivery_type, p_scheduled_start, p_scheduled_end,
    to_jsonb(v_addr) - 'user_id', v_addr.lat, v_addr.lng, p_instructions, p_payment_method, v_pay_status,
    v_sub, (v_sum ->> 'item_savings')::numeric, v_coupon_id, v_coupon_code, v_coupon_disc,
    (v_sum ->> 'delivery_fee')::numeric + (v_sum ->> 'express_fee')::numeric, (v_sum ->> 'platform_fee')::numeric, (v_sum ->> 'tax')::numeric, v_total,
    v_rider_earning, (v_sum ->> 'item_count')::int, v_eta,
    case when p_delivery_type = 'scheduled' then p_scheduled_end else now() + make_interval(mins => v_eta) end
  ) returning id into v_order_id;

  if coalesce((v_sum ->> 'referral_delivery_credit')::boolean, false) then
    if v_referral_credit_id is null then raise exception 'REFERRAL_CREDIT_UNAVAILABLE'; end if;
    update public.free_delivery_credits set redeemed_order_id = v_order_id, redeemed_at = now() where id = v_referral_credit_id;
  end if;

  insert into public.order_secrets (order_id, delivery_otp) values (v_order_id, v_otp);

  for v_item in
    select ci.inventory_id, ci.product_id, ci.quantity, i.selling_price, i.mrp, p.name, p.pack_label, p.image_url, b.name as brand_name
    from public.cart_items ci join public.inventory i on i.id = ci.inventory_id join public.products p on p.id = ci.product_id
    left join public.brands b on b.id = p.brand_id
    where ci.cart_id = v_cart.id
  loop
    insert into public.order_items (order_id, product_id, inventory_id, product_name, brand_name, pack_label, image_url, quantity, unit_price, unit_mrp, line_total)
    values (v_order_id, v_item.product_id, v_item.inventory_id, v_item.name, v_item.brand_name, v_item.pack_label, v_item.image_url, v_item.quantity, v_item.selling_price, v_item.mrp, v_item.quantity * v_item.selling_price);
    update public.products set popularity_score = popularity_score + v_item.quantity where id = v_item.product_id;
  end loop;
  -- Reserve (available → reserved) with the balances written to the passbook; refuses if another order got there first.
  perform public._order_reserve_stock(v_order_id);

  insert into public.payments (order_id, user_id, provider, method, amount, status)
  values (v_order_id, v_uid, v_provider, p_payment_method, v_total, v_pay_status);

  if p_payment_method = 'wallet' then
    update public.profiles set wallet_balance = wallet_balance - v_total where id = v_uid;
    insert into public.wallet_transactions (user_id, type, amount, balance_after, description, order_id)
    values (v_uid, 'debit', v_total, v_wallet - v_total, 'Paid for order ' || v_order_no, v_order_id);
  end if;

  if v_coupon_id is not null then
    insert into public.coupon_usage (coupon_id, user_id, order_id, discount_amount) values (v_coupon_id, v_uid, v_order_id, v_coupon_disc);
    update public.coupons set used_count = used_count + 1 where id = v_coupon_id;
  end if;

  update public.carts set status = 'converted' where id = v_cart.id;

  insert into public.order_status_history (order_id, status, actor_id, actor_role, note) values (v_order_id, 'placed', v_uid, 'customer', null);
  v_auto := public.get_setting_bool('auto_accept_orders', true) and v_pay_status in ('cod_pending', 'paid');
  if v_auto then perform public._auto_confirm_order(v_order_id); end if;
  perform public.notify_user(v_uid, 'order_placed', case when v_auto then 'Order confirmed' else 'Order placed' end,
    case when v_auto then format('Order %s is confirmed and being packed. Arriving in about %s minutes. Total ₹%s.', v_order_no, v_eta, to_char(v_total,'FM9999990.00'))
         else format('Order %s placed. Total ₹%s. We''ll confirm it as soon as your payment is received.', v_order_no, to_char(v_total,'FM9999990.00')) end,
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'status', case when v_auto then 'confirmed' else 'placed' end));
  perform public.notify_admins('new_order', 'New order ' || v_order_no,
    case when v_auto then format('%s items · ₹%s · %s. Pack it and tap "Packed" — a rider is requested automatically.', (v_sum ->> 'item_count'), to_char(v_total,'FM9999990.00'), upper(p_payment_method::text))
         when v_provider = 'upi' then format('%s items · ₹%s · UPI. Waiting for the customer''s UPI payment; mark it received under Payments to confirm the order.', (v_sum ->> 'item_count'), to_char(v_total,'FM9999990.00'))
         else format('%s items · ₹%s · %s. Waiting for online payment; it is confirmed automatically once paid.', (v_sum ->> 'item_count'), to_char(v_total,'FM9999990.00'), upper(p_payment_method::text)) end,
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no));
  perform public.audit('order.place', 'orders', v_order_id::text, null, jsonb_build_object('order_number', v_order_no, 'total', v_total));

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'total', v_total,
    'payment_required', v_provider = 'razorpay', 'payment_method', p_payment_method, 'payment_provider', v_provider, 'upi_pending', v_provider = 'upi');
end $$;

-- ---------------------------------------------------------------------------
-- 7. cancel_order (0037 body): release instead of restock
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_is_admin boolean := public.is_admin(); r record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if not (v_is_admin or o.user_id = auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if o.status in ('delivered','completed','cancelled','rejected') then raise exception 'CANNOT_CANCEL: %', o.status; end if;
  if not v_is_admin and o.status not in ('placed','confirmed')
     and not exists (select 1 from public.order_exceptions x where x.order_id = o.id and x.status = 'declined' and x.resolved_at > now() - interval '5 minutes') then
    raise exception 'CANNOT_CANCEL: order is already being packed. Please contact support.';
  end if;

  perform public._order_release_stock(o.id, 'Order ' || o.order_number || ' cancelled' || coalesce(': ' || nullif(btrim(p_reason), ''), ''));
  for r in select a.id, a.status as a_status, dp.user_id from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id
           where a.order_id = o.id and a.status in ('accepted','picked_up') loop
    perform public.notify_user(r.user_id, 'delivery_cancelled', 'Delivery cancelled: ' || o.order_number,
      case when r.a_status = 'picked_up' then 'The order was cancelled. Please bring it back to the pickup point.' else 'The order was cancelled before pickup. No need to collect it.' end,
      jsonb_build_object('order_id', o.id, 'assignment_id', r.id));
    if r.a_status = 'picked_up' then perform public._rider_compensation(r.id, 'cancelled_after_pickup'); end if;
  end loop;
  update public.delivery_assignments set status = 'cancelled' where order_id = o.id and status in ('offered','accepted','picked_up');
  update public.order_exceptions set status = 'withdrawn', resolved_at = now() where order_id = o.id and status = 'pending';
  update public.orders set cancelled_by = auth.uid(), cancel_reason = p_reason, exception = null, exception_at = null where id = o.id;
  perform public._handle_refund_on_cancel(o.id);
  perform public._set_order_status(o.id, 'cancelled', p_reason);
  if not v_is_admin then
    perform public.notify_admins('order_cancelled', 'Order ' || o.order_number || ' cancelled', coalesce(p_reason, 'Cancelled by customer.'), jsonb_build_object('order_id', o.id));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 8. fulfil_order (0036 body): reject releases the reservation
-- ---------------------------------------------------------------------------
create or replace function public.fulfil_order(p_order_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_assignment uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;

  case p_action
    when 'accept' then
      if o.status <> 'placed' then raise exception 'INVALID_TRANSITION: % -> accept', o.status; end if;
      if o.payment_method not in ('cod') and o.payment_status not in ('paid','authorized') then raise exception 'PAYMENT_PENDING: Online payment has not been received yet'; end if;
      perform public._set_order_status(o.id, 'confirmed', p_note);
    when 'reject' then
      if o.status not in ('placed','confirmed','preparing') then raise exception 'INVALID_TRANSITION: % -> reject', o.status; end if;
      perform public._order_release_stock(o.id, 'Order ' || o.order_number || ' rejected' || coalesce(': ' || nullif(btrim(p_note), ''), ''));
      update public.order_exceptions set status = 'withdrawn', resolved_at = now() where order_id = o.id and status = 'pending';
      update public.orders set reject_reason = p_note, exception = null, exception_at = null where id = o.id;
      perform public._handle_refund_on_cancel(o.id);
      perform public._set_order_status(o.id, 'rejected', p_note);
    when 'preparing' then
      if o.status <> 'confirmed' then raise exception 'INVALID_TRANSITION: % -> preparing', o.status; end if;
      perform public._set_order_status(o.id, 'preparing', p_note);
    when 'ready' then
      if o.status not in ('confirmed','preparing') then raise exception 'INVALID_TRANSITION: % -> ready', o.status; end if;
      if exists (select 1 from public.order_exceptions where order_id = o.id and status = 'pending') then raise exception 'EXCEPTION_PENDING: Waiting for the customer to approve an unavailable item'; end if;
      if exists (select 1 from public.order_pack_events where order_id = o.id and result = 'ok')
         and exists (select 1 from public.order_items where order_id = o.id and packed_qty < quantity) then
        raise exception 'PACK_INCOMPLETE';
      end if;
      perform public._set_order_status(o.id, 'ready_for_pickup', p_note);
      v_assignment := public.auto_dispatch(o.id);
    else raise exception 'UNKNOWN_ACTION';
  end case;
  return jsonb_build_object('ok', true, 'status', (select status from public.orders where id = o.id), 'assignment_id', v_assignment);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Item exception (0036 body): the short quantity is released from the reservation
-- ---------------------------------------------------------------------------
create or replace function public._apply_item_exception(p_exception_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare x public.order_exceptions; oi public.order_items; o public.orders; v_release int; v_old_total numeric; v_new_total numeric; v_bal numeric; v_refund numeric := 0;
begin
  select * into x from public.order_exceptions where id = p_exception_id for update;
  select * into oi from public.order_items where id = x.order_item_id for update;
  select * into o from public.orders where id = x.order_id for update;
  v_release := oi.quantity - x.available_qty;
  if v_release <= 0 then return 0; end if;
  v_old_total := o.total;
  if x.available_qty = 0 then
    delete from public.order_items where id = oi.id;
  else
    update public.order_items set quantity = x.available_qty, line_total = round(x.available_qty * unit_price, 2), packed_qty = least(packed_qty, x.available_qty) where id = oi.id;
  end if;
  if oi.inventory_id is not null then
    -- Only a live reservation is released; a legacy order (deducted at placement) simply gets the stock back.
    perform public._inv_move(oi.inventory_id, 'exception_release', v_release, case when o.stock_state = 'reserved' then -v_release else 0 end, o.id, x.id,
      format('%s short on order %s', v_release, o.order_number), 'exception_release', 'order_exception');
    update public.inventory set sold_count = greatest(sold_count - v_release, 0) where id = oi.inventory_id;
  end if;
  update public.orders set
    subtotal = coalesce((select sum(line_total) from public.order_items where order_id = o.id), 0),
    item_count = coalesce((select sum(quantity) from public.order_items where order_id = o.id), 0)
  where id = o.id;
  update public.orders set total = greatest(0, subtotal - coalesce(coupon_discount, 0) + coalesce(delivery_fee, 0) + coalesce(platform_fee, 0) + coalesce(tax_amount, 0)) where id = o.id
  returning total into v_new_total;
  v_refund := case when o.payment_status in ('paid', 'authorized') then greatest(0, v_old_total - v_new_total) else 0 end;
  if v_refund > 0 then
    if o.payment_method = 'wallet' then
      update public.profiles set wallet_balance = wallet_balance + v_refund where id = o.user_id returning wallet_balance into v_bal;
      insert into public.wallet_transactions (user_id, type, amount, balance_after, description, order_id)
      values (o.user_id, 'refund', v_refund, v_bal, format('Refund for unavailable items on order %s', o.order_number), o.id);
      update public.payments set refund_amount = coalesce(refund_amount, 0) + v_refund where order_id = o.id;
      update public.orders set payment_status = 'partially_refunded' where id = o.id;
    else
      update public.payments set refund_required = true where order_id = o.id;
      perform public.notify_admins('refund_due', format('Refund ₹%s due on %s', to_char(v_refund, 'FM9999990.00'), o.order_number),
        'The customer approved a reduced order. Issue the partial refund from the order page.', jsonb_build_object('order_id', o.id, 'amount', v_refund));
    end if;
  end if;
  update public.order_exceptions set refund_amount = v_refund where id = x.id;
  update public.delivery_assignments set cod_amount = (select total from public.orders where id = o.id) where order_id = o.id and status in ('offered','accepted','picked_up') and o.payment_method = 'cod';
  return v_refund;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Delivery (0037 body): the reservation leaves physical stock
-- ---------------------------------------------------------------------------
create or replace function public._complete_delivery(p_assignment_id uuid, p_via text)
returns int language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; o public.orders; v_points int := 0; v_new uuid;
begin
  select * into a from public.delivery_assignments where id = p_assignment_id;
  select * into o from public.orders where id = a.order_id;
  update public.delivery_assignments set status = 'delivered', delivered_at = now() where id = a.id;
  perform public._set_order_status(o.id, 'delivered', case when p_via = 'support' then 'Confirmed by support without OTP' end);
  perform public._order_finalise_stock(o.id);

  if o.payment_method = 'cod' then
    update public.payments set status = 'cod_collected', collected_by = (select user_id from public.delivery_partners where id = a.rider_id), collected_at = now() where order_id = o.id;
    update public.orders set payment_status = 'cod_collected' where id = o.id;
    insert into public.cod_collections (order_id, assignment_id, rider_id, amount, confirmed_via, collected_by)
    values (o.id, a.id, a.rider_id, o.total, p_via, (select user_id from public.delivery_partners where id = a.rider_id))
    on conflict (order_id) do nothing;
  end if;

  insert into public.rider_earnings (rider_id, assignment_id, order_id, amount, confirmed_via, kind, breakdown, rate_card_id)
  values (a.rider_id, a.id, o.id, a.earning, p_via, 'delivery', a.quoted_breakdown, a.rate_card_id)
  on conflict (assignment_id, kind) where assignment_id is not null do nothing
  returning id into v_new;
  if v_new is not null then
    update public.delivery_partners set total_deliveries = total_deliveries + 1, total_earnings = total_earnings + a.earning where id = a.rider_id;
    v_points := floor(o.subtotal / 100) * public.get_setting_num('reward_points_per_100', 1)::int;
    if v_points > 0 then
      update public.profiles set reward_points = reward_points + v_points where id = o.user_id;
      insert into public.reward_transactions (user_id, points, reason, order_id) values (o.user_id, v_points, 'Order ' || o.order_number, o.id);
    end if;
    perform public.notify_admins('order_delivered', 'Order ' || o.order_number || ' delivered', 'Delivered successfully by the rider.', jsonb_build_object('order_id', o.id));
  end if;
  return v_points;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Wholesale placement (0045 body): cases are reserved, not deducted
-- ---------------------------------------------------------------------------
create or replace function public.admin_confirm_wholesale_order(p_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.wholesale_orders; v_shop public.kirana_shops; v_addr public.addresses; v_zone public.delivery_zones; v_pp jsonb := public.pickup_point();
  v_line record; v_inv public.inventory; v_order_id uuid; v_order_no text; v_otp text; v_fee numeric; v_tax numeric; v_total numeric; v_count int := 0;
  v_dist numeric := 0; v_rider numeric; v_hours jsonb := public.get_setting('business_hours'); v_start timestamptz; v_end timestamptz;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.wholesale_orders where id = p_id for update;
  if v_order.id is null then raise exception 'WHOLESALE: This order was not found.'; end if;
  if v_order.status <> 'approved' then raise exception 'WHOLESALE: Only an order the buyer has approved can be placed (this one is %).', v_order.status; end if;
  if v_order.has_unpriced then raise exception 'WHOLESALE: Set a wholesale price for every item first.'; end if;
  select * into v_shop from public.kirana_shops where id = v_order.shop_id;
  if v_shop.status <> 'approved' then raise exception 'WHOLESALE: Wholesale ordering is paused for this buyer.'; end if;
  select * into v_addr from public.addresses where id = v_shop.address_id;
  if v_addr.id is null then raise exception 'WHOLESALE: This buyer has no delivery address on file.'; end if;
  v_zone := public.find_zone(v_addr.pincode, v_addr.lat, v_addr.lng);
  if v_zone.id is null then raise exception 'WHOLESALE: The delivery address is outside the delivery area.'; end if;
  if v_addr.lat is not null and (v_pp ->> 'lat') is not null then
    v_dist := public.haversine_km(v_addr.lat, v_addr.lng, (v_pp ->> 'lat')::double precision, (v_pp ->> 'lng')::double precision);
  end if;

  v_fee := public.get_setting_num('wholesale_delivery_fee', 0);
  v_tax := round(v_fee * public.get_setting_num('tax_rate_percent', 18) / 100, 2);
  v_total := v_order.subtotal + v_fee + v_tax;
  v_rider := public.get_setting_num('rider_base_earning', 20) + ceil(v_dist) * public.get_setting_num('rider_per_km_earning', 5);
  v_start := (v_order.restock_date::text || ' ' || coalesce(v_hours ->> 'open', '09:00') || ':00')::timestamp at time zone 'Asia/Kolkata';
  v_end := (v_order.restock_date::text || ' ' || case when coalesce(v_hours ->> 'close', '21:00') = '24:00' then '23:59' else coalesce(v_hours ->> 'close', '21:00') end || ':00')::timestamp at time zone 'Asia/Kolkata';
  if v_end < now() then v_start := now(); v_end := now() + interval '4 hours'; end if;
  v_order_no := public.generate_order_number();
  v_otp := public.secure_otp4();

  insert into public.orders (order_number, user_id, zone_id, status, delivery_type, scheduled_slot_start, scheduled_slot_end, address_snapshot, delivery_lat, delivery_lng,
    delivery_instructions, payment_method, payment_status, subtotal, item_discount, coupon_discount, delivery_fee, platform_fee, tax_amount, total, rider_earning, item_count, eta_minutes, promised_at, channel, kirana_shop_id)
  values (v_order_no, v_shop.owner_id, v_zone.id, 'placed', 'scheduled', v_start, v_end, to_jsonb(v_addr) - 'user_id', v_addr.lat, v_addr.lng,
    'Wholesale order for ' || coalesce(v_shop.shop_name, v_shop.owner_name) || coalesce(' · ' || v_order.shop_note, ''), 'cod', 'cod_pending', v_order.subtotal, 0, 0, v_fee, 0, v_tax, v_total, v_rider, 0, greatest(1, extract(epoch from (v_end - now()))::int / 60), v_end, 'wholesale', v_shop.id)
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

-- ---------------------------------------------------------------------------
-- 12. Manual adjustment (0030 body) now goes through _inv_move
-- ---------------------------------------------------------------------------
create or replace function public.adjust_stock(p_inventory_id uuid, p_delta int, p_reason text default 'manual_adjust', p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.inventory where id = p_inventory_id) then raise exception 'NOT_FOUND'; end if;
  if coalesce(p_delta, 0) = 0 then return (select stock_qty from public.inventory where id = p_inventory_id); end if;
  r := public._inv_move(p_inventory_id, case when p_reason in ('restock', 'grn', 'stock_in') then 'receive' when p_reason in ('correction', 'count') then 'correction' else 'adjust' end,
    p_delta, 0, null, null, p_note, p_reason);
  return (r ->> 'available')::int;
end $$;

-- ---------------------------------------------------------------------------
-- 13. Admin reads
-- ---------------------------------------------------------------------------
/** Stock overview: available, reserved, physical per listing with search and filters; counts for the tabs. */
create or replace function public.admin_inventory_overview(p_q text default null, p_category uuid default null, p_filter text default null, p_limit int default 25, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return (
    with base as (
      select i.id, i.product_id, p.name, p.slug, p.pack_label, p.image_url, b.name as brand_name, c.name as category_name, c.id as category_id,
             i.stock_qty as available, i.reserved_qty as reserved, i.stock_qty + i.reserved_qty as physical, i.low_stock_threshold, i.status::text as status, i.is_active,
             i.selling_price, i.avg_cost, i.updated_at,
             (select max(pb.created_at) from public.inventory_passbook pb where pb.inventory_id = i.id) as last_move_at,
             (select count(*) from public.orders o join public.order_items oi on oi.order_id = o.id where oi.inventory_id = i.id and o.stock_state = 'reserved') as open_orders
      from public.inventory i join public.products p on p.id = i.product_id
      left join public.brands b on b.id = p.brand_id left join public.categories c on c.id = p.category_id
      where (v_q is null or p.name ilike '%' || v_q || '%' or coalesce(p.sku, '') ilike '%' || v_q || '%' or coalesce(b.name, '') ilike '%' || v_q || '%')
        and (p_category is null or c.id = p_category or c.parent_id = p_category)
    ), filtered as (
      select * from base
      where p_filter is null or p_filter = ''
         or (p_filter = 'low' and available > 0 and available <= low_stock_threshold)
         or (p_filter = 'out' and available <= 0)
         or (p_filter = 'reserved' and reserved > 0)
         or (p_filter = 'paused' and not is_active)
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(f) order by case when f.available <= 0 then 0 when f.available <= f.low_stock_threshold then 1 else 2 end, f.name)
                        from (select * from filtered order by case when available <= 0 then 0 when available <= low_stock_threshold then 1 else 2 end, name limit p_limit offset p_offset) f), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'counts', jsonb_build_object(
        'all', (select count(*) from base),
        'low', (select count(*) from base where available > 0 and available <= low_stock_threshold),
        'out', (select count(*) from base where available <= 0),
        'reserved', (select count(*) from base where reserved > 0),
        'paused', (select count(*) from base where not is_active)),
      'totals', jsonb_build_object(
        'available', (select coalesce(sum(available), 0) from base),
        'reserved', (select coalesce(sum(reserved), 0) from base),
        'physical', (select coalesce(sum(physical), 0) from base),
        'low', (select count(*) from base where available > 0 and available <= low_stock_threshold),
        'out', (select count(*) from base where available <= 0))
    ));
end $$;
revoke all on function public.admin_inventory_overview(text, uuid, text, int, int) from public, anon;
grant execute on function public.admin_inventory_overview(text, uuid, text, int, int) to authenticated;

/** Passbook pages, newest first; p_inventory_id narrows to one listing, p_kind to one movement type. */
create or replace function public.admin_inventory_passbook(p_inventory_id uuid default null, p_kind text default null, p_q text default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return (
    with rows as (
      select pb.*, p.name as product_name, p.pack_label, p.image_url, o.order_number
      from public.inventory_passbook pb
      left join public.products p on p.id = pb.product_id
      left join public.orders o on o.id = pb.order_id
      where (p_inventory_id is null or pb.inventory_id = p_inventory_id)
        and (p_kind is null or p_kind = '' or pb.kind = p_kind)
        and (v_q is null or p.name ilike '%' || v_q || '%' or o.order_number ilike '%' || v_q || '%' or coalesce(pb.note, '') ilike '%' || v_q || '%')
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.id desc) from (select * from rows order by id desc limit p_limit offset p_offset) r), '[]'::jsonb),
      'total', (select count(*) from rows)));
end $$;
revoke all on function public.admin_inventory_passbook(uuid, text, text, int, int) from public, anon;
grant execute on function public.admin_inventory_passbook(uuid, text, text, int, int) to authenticated;
