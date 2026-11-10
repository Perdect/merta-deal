-- Wholesale (open to every customer): anyone signed in with a mobile number can order full cases at
-- wholesale prices, now or every month. A buyer row (kirana_shops; shop_name is optional) is created on
-- first use from the profile and default address. "Order now" creates an approved wholesale order; a
-- monthly restock list raises a proposal before each restock date that the buyer reviews and approves.
-- Only then does an admin turn it into a real order that the normal packing, rider and OTP flow delivers,
-- paid on delivery. Nothing is placed or charged without the buyer's approval. Prices are set per product
-- by an admin; a product without a wholesale price shows "quote required" and can never be approved.

insert into public.settings (key, value, "group", label, description, is_public) values
  ('wholesale_enabled', 'true', 'wholesale', 'Wholesale ordering', 'Any signed-in customer can order full cases at wholesale prices and keep a monthly restock list.', true),
  ('wholesale_min_order_amount', '0', 'wholesale', 'Wholesale minimum order (₹)', 'A wholesale order below this amount cannot be approved. 0 = no minimum.', true),
  ('wholesale_review_lead_days', '2', 'wholesale', 'Review lead time (days)', 'How many days before the restock date the buyer is asked to review the monthly order.', true),
  ('wholesale_delivery_fee', '0', 'wholesale', 'Wholesale delivery fee (₹)', 'Flat delivery fee added to a wholesale order. 0 until you set one.', true)
on conflict (key) do nothing;

alter table public.orders add column if not exists channel text not null default 'retail' check (channel in ('retail', 'wholesale'));

create table public.kirana_shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  /** Null for a household buyer; set when the buyer runs a shop (shown on bills with the GSTIN). */
  shop_name text check (shop_name is null or length(btrim(shop_name)) between 2 and 120),
  owner_name text not null check (length(btrim(owner_name)) between 2 and 80),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  address_id uuid references public.addresses(id) on delete set null,
  monthly_needs text check (monthly_needs is null or length(monthly_needs) <= 1000),
  status text not null default 'approved' check (status in ('approved', 'suspended')),
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders add column if not exists kirana_shop_id uuid references public.kirana_shops(id) on delete set null;
create index orders_kirana_shop_idx on public.orders(kirana_shop_id) where kirana_shop_id is not null;

create table public.wholesale_products (
  product_id uuid primary key references public.products(id) on delete cascade,
  case_size int not null check (case_size >= 1),
  moq_cases int not null default 1 check (moq_cases >= 1),
  max_cases int check (max_cases is null or max_cases >= moq_cases),
  /** Null = no wholesale price set yet: the product shows as "quote required" and cannot be approved. */
  price_per_case numeric(12,2) check (price_per_case is null or price_per_case > 0),
  is_available boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.wholesale_lists (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references public.kirana_shops(id) on delete cascade,
  name text not null default 'Monthly restock',
  restock_day int not null check (restock_day between 1 and 28),
  next_run_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.wholesale_list_items (
  list_id uuid not null references public.wholesale_lists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  cases int not null check (cases >= 1),
  primary key (list_id, product_id)
);

create table public.wholesale_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.kirana_shops(id) on delete cascade,
  list_id uuid references public.wholesale_lists(id) on delete set null,
  restock_date date not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'placed', 'declined', 'cancelled', 'expired')),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  has_unpriced boolean not null default false,
  shop_note text,
  admin_note text,
  order_id uuid unique references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  placed_at timestamptz,
  placed_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (list_id, restock_date)
);
create index wholesale_orders_status_idx on public.wholesale_orders(status, restock_date);

alter table public.kirana_shops enable row level security;
alter table public.wholesale_products enable row level security;
alter table public.wholesale_lists enable row level security;
alter table public.wholesale_list_items enable row level security;
alter table public.wholesale_orders enable row level security;
create policy kirana_shops_read on public.kirana_shops for select using (owner_id = auth.uid() or public.is_admin());
create policy wholesale_products_admin_read on public.wholesale_products for select using (public.is_admin());
create policy wholesale_lists_read on public.wholesale_lists for select using (public.is_admin() or exists (select 1 from public.kirana_shops s where s.id = shop_id and s.owner_id = auth.uid()));
create policy wholesale_list_items_read on public.wholesale_list_items for select using (public.is_admin() or exists (select 1 from public.wholesale_lists l join public.kirana_shops s on s.id = l.shop_id where l.id = list_id and s.owner_id = auth.uid()));
create policy wholesale_orders_read on public.wholesale_orders for select using (public.is_admin() or exists (select 1 from public.kirana_shops s where s.id = shop_id and s.owner_id = auth.uid()));

/** The caller's wholesale buyer row, or null (read-only). */
create or replace function public._my_shop()
returns public.kirana_shops language sql stable security definer set search_path = public as $$
  select s.* from public.kirana_shops s where s.owner_id = auth.uid()
$$;
revoke all on function public._my_shop() from public, anon, authenticated;

/**
 * The caller's wholesale buyer row, created on first use from the profile and the default address.
 * Anyone signed in with a mobile number may buy wholesale; an admin can only pause a buyer.
 */
create or replace function public._ensure_wholesale_buyer()
returns public.kirana_shops language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_shop public.kirana_shops; v_prof public.profiles; v_addr public.addresses;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.get_setting_bool('wholesale_enabled', true) then raise exception 'WHOLESALE: Wholesale ordering is closed right now.'; end if;
  select * into v_shop from public.kirana_shops where owner_id = v_uid;
  if v_shop.id is not null then
    if v_shop.status <> 'approved' then raise exception 'WHOLESALE: Wholesale ordering is paused for your account. Call us to resume.'; end if;
    if v_shop.address_id is null then
      select * into v_addr from public.addresses where user_id = v_uid order by is_default desc, id limit 1;
      if v_addr.id is not null then update public.kirana_shops set address_id = v_addr.id, updated_at = now() where id = v_shop.id returning * into v_shop; end if;
    end if;
    return v_shop;
  end if;
  select * into v_prof from public.profiles where id = v_uid;
  if coalesce(v_prof.is_guest, false) then raise exception 'WHOLESALE: Please sign in with your mobile number to order wholesale.'; end if;
  select * into v_addr from public.addresses where user_id = v_uid order by is_default desc, id limit 1;
  begin
    insert into public.kirana_shops (owner_id, owner_name, phone, address_id)
    values (v_uid,
      left(coalesce(nullif(btrim(coalesce(v_prof.full_name, '')), ''), nullif(btrim(coalesce(v_addr.full_name, '')), ''), 'Customer'), 80),
      coalesce(nullif(right(regexp_replace(coalesce(v_prof.phone, ''), '\D', '', 'g'), 10), ''), v_addr.phone),
      v_addr.id)
    returning * into v_shop;
  exception when check_violation or not_null_violation then
    raise exception 'WHOLESALE: Add your mobile number under Account → Profile first.';
  end;
  return v_shop;
end $$;
revoke all on function public._ensure_wholesale_buyer() from public, anon, authenticated;

/** Next restock date strictly after p_from for a day of month (1–28). */
create or replace function public._next_restock_date(p_day int, p_from date default current_date)
returns date language sql immutable as $$
  select case when make_date(extract(year from p_from)::int, extract(month from p_from)::int, p_day) > p_from
    then make_date(extract(year from p_from)::int, extract(month from p_from)::int, p_day)
    else (make_date(extract(year from p_from)::int, extract(month from p_from)::int, 1) + interval '1 month' + make_interval(days => p_day - 1))::date end
$$;

/** Optional wholesale details: shop name + GSTIN (for shops), contact name and phone, delivery address, monthly needs. Never changes the status. */
create or replace function public.save_wholesale_profile(p_shop_name text default null, p_owner_name text default null, p_phone text default null, p_gstin text default null, p_address_id uuid default null, p_monthly_needs text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_shop public.kirana_shops := public._ensure_wholesale_buyer(); v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_gstin text := nullif(upper(btrim(coalesce(p_gstin, ''))), ''); v_name text := nullif(btrim(coalesce(p_shop_name, '')), ''); v_owner text := nullif(btrim(coalesce(p_owner_name, '')), '');
begin
  if nullif(p_phone, '') is not null and v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'WHOLESALE: Enter a valid 10-digit mobile number.'; end if;
  if v_name is not null and length(v_name) < 2 then raise exception 'WHOLESALE: Enter the shop name.'; end if;
  if v_owner is not null and length(v_owner) < 2 then raise exception 'WHOLESALE: Enter your name.'; end if;
  if v_gstin is not null and v_gstin !~ '^[0-9]{2}[A-Z0-9]{13}$' then raise exception 'WHOLESALE: That GSTIN does not look right (15 characters).'; end if;
  if p_address_id is not null and not exists (select 1 from public.addresses where id = p_address_id and user_id = auth.uid()) then raise exception 'WHOLESALE: Pick one of your saved addresses.'; end if;
  update public.kirana_shops set shop_name = v_name, owner_name = coalesce(v_owner, owner_name), phone = case when nullif(p_phone, '') is null then phone else v_phone end,
    gstin = v_gstin, address_id = coalesce(p_address_id, address_id), monthly_needs = nullif(btrim(coalesce(p_monthly_needs, '')), ''), updated_at = now()
   where id = v_shop.id returning * into v_shop;
  perform public.audit('wholesale.profile.save', 'kirana_shops', v_shop.id::text, null, jsonb_build_object('shop_name', v_shop.shop_name, 'gstin', v_shop.gstin));
  return to_jsonb(v_shop);
end $$;
revoke all on function public.save_wholesale_profile(text, text, text, text, uuid, text) from public, anon;
grant execute on function public.save_wholesale_profile(text, text, text, text, uuid, text) to authenticated;

/** Admin: pause ('suspended') or resume ('approved') a buyer's wholesale ordering, with a note that is sent to them. */
create or replace function public.admin_review_kirana_shop(p_shop_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_shop public.kirana_shops;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('approved', 'suspended') then raise exception 'WHOLESALE: Choose approved or suspended.'; end if;
  update public.kirana_shops set status = p_status, review_note = nullif(btrim(coalesce(p_note, '')), ''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_shop_id returning * into v_shop;
  if v_shop.id is null then raise exception 'WHOLESALE: This buyer no longer exists.'; end if;
  perform public.notify_user(v_shop.owner_id, 'kirana_shop',
    case p_status when 'approved' then 'Wholesale ordering resumed' else 'Wholesale ordering paused' end,
    case p_status when 'approved' then coalesce(v_shop.review_note, 'You can order wholesale again under Account → Wholesale.')
      else coalesce(v_shop.review_note, 'Wholesale ordering for your account is paused. Call us for details.') end,
    jsonb_build_object('shop_id', v_shop.id, 'status', p_status));
  perform public.audit('wholesale.shop.review', 'kirana_shops', v_shop.id::text, null, jsonb_build_object('status', p_status));
  return to_jsonb(v_shop);
end $$;
revoke all on function public.admin_review_kirana_shop(uuid, text, text) from public, anon;
grant execute on function public.admin_review_kirana_shop(uuid, text, text) to authenticated;

create or replace function public.admin_set_wholesale_product(p_product_id uuid, p_case_size int, p_moq_cases int default 1, p_max_cases int default null, p_price_per_case numeric default null, p_is_available boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.wholesale_products;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.products where id = p_product_id) then raise exception 'WHOLESALE: This product no longer exists.'; end if;
  if coalesce(p_case_size, 0) < 1 then raise exception 'WHOLESALE: Case size must be at least 1 unit.'; end if;
  if coalesce(p_moq_cases, 0) < 1 then raise exception 'WHOLESALE: Minimum order must be at least 1 case.'; end if;
  if p_max_cases is not null and p_max_cases < p_moq_cases then raise exception 'WHOLESALE: Maximum cases cannot be below the minimum.'; end if;
  if p_price_per_case is not null and p_price_per_case <= 0 then raise exception 'WHOLESALE: Enter a price above zero, or leave it empty for "quote required".'; end if;
  insert into public.wholesale_products (product_id, case_size, moq_cases, max_cases, price_per_case, is_available, updated_by, updated_at)
  values (p_product_id, p_case_size, p_moq_cases, p_max_cases, p_price_per_case, coalesce(p_is_available, true), auth.uid(), now())
  on conflict (product_id) do update set case_size = excluded.case_size, moq_cases = excluded.moq_cases, max_cases = excluded.max_cases,
    price_per_case = excluded.price_per_case, is_available = excluded.is_available, updated_by = auth.uid(), updated_at = now()
  returning * into v_row;
  perform public.audit('wholesale.product.set', 'wholesale_products', p_product_id::text, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end $$;
revoke all on function public.admin_set_wholesale_product(uuid, int, int, int, numeric, boolean) from public, anon;
grant execute on function public.admin_set_wholesale_product(uuid, int, int, int, numeric, boolean) to authenticated;

create or replace function public.admin_remove_wholesale_product(p_product_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  delete from public.wholesale_list_items where product_id = p_product_id;
  delete from public.wholesale_products where product_id = p_product_id;
  perform public.audit('wholesale.product.remove', 'wholesale_products', p_product_id::text, null, '{}'::jsonb);
end $$;
revoke all on function public.admin_remove_wholesale_product(uuid) from public, anon;
grant execute on function public.admin_remove_wholesale_product(uuid) to authenticated;

/** Wholesale catalogue: range, case sizes, wholesale prices (public), "quote required" flags and stock in whole cases. */
create or replace function public.wholesale_catalogue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prices boolean := true;
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'name', p.name, 'slug', p.slug, 'image_url', p.image_url, 'pack_label', p.pack_label, 'brand_name', b.name,
      'category', c.name, 'case_size', w.case_size, 'moq_cases', w.moq_cases, 'max_cases', w.max_cases,
      'quote_required', w.price_per_case is null,
      'price_per_case', case when v_prices then w.price_per_case end,
      'unit_price', case when v_prices and w.price_per_case is not null then round(w.price_per_case / w.case_size, 2) end,
      'retail_price', case when v_prices then i.selling_price end,
      'mrp', i.mrp,
      'is_available', w.is_available and coalesce(i.is_active, false) and p.is_active,
      'in_stock_cases', floor(coalesce(i.stock_qty, 0) / w.case_size)::int
    ) order by w.is_available desc, c.name, p.name)
    from public.wholesale_products w
    join public.products p on p.id = w.product_id and p.is_active
    left join public.inventory i on i.product_id = p.id
    left join public.brands b on b.id = p.brand_id
    left join public.categories c on c.id = p.category_id), '[]'::jsonb);
end $$;
revoke all on function public.wholesale_catalogue() from public;
grant execute on function public.wholesale_catalogue() to anon, authenticated;

/** Snapshot of list items at today's wholesale prices: lines, subtotal, and whether any line still needs a quote. */
create or replace function public._wholesale_snapshot(p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_lines jsonb; v_sub numeric := 0; v_unpriced boolean := false; v_item record; v_w public.wholesale_products; v_p public.products;
begin
  v_lines := '[]'::jsonb;
  for v_item in select (e ->> 'product_id')::uuid as product_id, (e ->> 'cases')::int as cases from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e loop
    if v_item.product_id is null or coalesce(v_item.cases, 0) < 1 then continue; end if;
    select * into v_w from public.wholesale_products where product_id = v_item.product_id;
    select * into v_p from public.products where id = v_item.product_id;
    if v_w.product_id is null or v_p.id is null then raise exception 'WHOLESALE: % is not sold wholesale any more.', coalesce(v_p.name, 'A product'); end if;
    if not v_w.is_available or not v_p.is_active then raise exception 'WHOLESALE: % is not available right now. Remove it to continue.', v_p.name; end if;
    if v_item.cases < v_w.moq_cases then raise exception 'WHOLESALE: Minimum for % is % case(s).', v_p.name, v_w.moq_cases; end if;
    if v_w.max_cases is not null and v_item.cases > v_w.max_cases then raise exception 'WHOLESALE: Maximum for % is % case(s).', v_p.name, v_w.max_cases; end if;
    if v_w.price_per_case is null then v_unpriced := true; else v_sub := v_sub + v_item.cases * v_w.price_per_case; end if;
    v_lines := v_lines || jsonb_build_object('product_id', v_p.id, 'name', v_p.name, 'pack_label', v_p.pack_label, 'image_url', v_p.image_url,
      'cases', v_item.cases, 'case_size', v_w.case_size, 'units', v_item.cases * v_w.case_size,
      'price_per_case', v_w.price_per_case, 'line_total', case when v_w.price_per_case is null then null else round(v_item.cases * v_w.price_per_case, 2) end);
  end loop;
  return jsonb_build_object('items', v_lines, 'subtotal', round(v_sub, 2), 'has_unpriced', v_unpriced, 'line_count', jsonb_array_length(v_lines));
end $$;
revoke all on function public._wholesale_snapshot(jsonb) from public, anon, authenticated;

create or replace function public.save_wholesale_list(p_restock_day int, p_items jsonb, p_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_shop public.kirana_shops := public._ensure_wholesale_buyer(); v_list public.wholesale_lists; v_snap jsonb; v_item record;
begin
  if p_restock_day is null or p_restock_day not between 1 and 28 then raise exception 'WHOLESALE: Pick a restock day between 1 and 28.'; end if;
  v_snap := public._wholesale_snapshot(p_items);
  if (v_snap ->> 'line_count')::int = 0 then raise exception 'WHOLESALE: Add at least one product to the list.'; end if;
  insert into public.wholesale_lists (shop_id, name, restock_day, next_run_date)
  values (v_shop.id, coalesce(nullif(btrim(coalesce(p_name, '')), ''), 'Monthly restock'), p_restock_day, public._next_restock_date(p_restock_day))
  on conflict (shop_id) do update set name = excluded.name, restock_day = excluded.restock_day, is_active = true,
    next_run_date = case when public.wholesale_lists.restock_day = excluded.restock_day then public.wholesale_lists.next_run_date else excluded.next_run_date end, updated_at = now()
  returning * into v_list;
  delete from public.wholesale_list_items where list_id = v_list.id;
  for v_item in select (e ->> 'product_id')::uuid as product_id, (e ->> 'cases')::int as cases from jsonb_array_elements(v_snap -> 'items') e loop
    insert into public.wholesale_list_items (list_id, product_id, cases) values (v_list.id, v_item.product_id, v_item.cases);
  end loop;
  return to_jsonb(v_list) || jsonb_build_object('snapshot', v_snap);
end $$;
revoke all on function public.save_wholesale_list(int, jsonb, text) from public, anon;
grant execute on function public.save_wholesale_list(int, jsonb, text) to authenticated;

create or replace function public.pause_wholesale_list(p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_shop public.kirana_shops := public._ensure_wholesale_buyer();
begin
  update public.wholesale_lists set is_active = coalesce(p_active, true), updated_at = now() where shop_id = v_shop.id;
end $$;
revoke all on function public.pause_wholesale_list(boolean) from public, anon;
grant execute on function public.pause_wholesale_list(boolean) to authenticated;

/** Raise a proposal from a list for a restock date (idempotent per list + date). Returns the proposal. */
create or replace function public._propose_from_list(p_list public.wholesale_lists, p_restock_date date, p_notify boolean)
returns public.wholesale_orders language plpgsql security definer set search_path = public as $$
declare v_items jsonb; v_snap jsonb; v_order public.wholesale_orders; v_shop public.kirana_shops;
begin
  select * into v_order from public.wholesale_orders where list_id = p_list.id and restock_date = p_restock_date;
  if v_order.id is not null then return v_order; end if;
  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'cases', cases)), '[]'::jsonb) into v_items from public.wholesale_list_items where list_id = p_list.id;
  v_snap := public._wholesale_snapshot(v_items);
  select * into v_shop from public.kirana_shops where id = p_list.shop_id;
  insert into public.wholesale_orders (shop_id, list_id, restock_date, status, items, subtotal, delivery_fee, has_unpriced)
  values (p_list.shop_id, p_list.id, p_restock_date, 'proposed', v_snap -> 'items', (v_snap ->> 'subtotal')::numeric, public.get_setting_num('wholesale_delivery_fee', 0), (v_snap ->> 'has_unpriced')::boolean)
  returning * into v_order;
  if p_notify then
    perform public.notify_user(v_shop.owner_id, 'wholesale_review', 'Review your restock order',
      format('Your %s order for %s is ready. Check the quantities and approve it; nothing is placed until you do.', p_list.name, to_char(p_restock_date, 'DD Mon')),
      jsonb_build_object('wholesale_order_id', v_order.id, 'restock_date', p_restock_date));
  end if;
  return v_order;
end $$;
revoke all on function public._propose_from_list(public.wholesale_lists, date, boolean) from public, anon, authenticated;

/** Buyer: "Review now" — raises (or returns) the proposal for the next restock date. */
create or replace function public.propose_wholesale_order()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_shop public.kirana_shops := public._ensure_wholesale_buyer(); v_list public.wholesale_lists; v_order public.wholesale_orders;
begin
  select * into v_list from public.wholesale_lists where shop_id = v_shop.id;
  if v_list.id is null then raise exception 'WHOLESALE: Save your monthly restock list first.'; end if;
  v_order := public._propose_from_list(v_list, v_list.next_run_date, false);
  return to_jsonb(v_order);
end $$;
revoke all on function public.propose_wholesale_order() from public, anon;
grant execute on function public.propose_wholesale_order() to authenticated;

/** Cron (service role): raise proposals lead-days before each active list's restock date; expire stale proposals. */
create or replace function public.generate_wholesale_proposals()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_list public.wholesale_lists; v_lead int := public.get_setting_num('wholesale_review_lead_days', 2)::int; v_raised int := 0; v_expired int := 0;
begin
  if not (public.is_admin() or current_setting('request.jwt.claim.role', true) = 'service_role' or auth.uid() is null) then raise exception 'FORBIDDEN'; end if;
  if not public.get_setting_bool('wholesale_enabled', true) then return jsonb_build_object('raised', 0, 'expired', 0, 'enabled', false); end if;
  for v_list in select l.* from public.wholesale_lists l join public.kirana_shops s on s.id = l.shop_id
      where l.is_active and s.status = 'approved' and l.next_run_date - v_lead <= current_date
        and not exists (select 1 from public.wholesale_orders o where o.list_id = l.id and o.restock_date = l.next_run_date) loop
    perform public._propose_from_list(v_list, v_list.next_run_date, true);
    v_raised := v_raised + 1;
  end loop;
  -- A proposal nobody approved by the day after its restock date lapses; the list simply moves to next month.
  with gone as (
    update public.wholesale_orders o set status = 'expired', updated_at = now()
     where o.status = 'proposed' and o.restock_date < current_date returning o.list_id, o.restock_date
  ), moved as (
    update public.wholesale_lists l set next_run_date = public._next_restock_date(l.restock_day, g.restock_date), updated_at = now()
      from gone g where g.list_id = l.id and l.next_run_date = g.restock_date returning l.id
  )
  select count(*) into v_expired from gone;
  return jsonb_build_object('raised', v_raised, 'expired', v_expired, 'enabled', true);
end $$;
revoke all on function public.generate_wholesale_proposals() from public, anon;
grant execute on function public.generate_wholesale_proposals() to authenticated, service_role;

/** Buyer reviews a proposal: approve (optionally with edited quantities) or skip this month. */
create or replace function public.shop_review_wholesale_order(p_id uuid, p_action text, p_items jsonb default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_shop public.kirana_shops := public._ensure_wholesale_buyer(); v_order public.wholesale_orders; v_snap jsonb; v_min numeric := public.get_setting_num('wholesale_min_order_amount', 0);
begin
  select * into v_order from public.wholesale_orders where id = p_id and shop_id = v_shop.id for update;
  if v_order.id is null then raise exception 'WHOLESALE: This order was not found.'; end if;
  if v_order.status <> 'proposed' then raise exception 'WHOLESALE: This order has already been %.', v_order.status; end if;
  if p_action = 'skip' then
    update public.wholesale_orders set status = 'declined', shop_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now() where id = p_id returning * into v_order;
    update public.wholesale_lists set next_run_date = public._next_restock_date(restock_day, v_order.restock_date), updated_at = now() where id = v_order.list_id and next_run_date = v_order.restock_date;
    return to_jsonb(v_order);
  end if;
  if p_action <> 'approve' then raise exception 'WHOLESALE: Choose approve or skip.'; end if;
  v_snap := public._wholesale_snapshot(coalesce(p_items, (select jsonb_agg(jsonb_build_object('product_id', e ->> 'product_id', 'cases', e ->> 'cases')) from jsonb_array_elements(v_order.items) e)));
  if (v_snap ->> 'line_count')::int = 0 then raise exception 'WHOLESALE: Keep at least one product, or skip this month.'; end if;
  if (v_snap ->> 'has_unpriced')::boolean then raise exception 'WHOLESALE: Some items are still waiting for a wholesale price. Remove them or wait for the quote.'; end if;
  if (v_snap ->> 'subtotal')::numeric < v_min then raise exception 'WHOLESALE: The minimum wholesale order is ₹%.', v_min; end if;
  update public.wholesale_orders set status = 'approved', items = v_snap -> 'items', subtotal = (v_snap ->> 'subtotal')::numeric, has_unpriced = false,
    delivery_fee = public.get_setting_num('wholesale_delivery_fee', 0), shop_note = nullif(btrim(coalesce(p_note, '')), ''), approved_at = now(), updated_at = now()
   where id = p_id returning * into v_order;
  perform public.notify_admins('wholesale_approved', 'Wholesale order approved: ' || coalesce(v_shop.shop_name, v_shop.owner_name),
    format('%s approved the monthly order for %s (₹%s). Confirm it under Wholesale to place it.', coalesce(v_shop.shop_name, v_shop.owner_name), to_char(v_order.restock_date, 'DD Mon'), to_char(v_order.subtotal, 'FM9999990.00')),
    jsonb_build_object('wholesale_order_id', v_order.id, 'shop_id', v_shop.id));
  perform public.audit('wholesale.order.approve', 'wholesale_orders', v_order.id::text, null, jsonb_build_object('subtotal', v_order.subtotal));
  return to_jsonb(v_order);
end $$;
revoke all on function public.shop_review_wholesale_order(uuid, text, jsonb, text) from public, anon;
grant execute on function public.shop_review_wholesale_order(uuid, text, jsonb, text) to authenticated;

/** Buyer: order full cases now, no monthly list needed. Creates an approved wholesale order that an admin confirms and places. */
create or replace function public.order_wholesale_now(p_items jsonb, p_note text default null, p_delivery_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_shop public.kirana_shops := public._ensure_wholesale_buyer(); v_snap jsonb; v_order public.wholesale_orders;
  v_min numeric := public.get_setting_num('wholesale_min_order_amount', 0); v_date date := coalesce(p_delivery_date, current_date);
begin
  if v_shop.address_id is null then raise exception 'WHOLESALE: Add a delivery address first.'; end if;
  if v_date < current_date then raise exception 'WHOLESALE: Pick today or a later date.'; end if;
  if v_date > current_date + 30 then raise exception 'WHOLESALE: Pick a date within the next 30 days.'; end if;
  v_snap := public._wholesale_snapshot(p_items);
  if (v_snap ->> 'line_count')::int = 0 then raise exception 'WHOLESALE: Add at least one product.'; end if;
  if (v_snap ->> 'has_unpriced')::boolean then raise exception 'WHOLESALE: Some items are still waiting for a wholesale price. Remove them or call us for a quote.'; end if;
  if (v_snap ->> 'subtotal')::numeric < v_min then raise exception 'WHOLESALE: The minimum wholesale order is ₹%.', v_min; end if;
  insert into public.wholesale_orders (shop_id, restock_date, status, items, subtotal, delivery_fee, has_unpriced, shop_note, approved_at)
  values (v_shop.id, v_date, 'approved', v_snap -> 'items', (v_snap ->> 'subtotal')::numeric, public.get_setting_num('wholesale_delivery_fee', 0), false, nullif(btrim(coalesce(p_note, '')), ''), now())
  returning * into v_order;
  perform public.notify_admins('wholesale_approved', 'Wholesale order: ' || coalesce(v_shop.shop_name, v_shop.owner_name),
    format('%s ordered wholesale for %s (₹%s). Confirm it under Wholesale to place it.', coalesce(v_shop.shop_name, v_shop.owner_name), to_char(v_date, 'DD Mon'), to_char(v_order.subtotal, 'FM9999990.00')),
    jsonb_build_object('wholesale_order_id', v_order.id, 'shop_id', v_shop.id));
  perform public.audit('wholesale.order.now', 'wholesale_orders', v_order.id::text, null, jsonb_build_object('subtotal', v_order.subtotal));
  return to_jsonb(v_order);
end $$;
revoke all on function public.order_wholesale_now(jsonb, text, date) from public, anon;
grant execute on function public.order_wholesale_now(jsonb, text, date) to authenticated;

/** Admin: turn an approved wholesale order into a real order (pay on delivery) that the normal flow fulfils. */
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
  -- Delivery window: the restock date within business hours (a window, not a promise of a minute).
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
    if v_inv.stock_qty < v_line.units then raise exception 'WHOLESALE: Not enough stock for % (% units needed, % in stock). Receive stock first or ask the buyer to reduce it.', v_line.name, v_line.units, v_inv.stock_qty; end if;
    insert into public.order_items (order_id, product_id, inventory_id, product_name, brand_name, pack_label, image_url, quantity, unit_price, unit_mrp, line_total)
    select v_order_id, p.id, v_inv.id, p.name, b.name, coalesce(p.pack_label, '') || ' × ' || v_line.case_size || ' (case)', p.image_url, v_line.units, round(v_line.price_per_case / v_line.case_size, 2), v_inv.mrp, round(v_line.cases * v_line.price_per_case, 2)
      from public.products p left join public.brands b on b.id = p.brand_id where p.id = v_line.product_id;
    update public.inventory set stock_qty = stock_qty - v_line.units, sold_count = sold_count + v_line.units where id = v_inv.id;
    insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_inv.id, -v_line.units, 'order', v_order_id, auth.uid());
    v_count := v_count + v_line.units;
  end loop;
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

create or replace function public.admin_cancel_wholesale_order(p_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.wholesale_orders; v_shop public.kirana_shops;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.wholesale_orders where id = p_id for update;
  if v_order.id is null then raise exception 'WHOLESALE: This order was not found.'; end if;
  if v_order.status not in ('proposed', 'approved') then raise exception 'WHOLESALE: A % order cannot be cancelled here.', v_order.status; end if;
  update public.wholesale_orders set status = 'cancelled', admin_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now() where id = p_id returning * into v_order;
  update public.wholesale_lists set next_run_date = public._next_restock_date(restock_day, v_order.restock_date), updated_at = now() where id = v_order.list_id and next_run_date = v_order.restock_date;
  select * into v_shop from public.kirana_shops where id = v_order.shop_id;
  perform public.notify_user(v_shop.owner_id, 'wholesale_review', 'Restock order cancelled', coalesce(v_order.admin_note, 'Your restock order for ' || to_char(v_order.restock_date, 'DD Mon') || ' was cancelled. Call us if you have questions.'), jsonb_build_object('wholesale_order_id', v_order.id));
  return to_jsonb(v_order);
end $$;
revoke all on function public.admin_cancel_wholesale_order(uuid, text) from public, anon;
grant execute on function public.admin_cancel_wholesale_order(uuid, text) to authenticated;

/** Everything the buyer's wholesale page needs in one call (shop is null until the first list or order). */
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
    'orders', coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object('order_number', (select order_number from public.orders x where x.id = o.order_id), 'order_status', (select status::text from public.orders x where x.id = o.order_id)) order by o.restock_date desc, o.created_at desc)
      from (select * from public.wholesale_orders where shop_id = v_shop.id order by restock_date desc limit 24) o), '[]'::jsonb),
    'settings', jsonb_build_object('min_order_amount', public.get_setting_num('wholesale_min_order_amount', 0), 'delivery_fee', public.get_setting_num('wholesale_delivery_fee', 0), 'lead_days', public.get_setting_num('wholesale_review_lead_days', 2))
  );
end $$;
revoke all on function public.my_kirana_shop() from public, anon;
grant execute on function public.my_kirana_shop() to authenticated;

/** Admin overview: buyers, orders needing attention, wholesale product rows. */
create or replace function public.admin_wholesale_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'shops', coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('address', (select to_jsonb(a) from public.addresses a where a.id = s.address_id),
        'list', (select to_jsonb(l) from public.wholesale_lists l where l.shop_id = s.id),
        'orders_placed', (select count(*) from public.wholesale_orders o where o.shop_id = s.id and o.status = 'placed')) order by s.created_at desc) from public.kirana_shops s), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object('shop_name', s.shop_name, 'shop_phone', s.phone, 'owner_name', s.owner_name,
        'order_number', (select order_number from public.orders x where x.id = o.order_id), 'order_status', (select status::text from public.orders x where x.id = o.order_id)) order by case o.status when 'approved' then 0 when 'proposed' then 1 else 2 end, o.restock_date desc)
      from (select * from public.wholesale_orders order by created_at desc limit 200) o join public.kirana_shops s on s.id = o.shop_id), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(w) || jsonb_build_object('name', p.name, 'pack_label', p.pack_label, 'image_url', p.image_url, 'retail_price', i.selling_price, 'stock_qty', i.stock_qty, 'product_active', p.is_active) order by p.name)
      from public.wholesale_products w join public.products p on p.id = w.product_id left join public.inventory i on i.product_id = p.id), '[]'::jsonb),
    'counts', jsonb_build_object('buyers', (select count(*) from public.kirana_shops), 'approved_orders', (select count(*) from public.wholesale_orders where status = 'approved'))
  );
end $$;
revoke all on function public.admin_wholesale_overview() from public, anon;
grant execute on function public.admin_wholesale_overview() to authenticated;
