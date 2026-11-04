-- ============================================================================
-- MERTA DEAL — QR / barcode scanning for stock, packing and delivery.
--
-- Identity: every product row (each size is its own row, see 0033) gets a stable scan_code and a SKU;
-- products.barcode holds a real printed EAN/UPC where there is one. Every order gets a scan_code.
-- A code is only an identifier: it carries no price, customer detail or secret, and every lookup
-- checks the caller's role here, on the server.
--
-- Loose produce: stock_pools holds one balance in grams shared by the sizes of a product. The pool is
-- the truth; inventory.stock_qty of a pooled row is the number of packs that balance can fill, so the
-- cart, place_order, cancel_order and fulfil_order keep working on stock_qty unchanged, and a 500 g
-- and a 1 kg order draw from the same balance. Prepacked products keep their own count in packs.
--
-- Locking: every statement that changes inventory.stock_qty first takes one transaction advisory lock
-- (see stock_lock_trg). A sale of one size rewrites its sibling sizes, so without a single lock taken
-- before any row lock, two concurrent orders for different sizes could deadlock.
--
-- Stock is deducted once, by place_order. Packing counts items and never touches stock. Delivered is
-- still reached only through verify_delivery_otp / admin_confirm_delivery; nothing here sets it.
--
-- Every change takes a request key: a retry or a repeated tap returns the first result and changes
-- nothing. Idempotent (safe to re-run).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Identifiers
-- ---------------------------------------------------------------------------
create or replace function public.new_scan_code(p_prefix text)
returns text language sql volatile as $$
  select p_prefix || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
$$;

create table if not exists public.stock_pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  balance_g bigint not null default 0 check (balance_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.product_sku_seq;

alter table public.products add column if not exists sku text;
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists scan_code text;
alter table public.products add column if not exists stock_pool_id uuid references public.stock_pools(id) on delete set null;

update public.products set scan_code = public.new_scan_code('P') where scan_code is null;
update public.products set sku = 'MD-' || lpad(nextval('public.product_sku_seq')::text, 6, '0') where sku is null;
alter table public.products alter column scan_code set not null;
alter table public.products alter column sku set not null;

create unique index if not exists products_scan_code_key on public.products (scan_code);
create unique index if not exists products_sku_key on public.products (sku);
create unique index if not exists products_barcode_key on public.products (barcode) where barcode is not null;
create index if not exists products_stock_pool_idx on public.products (stock_pool_id) where stock_pool_id is not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_barcode_format') then
    alter table public.products add constraint products_barcode_format check (barcode is null or barcode ~ '^[0-9]{8,14}$');
  end if;
end $$;

-- A printed label must keep working: scan_code and sku never change once issued.
create or replace function public.products_scan_identity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.scan_code := coalesce(new.scan_code, public.new_scan_code('P'));
    new.sku := coalesce(new.sku, 'MD-' || lpad(nextval('public.product_sku_seq')::text, 6, '0'));
  else
    new.scan_code := old.scan_code;
    new.sku := old.sku;
  end if;
  return new;
end $$;
drop trigger if exists products_scan_identity_trg on public.products;
create trigger products_scan_identity_trg before insert or update on public.products
for each row execute function public.products_scan_identity();

alter table public.orders add column if not exists scan_code text default public.new_scan_code('O');
alter table public.orders alter column scan_code set not null;
create unique index if not exists orders_scan_code_key on public.orders (scan_code);
alter table public.orders add column if not exists packed_at timestamptz;
alter table public.orders add column if not exists packed_by uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists packed_by_name text;

alter table public.order_items add column if not exists packed_qty int not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_packed_qty_range') then
    alter table public.order_items add constraint order_items_packed_qty_range check (packed_qty >= 0 and packed_qty <= quantity);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Stock movements carry who, why, how much and what is left
-- ---------------------------------------------------------------------------
alter table public.inventory_movements add column if not exists stock_pool_id uuid references public.stock_pools(id) on delete set null;
alter table public.inventory_movements add column if not exists delta_grams bigint;
alter table public.inventory_movements add column if not exists quantity_entered numeric(12,3);
alter table public.inventory_movements add column if not exists unit_entered text;
alter table public.inventory_movements add column if not exists balance_after bigint;
alter table public.inventory_movements add column if not exists balance_unit text;
alter table public.inventory_movements add column if not exists actor_name text;
alter table public.inventory_movements add column if not exists request_key uuid;
create unique index if not exists inventory_movements_request_key on public.inventory_movements (request_key) where request_key is not null;
create index if not exists inventory_movements_pool_idx on public.inventory_movements (stock_pool_id, created_at desc) where stock_pool_id is not null;

create or replace function public._actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(full_name), ''), phone, 'Staff') from public.profiles where id = auth.uid();
$$;
revoke all on function public._actor_name() from public, anon, authenticated;

-- Fills the same columns for every writer, including place_order and cancel_order.
create or replace function public.inventory_movements_enrich()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pool uuid; v_pack numeric; v_qty int; v_bal bigint;
begin
  select p.stock_pool_id, public.pack_grams(p.weight_value, p.weight_unit), i.stock_qty into v_pool, v_pack, v_qty
  from public.inventory i join public.products p on p.id = i.product_id where i.id = new.inventory_id;
  if v_pool is not null then
    new.stock_pool_id := coalesce(new.stock_pool_id, v_pool);
    new.delta_grams := coalesce(new.delta_grams, new.delta * v_pack);
    select balance_g into v_bal from public.stock_pools where id = v_pool;
    new.balance_after := coalesce(new.balance_after, v_bal);
    new.balance_unit := coalesce(new.balance_unit, 'g');
  else
    new.balance_after := coalesce(new.balance_after, v_qty);
    new.balance_unit := coalesce(new.balance_unit, 'packs');
  end if;
  if new.actor_name is null and new.actor_id is not null then
    select coalesce(nullif(trim(full_name), ''), phone, 'Staff') into new.actor_name from public.profiles where id = new.actor_id;
  end if;
  return new;
end $$;
drop trigger if exists inventory_movements_enrich_trg on public.inventory_movements;
create trigger inventory_movements_enrich_trg before insert on public.inventory_movements
for each row execute function public.inventory_movements_enrich();

-- ---------------------------------------------------------------------------
-- 3. Shared gram balance
-- ---------------------------------------------------------------------------
create or replace function public.stock_lock()
returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(7710340);
  return null;
end $$;
drop trigger if exists stock_lock_trg on public.inventory;
create trigger stock_lock_trg before update of stock_qty on public.inventory
for each statement execute function public.stock_lock();

-- Rewrites the pack counts of a pool's sizes from its balance. p_except is the row a trigger is
-- already updating: Postgres refuses a second update of it inside the same statement.
create or replace function public._pool_sync(p_pool uuid, p_except uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_bal bigint;
begin
  select balance_g into v_bal from public.stock_pools where id = p_pool;
  perform set_config('app.pool_sync', 'on', true);
  update public.inventory i
     set stock_qty = floor(v_bal / public.pack_grams(p.weight_value, p.weight_unit))::int
    from public.products p
   where p.id = i.product_id and p.stock_pool_id = p_pool and i.id is distinct from p_except
     and i.stock_qty <> floor(v_bal / public.pack_grams(p.weight_value, p.weight_unit))::int;
  perform set_config('app.pool_sync', 'off', true);
end $$;
revoke all on function public._pool_sync(uuid, uuid) from public, anon, authenticated;

-- Named to run before inventory_sync_status_trg (same-event triggers fire in name order), so the
-- status and low-stock alert see the final pack count.
create or replace function public.inventory_pool_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pool uuid; v_pack numeric; v_bal bigint; v_delta bigint;
begin
  if coalesce(current_setting('app.pool_sync', true), 'off') = 'on' then return new; end if;
  select p.stock_pool_id, public.pack_grams(p.weight_value, p.weight_unit) into v_pool, v_pack from public.products p where p.id = new.product_id;
  if v_pool is null then return new; end if;
  select balance_g into v_bal from public.stock_pools where id = v_pool for update;
  v_delta := (new.stock_qty - case when tg_op = 'UPDATE' then old.stock_qty else 0 end)::bigint * v_pack;
  if v_bal + v_delta < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;
  if v_delta <> 0 then
    v_bal := v_bal + v_delta;
    update public.stock_pools set balance_g = v_bal, updated_at = now() where id = v_pool;
  end if;
  new.stock_qty := floor(v_bal / v_pack)::int;
  perform public._pool_sync(v_pool, new.id);
  return new;
end $$;
drop trigger if exists inventory_pool_sync_trg on public.inventory;
create trigger inventory_pool_sync_trg before insert or update of stock_qty on public.inventory
for each row execute function public.inventory_pool_sync();

-- Fresh fruit and vegetables sold by weight become loose stock. The separate counts are added up, so
-- the grams on the shelf stay the same: 4 x 500 g + 3 x 1 kg becomes one 5,000 g balance.
do $$
declare f record; v_pool uuid;
begin
  for f in
    select lower(trim(p.name)) as nm, p.brand_id, min(p.name) as label,
           sum(coalesce(i.stock_qty, 0) * public.pack_grams(p.weight_value, p.weight_unit))::bigint as grams
    from public.products p
    join public.categories c on c.id = p.category_id
    left join public.inventory i on i.product_id = p.id
    where c.slug in ('fruits', 'vegetables') and lower(p.weight_unit) in ('g', 'kg') and p.weight_value > 0 and p.stock_pool_id is null
    group by 1, 2
  loop
    insert into public.stock_pools (name, balance_g) values (f.label, f.grams) returning id into v_pool;
    update public.products p set stock_pool_id = v_pool
    from public.categories c
    where c.id = p.category_id and c.slug in ('fruits', 'vegetables') and lower(p.weight_unit) in ('g', 'kg') and p.weight_value > 0
      and lower(trim(p.name)) = f.nm and p.brand_id is not distinct from f.brand_id and p.stock_pool_id is null;
    perform public._pool_sync(v_pool);
  end loop;
end $$;

-- Two sizes can each look available while the cart needs more grams than the balance holds.
create or replace function public._cart_short_pools(p_cart_id uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x.pool), '{}') from (
    select p.stock_pool_id as pool
    from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.cart_id = p_cart_id and p.stock_pool_id is not null
    group by p.stock_pool_id
    having sum(ci.quantity * public.pack_grams(p.weight_value, p.weight_unit)) > (select balance_g from public.stock_pools s where s.id = p.stock_pool_id)
  ) x;
$$;
revoke all on function public._cart_short_pools(uuid) from public, anon, authenticated;

create or replace function public.cart_summary(p_address_id uuid default null, p_delivery_type public.delivery_type default 'standard')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cart public.carts; v_addr public.addresses; v_zone public.delivery_zones; v_pp jsonb := public.pickup_point();
  v_items jsonb; v_sub numeric := 0; v_mrp_total numeric := 0; v_count int := 0;
  v_delivery numeric := 0; v_threshold numeric; v_min_order numeric; v_gap numeric := 0;
  v_platform numeric; v_tax numeric := 0; v_tax_rate numeric; v_coupon jsonb := null; v_coupon_disc numeric := 0;
  v_total numeric; v_cats uuid[]; v_dist numeric; v_express_fee numeric := 0; v_eta_min int; v_eta_max int;
  v_serviceable boolean := true; v_msg text := null; v_issues jsonb := '[]'::jsonb; v_delivery_waived numeric := 0;
  v_short uuid[];
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_cart from public.carts where user_id = auth.uid() and status = 'active';
  if v_cart.id is null then
    return jsonb_build_object('items','[]'::jsonb,'item_count',0,'subtotal',0,'total',0,'empty',true, 'business_open', public.is_business_open());
  end if;

  v_short := public._cart_short_pools(v_cart.id);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ci.id, 'inventory_id', ci.inventory_id, 'product_id', p.id, 'name', p.name, 'slug', p.slug,
      'image_url', p.image_url, 'pack_label', p.pack_label, 'brand_name', b.name,
      'quantity', ci.quantity, 'unit_price', i.selling_price, 'unit_mrp', i.mrp,
      'line_total', ci.quantity * i.selling_price, 'stock_qty', i.stock_qty, 'max_order_qty', i.max_order_qty,
      'available', (i.is_active and i.stock_qty >= ci.quantity and not (p.stock_pool_id = any(v_short))),
      'over_limit', ci.quantity > i.max_order_qty,
      'price_at_add', ci.price_at_add,
      'price_changed', (ci.price_at_add is not null and ci.price_at_add <> i.selling_price)
    ) order by ci.created_at), '[]'::jsonb),
    coalesce(sum(ci.quantity * i.selling_price),0), coalesce(sum(ci.quantity * i.mrp),0), coalesce(sum(ci.quantity),0),
    array_agg(distinct p.category_id)
  into v_items, v_sub, v_mrp_total, v_count, v_cats
  from public.cart_items ci
  join public.inventory i on i.id = ci.inventory_id
  join public.products p on p.id = ci.product_id
  left join public.brands b on b.id = p.brand_id
  where ci.cart_id = v_cart.id;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'inventory_id', i.id, 'name', p.name, 'quantity', ci.quantity,
      'available_qty', i.stock_qty, 'max_order_qty', i.max_order_qty,
      'reason', case when not i.is_active then 'unavailable' when i.stock_qty < ci.quantity or p.stock_pool_id = any(v_short) then 'stock' else 'limit' end)), '[]'::jsonb) into v_issues
  from public.cart_items ci join public.inventory i on i.id = ci.inventory_id join public.products p on p.id = ci.product_id
  where ci.cart_id = v_cart.id and (not i.is_active or i.stock_qty < ci.quantity or ci.quantity > i.max_order_qty or p.stock_pool_id = any(v_short));

  -- Address / zone resolution
  if p_address_id is not null then
    select * into v_addr from public.addresses where id = p_address_id and user_id = auth.uid();
  else
    select * into v_addr from public.addresses where user_id = auth.uid() order by is_default desc, created_at desc limit 1;
  end if;
  if v_addr.id is not null then
    v_zone := public.find_zone(v_addr.pincode, v_addr.lat, v_addr.lng);
    if v_zone.id is null then
      v_serviceable := false;
      v_msg := 'Sorry, ' || coalesce(public.get_setting('brand_name') #>> '{}', 'Merta Deal') || ' is not available in your area yet.';
    end if;
  end if;

  v_threshold := coalesce(v_zone.free_delivery_threshold, public.get_setting_num('free_delivery_threshold', 499));
  v_min_order := coalesce(v_zone.min_order_amount, public.get_setting_num('min_order_amount', 99));
  v_delivery := coalesce(v_zone.delivery_fee, public.get_setting_num('delivery_fee_base', 25));
  v_eta_min := coalesce(v_zone.eta_min_minutes, public.get_setting_num('delivery_eta_min_minutes', 30)::int);
  v_eta_max := coalesce(v_zone.eta_max_minutes, public.get_setting_num('delivery_eta_max_minutes', 60)::int);

  -- distance surcharge beyond the included distance (from the pickup point)
  if v_addr.lat is not null and (v_pp ->> 'lat') is not null then
    v_dist := public.haversine_km(v_addr.lat, v_addr.lng, (v_pp ->> 'lat')::double precision, (v_pp ->> 'lng')::double precision);
    if v_dist > public.get_setting_num('delivery_included_km', 3) then
      v_delivery := v_delivery + ceil(v_dist - public.get_setting_num('delivery_included_km', 3)) * public.get_setting_num('delivery_fee_per_extra_km', 8);
    end if;
  end if;

  if p_delivery_type = 'express' then
    v_express_fee := public.get_setting_num('express_delivery_fee', 20);
    v_eta_min := public.get_setting_num('express_eta_min_minutes', 20)::int;
    v_eta_max := public.get_setting_num('express_eta_max_minutes', 35)::int;
  end if;

  if v_sub >= v_threshold and v_sub > 0 then
    v_gap := 0; v_delivery_waived := v_delivery; v_delivery := 0;
  else
    v_gap := greatest(v_threshold - v_sub, 0);
  end if;

  v_platform := case when v_count > 0 then public.get_setting_num('platform_fee', 2) else 0 end;
  v_tax_rate := public.get_setting_num('tax_rate_percent', 18);
  v_tax := round((v_delivery + v_express_fee + v_platform) * v_tax_rate / 100, 2);

  if v_cart.coupon_id is not null then
    v_coupon := public.validate_coupon((select code from public.coupons where id = v_cart.coupon_id), v_sub, v_cats);
    if (v_coupon ->> 'valid')::boolean then v_coupon_disc := (v_coupon ->> 'discount')::numeric; end if;
  end if;

  v_total := greatest(v_sub - v_coupon_disc, 0) + v_delivery + v_express_fee + v_platform + v_tax;

  return jsonb_build_object(
    'cart_id', v_cart.id, 'empty', v_count = 0,
    'business_open', public.is_business_open(),
    'items', v_items, 'item_count', v_count, 'issues', v_issues,
    'subtotal', v_sub, 'mrp_total', v_mrp_total, 'item_savings', v_mrp_total - v_sub,
    'coupon', v_coupon, 'coupon_discount', v_coupon_disc,
    'delivery_fee', v_delivery, 'delivery_fee_waived', v_delivery_waived, 'express_fee', v_express_fee, 'platform_fee', v_platform, 'tax', v_tax, 'tax_rate', v_tax_rate,
    'total', v_total,
    'free_delivery_threshold', v_threshold, 'free_delivery_gap', v_gap, 'min_order_amount', v_min_order,
    'meets_min_order', v_sub >= v_min_order,
    'address', case when v_addr.id is null then null else to_jsonb(v_addr) end,
    'zone', case when v_zone.id is null then null else jsonb_build_object('id', v_zone.id, 'name', v_zone.name, 'express_supported', v_zone.express_supported) end,
    'serviceable', v_serviceable, 'service_message', v_msg,
    'eta_min_minutes', v_eta_min, 'eta_max_minutes', v_eta_max, 'distance_km', round(coalesce(v_dist,0)::numeric, 1),
    'delivery_type', p_delivery_type
  );
end $$;

-- ---------------------------------------------------------------------------
-- 4. Tables for packing and cash
-- ---------------------------------------------------------------------------
create table if not exists public.order_pack_events (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  code text,
  result text not null check (result in ('ok', 'wrong_product', 'wrong_weight', 'extra', 'unknown', 'undo', 'packed')),
  message text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists order_pack_events_order_idx on public.order_pack_events (order_id, created_at desc);

-- One row per order, whatever is retried: the unique key is what stops a second collection entry.
create table if not exists public.cod_collections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  assignment_id uuid references public.delivery_assignments(id) on delete set null,
  rider_id uuid references public.delivery_partners(id) on delete set null,
  amount numeric(10,2) not null check (amount >= 0),
  confirmed_via text not null,
  collected_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cod_collections_rider_idx on public.cod_collections (rider_id, created_at desc);

insert into public.cod_collections (order_id, assignment_id, rider_id, amount, confirmed_via, collected_by, created_at)
select o.id, a.id, a.rider_id, o.total, 'otp', pay.collected_by, coalesce(pay.collected_at, o.delivered_at, now())
from public.orders o
join public.payments pay on pay.order_id = o.id
left join lateral (select * from public.delivery_assignments d where d.order_id = o.id and d.status = 'delivered' order by d.delivered_at desc nulls last limit 1) a on true
where o.payment_method = 'cod' and o.payment_status = 'cod_collected'
on conflict (order_id) do nothing;

alter table public.stock_pools enable row level security;
alter table public.order_pack_events enable row level security;
alter table public.cod_collections enable row level security;
drop policy if exists stock_pools_read on public.stock_pools;
create policy stock_pools_read on public.stock_pools for select using (public.is_admin());
drop policy if exists order_pack_events_read on public.order_pack_events;
create policy order_pack_events_read on public.order_pack_events for select using (public.is_admin());
drop policy if exists cod_collections_read on public.cod_collections;
create policy cod_collections_read on public.cod_collections for select using (
  public.is_admin() or exists (select 1 from public.delivery_partners dp where dp.id = rider_id and dp.user_id = auth.uid()));

create or replace function public._complete_delivery(p_assignment_id uuid, p_via text)
returns int language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; o public.orders; v_points int := 0; v_new uuid;
begin
  select * into a from public.delivery_assignments where id = p_assignment_id;
  select * into o from public.orders where id = a.order_id;
  update public.delivery_assignments set status = 'delivered', delivered_at = now() where id = a.id;
  perform public._set_order_status(o.id, 'delivered', case when p_via = 'support' then 'Confirmed by support without OTP' end);

  if o.payment_method = 'cod' then
    update public.payments set status = 'cod_collected', collected_by = (select user_id from public.delivery_partners where id = a.rider_id), collected_at = now() where order_id = o.id;
    update public.orders set payment_status = 'cod_collected' where id = o.id;
    insert into public.cod_collections (order_id, assignment_id, rider_id, amount, confirmed_via, collected_by)
    values (o.id, a.id, a.rider_id, o.total, p_via, (select user_id from public.delivery_partners where id = a.rider_id))
    on conflict (order_id) do nothing;
  end if;

  insert into public.rider_earnings (rider_id, assignment_id, order_id, amount, confirmed_via)
  values (a.rider_id, a.id, o.id, a.earning, p_via)
  on conflict (assignment_id) do nothing
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

create or replace function public.fulfil_order(p_order_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_assignment uuid;
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
      -- Allowed until the order is packed.
      if o.status not in ('placed','confirmed','preparing') then raise exception 'INVALID_TRANSITION: % -> reject', o.status; end if;
      for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
        update public.inventory set stock_qty = stock_qty + v_item.quantity, sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
        insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, v_item.quantity, 'reject_restock', o.id, auth.uid());
      end loop;
      update public.orders set reject_reason = p_note where id = o.id;
      perform public._handle_refund_on_cancel(o.id);
      perform public._set_order_status(o.id, 'rejected', p_note);
    when 'preparing' then
      if o.status <> 'confirmed' then raise exception 'INVALID_TRANSITION: % -> preparing', o.status; end if;
      perform public._set_order_status(o.id, 'preparing', p_note);
    when 'ready' then
      if o.status not in ('confirmed','preparing') then raise exception 'INVALID_TRANSITION: % -> ready', o.status; end if;
      -- Once scanning has started, the "Packed" button cannot skip what the scans say is missing.
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
-- 5. Looking a code up
-- ---------------------------------------------------------------------------
-- A code arrives as the bare value, or as the link printed in the QR (…/q/<code>).
create or replace function public._scan_normalize(p_code text)
returns text language sql immutable as $$
  select upper(trim(coalesce(substring(left(coalesce(p_code, ''), 300) from '/q/([A-Za-z0-9_-]+)'), left(coalesce(p_code, ''), 300))));
$$;

create or replace function public._scan_find_product(p_code text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.products
  where scan_code = public._scan_normalize(p_code) or sku = public._scan_normalize(p_code) or barcode = public._scan_normalize(p_code)
  limit 1;
$$;
revoke all on function public._scan_find_product(text) from public, anon, authenticated;

-- Stock is deducted when an order is placed, so "reserved" is stock that has already left the
-- available figure and is still in the building: placed orders not yet handed to a rider.
create or replace function public._scan_product(p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.products; i public.inventory; v_pool public.stock_pools; v_pack numeric; v_loose boolean;
begin
  select * into p from public.products where id = p_product_id;
  select * into i from public.inventory where product_id = p.id;
  select * into v_pool from public.stock_pools where id = p.stock_pool_id;
  v_pack := public.pack_grams(p.weight_value, p.weight_unit);
  v_loose := v_pool.id is not null;
  return jsonb_build_object(
    'id', p.id, 'name', p.name, 'pack_label', p.pack_label, 'weight_value', p.weight_value, 'weight_unit', p.weight_unit, 'pack_grams', v_pack,
    'image_url', p.image_url, 'sku', p.sku, 'barcode', p.barcode, 'scan_code', p.scan_code, 'is_active', p.is_active,
    'brand_name', (select name from public.brands b where b.id = p.brand_id),
    'listed', i.id is not null, 'inventory_id', i.id, 'selling_price', i.selling_price, 'mrp', i.mrp, 'listing_active', coalesce(i.is_active, false),
    'stock_mode', case when v_loose then 'loose' else 'pack' end,
    'can_be_loose', lower(p.weight_unit) in ('g', 'kg') and p.weight_value > 0,
    'available_packs', coalesce(i.stock_qty, 0),
    'stock_status', i.status,
    'reserved_packs', (select coalesce(sum(oi.quantity), 0) from public.order_items oi join public.orders o on o.id = oi.order_id
                       where oi.product_id = p.id and o.status in ('placed','confirmed','preparing','ready_for_pickup','rider_assigned')),
    'pool', case when v_loose then jsonb_build_object(
      'id', v_pool.id, 'name', v_pool.name, 'balance_g', v_pool.balance_g,
      'reserved_g', (select coalesce(sum(oi.quantity * public.pack_grams(sp.weight_value, sp.weight_unit)), 0)
                     from public.order_items oi join public.orders o on o.id = oi.order_id join public.products sp on sp.id = oi.product_id
                     where sp.stock_pool_id = v_pool.id and o.status in ('placed','confirmed','preparing','ready_for_pickup','rider_assigned'))) end,
    'variants', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'pack_label', s.pack_label, 'sku', s.sku, 'selling_price', si.selling_price, 'available_packs', coalesce(si.stock_qty, 0), 'selected', s.id = p.id)
                   order by public.pack_grams(s.weight_value, s.weight_unit)), '[]'::jsonb)
                 from public.products s left join public.inventory si on si.product_id = s.id
                 where lower(trim(s.name)) = lower(trim(p.name)) and s.brand_id is not distinct from p.brand_id));
end $$;
revoke all on function public._scan_product(uuid) from public, anon, authenticated;

create or replace function public._pack_lines(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', oi.id, 'product_id', oi.product_id, 'name', oi.product_name, 'brand_name', oi.brand_name, 'pack_label', oi.pack_label, 'image_url', oi.image_url,
      'quantity', oi.quantity, 'packed_qty', oi.packed_qty, 'sku', p.sku, 'unit_price', oi.unit_price)
    order by oi.packed_qty >= oi.quantity, oi.product_name), '[]'::jsonb)
  from public.order_items oi left join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id;
$$;
revoke all on function public._pack_lines(uuid) from public, anon, authenticated;

-- Full staff view of one order. Admins only; a rider gets the short view in scan_resolve.
create or replace function public.scan_order_detail(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; a record; c public.cod_collections;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  select d.id, d.status, d.rider_id, pr.full_name as rider_name, pr.phone as rider_phone into a
  from public.delivery_assignments d
  join public.delivery_partners dp on dp.id = d.rider_id join public.profiles pr on pr.id = dp.user_id
  where d.order_id = o.id and d.status in ('offered','accepted','picked_up','delivered') order by d.created_at desc limit 1;
  select * into c from public.cod_collections where order_id = o.id;
  return jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'scan_code', o.scan_code, 'status', o.status, 'created_at', o.created_at, 'total', o.total, 'item_count', o.item_count,
    'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'customer_name', o.address_snapshot ->> 'full_name', 'area', o.address_snapshot ->> 'area',
    'delivery_instructions', o.delivery_instructions,
    'packed_at', o.packed_at, 'packed_by_name', o.packed_by_name, 'lines', public._pack_lines(o.id),
    'flags', (select coalesce(jsonb_agg(jsonb_build_object('result', e.result, 'message', e.message, 'at', e.created_at, 'by', e.actor_name) order by e.created_at desc), '[]'::jsonb)
              from (select * from public.order_pack_events where order_id = o.id and result in ('wrong_product','wrong_weight','extra','unknown') order by created_at desc limit 20) e),
    'assignment', case when a.id is not null then jsonb_build_object('id', a.id, 'status', a.status, 'rider_id', a.rider_id, 'rider_name', a.rider_name, 'rider_phone', a.rider_phone) end,
    'cod', case when c.id is not null then jsonb_build_object('amount', c.amount, 'at', c.created_at, 'via', c.confirmed_via) end);
end $$;
revoke all on function public.scan_order_detail(uuid) from public, anon;
grant execute on function public.scan_order_detail(uuid) to authenticated;

-- The role check comes first, so a customer learns nothing about whether a code exists.
create or replace function public.scan_resolve(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean := public.is_admin(); dp public.delivery_partners; v_code text := public._scan_normalize(p_code); o public.orders; a public.delivery_assignments; v_pid uuid;
begin
  if not v_admin then
    select * into dp from public.delivery_partners where user_id = auth.uid() and status = 'active';
    if dp.id is null then raise exception 'FORBIDDEN'; end if;
  end if;
  if v_code = '' then return jsonb_build_object('kind', 'unknown', 'code', v_code); end if;

  select * into o from public.orders where scan_code = v_code or order_number = v_code limit 1;
  if o.id is not null then
    if v_admin then return jsonb_build_object('kind', 'order', 'order', public.scan_order_detail(o.id)); end if;
    select * into a from public.delivery_assignments where order_id = o.id and rider_id = dp.id and status in ('offered','accepted','picked_up') order by created_at desc limit 1;
    if a.id is null then raise exception 'NOT_ASSIGNED'; end if;
    return jsonb_build_object('kind', 'rider_order', 'order', jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'status', o.status, 'item_count', o.item_count, 'packed', o.ready_at is not null,
      'assignment_id', a.id, 'assignment_status', a.status, 'cod_amount', a.cod_amount,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'pack_label', oi.pack_label)), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id)));
  end if;

  v_pid := public._scan_find_product(v_code);
  if v_pid is not null then
    if not v_admin then raise exception 'FORBIDDEN'; end if;
    return jsonb_build_object('kind', 'product', 'product', public._scan_product(v_pid));
  end if;
  return jsonb_build_object('kind', 'unknown', 'code', v_code);
end $$;
revoke all on function public.scan_resolve(text) from public, anon;
grant execute on function public.scan_resolve(text) to authenticated;

create or replace function public.scan_product(p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.products where id = p_product_id) then raise exception 'NOT_FOUND'; end if;
  return public._scan_product(p_product_id);
end $$;
revoke all on function public.scan_product(uuid) from public, anon;
grant execute on function public.scan_product(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Changing stock
-- ---------------------------------------------------------------------------
create or replace function public.scan_stock_action(
  p_request_key uuid, p_product_id uuid, p_action text, p_quantity numeric, p_unit text,
  p_direction text default null, p_reason text default null, p_note text default null, p_confirmed boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.products; i public.inventory; m public.inventory_movements; v_pack numeric; v_sign int; v_grams bigint; v_packs int;
  v_bal bigint; v_reason text := nullif(trim(coalesce(p_reason, '')), ''); v_note text := nullif(left(trim(coalesce(p_note, '')), 300), ''); v_code text; v_unit text := lower(trim(coalesce(p_unit, '')));
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_request_key is null then raise exception 'REQUEST_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(7710340);

  select * into m from public.inventory_movements where request_key = p_request_key;
  if m.id is not null then
    return jsonb_build_object('ok', true, 'replayed', true, 'balance_after', m.balance_after, 'balance_unit', m.balance_unit, 'product', public._scan_product(p_product_id));
  end if;

  if not coalesce(p_confirmed, false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
  case p_action
    when 'receive' then v_sign := 1; v_code := 'restock'; v_reason := coalesce(v_reason, 'Stock received');
    when 'wastage' then v_sign := -1; v_code := 'wastage';
      if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
    when 'adjust' then
      v_sign := case p_direction when 'add' then 1 when 'remove' then -1 else null end; v_code := 'manual_adjust';
      if v_sign is null then raise exception 'DIRECTION_REQUIRED'; end if;
      if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
    else raise exception 'UNKNOWN_ACTION';
  end case;
  if p_quantity is null or p_quantity <= 0 then raise exception 'QUANTITY_REQUIRED'; end if;

  select * into p from public.products where id = p_product_id;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  select * into i from public.inventory where product_id = p.id for update;
  if i.id is null then raise exception 'NOT_LISTED'; end if;

  if p.stock_pool_id is not null then
    -- Loose: weight only. A pack count here would hide how much produce actually moved.
    if v_unit not in ('kg', 'g') then raise exception 'UNIT_NOT_ALLOWED: Loose stock is counted by weight. Enter kg or g.'; end if;
    v_grams := case v_unit when 'kg' then round(p_quantity * 1000) else round(p_quantity) end;
    if v_grams <> p_quantity * (case v_unit when 'kg' then 1000 else 1 end) then raise exception 'WHOLE_GRAMS_REQUIRED'; end if;
    if v_grams <= 0 or v_grams > 10000000 then raise exception 'QUANTITY_OUT_OF_RANGE'; end if;
    v_pack := public.pack_grams(p.weight_value, p.weight_unit);
    select balance_g into v_bal from public.stock_pools where id = p.stock_pool_id for update;
    if v_bal + v_sign * v_grams < 0 then raise exception 'NEGATIVE_STOCK'; end if;
    update public.stock_pools set balance_g = balance_g + v_sign * v_grams, updated_at = now() where id = p.stock_pool_id;
    perform public._pool_sync(p.stock_pool_id);
    insert into public.inventory_movements (inventory_id, delta, reason, actor_id, note, stock_pool_id, delta_grams, quantity_entered, unit_entered, request_key)
    values (i.id, trunc(v_sign * v_grams / v_pack)::int, v_code, auth.uid(), concat_ws(' — ', v_reason, v_note), p.stock_pool_id, v_sign * v_grams, p_quantity, v_unit, p_request_key)
    returning * into m;
  else
    -- Prepacked: whole packs only. Weight units are refused so packs and kilograms are never mixed up.
    if v_unit <> 'packs' then raise exception 'UNIT_NOT_ALLOWED: Prepacked stock is counted in packs.'; end if;
    if p_quantity <> trunc(p_quantity) then raise exception 'WHOLE_PACKS_REQUIRED'; end if;
    if p_quantity > 100000 then raise exception 'QUANTITY_OUT_OF_RANGE'; end if;
    v_packs := p_quantity::int;
    if i.stock_qty + v_sign * v_packs < 0 then raise exception 'NEGATIVE_STOCK'; end if;
    update public.inventory set stock_qty = stock_qty + v_sign * v_packs where id = i.id;
    insert into public.inventory_movements (inventory_id, delta, reason, actor_id, note, quantity_entered, unit_entered, request_key)
    values (i.id, v_sign * v_packs, v_code, auth.uid(), concat_ws(' — ', v_reason, v_note), p_quantity, v_unit, p_request_key)
    returning * into m;
  end if;

  perform public.audit('stock.' || p_action, 'inventory', i.id::text, null,
    jsonb_build_object('product_id', p.id, 'sku', p.sku, 'quantity', p_quantity, 'unit', v_unit, 'direction', v_sign, 'reason', v_reason, 'note', v_note, 'balance_after', m.balance_after, 'balance_unit', m.balance_unit));
  return jsonb_build_object('ok', true, 'replayed', false, 'balance_after', m.balance_after, 'balance_unit', m.balance_unit, 'product', public._scan_product(p.id));
end $$;
revoke all on function public.scan_stock_action(uuid, uuid, text, numeric, text, text, text, text, boolean) from public, anon;
grant execute on function public.scan_stock_action(uuid, uuid, text, numeric, text, text, text, text, boolean) to authenticated;

create or replace function public.scan_stock_history(p_product_id uuid, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.products; v_inv uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into p from public.products where id = p_product_id;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  select id into v_inv from public.inventory where product_id = p.id;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id, 'at', x.created_at, 'reason', x.reason, 'note', x.note, 'delta', x.delta, 'delta_grams', x.delta_grams,
      'quantity', x.quantity_entered, 'unit', x.unit_entered, 'balance_after', x.balance_after, 'balance_unit', x.balance_unit,
      'staff', x.actor_name, 'pack_label', x.pack_label, 'order_id', x.reference_id) order by x.created_at desc), '[]'::jsonb)
    from (
      select m.*, sp.pack_label from public.inventory_movements m
      join public.inventory si on si.id = m.inventory_id join public.products sp on sp.id = si.product_id
      where (p.stock_pool_id is not null and m.stock_pool_id = p.stock_pool_id) or m.inventory_id = v_inv
      order by m.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) x);
end $$;
revoke all on function public.scan_stock_history(uuid, int) from public, anon;
grant execute on function public.scan_stock_history(uuid, int) to authenticated;

-- Moves a product between shared weight and its own pack count, keeping the grams on the shelf.
create or replace function public.admin_set_stock_mode(p_product_id uuid, p_mode text, p_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.products; i public.inventory; v_pack numeric; v_pool uuid; v_was uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if not coalesce(p_confirmed, false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
  perform pg_advisory_xact_lock(7710340);
  select * into p from public.products where id = p_product_id for update;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  select * into i from public.inventory where product_id = p.id for update;
  v_pack := public.pack_grams(p.weight_value, p.weight_unit);
  if p_mode = 'loose' then
    if p.stock_pool_id is not null then return public._scan_product(p.id); end if;
    if lower(p.weight_unit) not in ('g','kg') or p.weight_value <= 0 then raise exception 'NOT_SOLD_BY_WEIGHT'; end if;
    select s.stock_pool_id into v_pool from public.products s
    where s.id <> p.id and s.stock_pool_id is not null and lower(trim(s.name)) = lower(trim(p.name)) and s.brand_id is not distinct from p.brand_id limit 1;
    if v_pool is null then insert into public.stock_pools (name) values (p.name) returning id into v_pool; end if;
    update public.products set stock_pool_id = v_pool where id = p.id;
    update public.stock_pools set balance_g = balance_g + coalesce(i.stock_qty, 0) * v_pack, updated_at = now() where id = v_pool;
    perform public._pool_sync(v_pool);
  elsif p_mode = 'pack' then
    v_was := p.stock_pool_id;
    if v_was is null then return public._scan_product(p.id); end if;
    update public.products set stock_pool_id = null where id = p.id;
    update public.stock_pools set balance_g = greatest(balance_g - coalesce(i.stock_qty, 0) * v_pack, 0), updated_at = now() where id = v_was;
    perform public._pool_sync(v_was);
  else
    raise exception 'UNKNOWN_ACTION';
  end if;
  if i.id is not null then
    insert into public.inventory_movements (inventory_id, delta, reason, actor_id, note, delta_grams)
    values (i.id, 0, 'stock_type_change', auth.uid(), case p_mode when 'loose' then 'Now shared stock in grams' else 'Now counted in packs' end, 0);
  end if;
  perform public.audit('stock.mode', 'products', p.id::text, jsonb_build_object('stock_pool_id', p.stock_pool_id), jsonb_build_object('mode', p_mode));
  return public._scan_product(p.id);
end $$;
revoke all on function public.admin_set_stock_mode(uuid, text, boolean) from public, anon;
grant execute on function public.admin_set_stock_mode(uuid, text, boolean) to authenticated;

create or replace function public.admin_set_product_barcode(p_product_id uuid, p_barcode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := nullif(regexp_replace(coalesce(p_barcode, ''), '\s', '', 'g'), ''); v_other text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.products where id = p_product_id) then raise exception 'NOT_FOUND'; end if;
  if v_code is not null and v_code !~ '^[0-9]{8,14}$' then raise exception 'INVALID_BARCODE'; end if;
  select name into v_other from public.products where barcode = v_code and id <> p_product_id;
  if v_other is not null then raise exception 'BARCODE_IN_USE: %', v_other; end if;
  update public.products set barcode = v_code where id = p_product_id;
  perform public.audit('product.barcode', 'products', p_product_id::text, null, jsonb_build_object('barcode', v_code));
  return public._scan_product(p_product_id);
end $$;
revoke all on function public.admin_set_product_barcode(uuid, text) from public, anon;
grant execute on function public.admin_set_product_barcode(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Packing. Counts items against the order; never changes stock.
-- ---------------------------------------------------------------------------
create or replace function public.pack_start(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status = 'confirmed' then perform public.fulfil_order(o.id, 'preparing', 'Packing started by scan');
  elsif o.status <> 'preparing' then raise exception 'NOT_PACKABLE: %', o.status; end if;
  return public.scan_order_detail(o.id);
end $$;
revoke all on function public.pack_start(uuid) from public, anon;
grant execute on function public.pack_start(uuid) to authenticated;

create or replace function public.pack_scan(p_request_key uuid, p_order_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; e public.order_pack_events; v_pid uuid; v_scanned public.products; v_item public.order_items; v_result text; v_msg text; v_expected text; v_item_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_request_key is null then raise exception 'REQUEST_KEY_REQUIRED'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;

  select * into e from public.order_pack_events where request_key = p_request_key;
  if e.id is not null then
    return jsonb_build_object('result', e.result, 'message', e.message, 'replayed', true, 'order', public.scan_order_detail(o.id));
  end if;
  if o.status <> 'preparing' then raise exception 'NOT_PACKABLE: %', o.status; end if;

  v_pid := public._scan_find_product(p_code);
  if v_pid is null then
    v_result := 'unknown'; v_msg := 'Unknown code. This is not a Merta Deal product label.';
  else
    select * into v_scanned from public.products where id = v_pid;
    select * into v_item from public.order_items where order_id = o.id and product_id = v_pid order by packed_qty < quantity desc limit 1 for update;
    if v_item.id is null then
      select string_agg(coalesce(oi.pack_label, '?'), ', ') into v_expected from public.order_items oi join public.products s on s.id = oi.product_id
      where oi.order_id = o.id and lower(trim(s.name)) = lower(trim(v_scanned.name)) and s.brand_id is not distinct from v_scanned.brand_id;
      if v_expected is not null then
        v_result := 'wrong_weight'; v_msg := format('Wrong weight: scanned %s, this order needs %s of %s.', coalesce(v_scanned.pack_label, '?'), v_expected, v_scanned.name);
      else
        v_result := 'wrong_product'; v_msg := format('Wrong product: %s is not in this order.', v_scanned.name);
      end if;
    elsif v_item.packed_qty >= v_item.quantity then
      v_result := 'extra'; v_msg := format('Extra scan: %s %s is already complete (%s of %s).', v_item.product_name, coalesce(v_item.pack_label, ''), v_item.packed_qty, v_item.quantity);
      v_item_id := v_item.id;
    else
      update public.order_items set packed_qty = packed_qty + 1 where id = v_item.id;
      v_result := 'ok'; v_msg := format('%s %s: %s of %s packed.', v_item.product_name, coalesce(v_item.pack_label, ''), v_item.packed_qty + 1, v_item.quantity);
      v_item_id := v_item.id;
    end if;
  end if;

  insert into public.order_pack_events (request_key, order_id, order_item_id, product_id, code, result, message, actor_id, actor_name)
  values (p_request_key, o.id, v_item_id, v_pid, left(public._scan_normalize(p_code), 60), v_result, v_msg, auth.uid(), public._actor_name());
  return jsonb_build_object('result', v_result, 'message', v_msg, 'replayed', false, 'order', public.scan_order_detail(o.id));
end $$;
revoke all on function public.pack_scan(uuid, uuid, text) from public, anon;
grant execute on function public.pack_scan(uuid, uuid, text) to authenticated;

create or replace function public.pack_undo(p_request_key uuid, p_order_id uuid, p_order_item_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item public.order_items; v_msg text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_request_key is null then raise exception 'REQUEST_KEY_REQUIRED'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if exists (select 1 from public.order_pack_events where request_key = p_request_key) then return public.scan_order_detail(o.id); end if;
  if o.status <> 'preparing' then raise exception 'NOT_PACKABLE: %', o.status; end if;
  select * into v_item from public.order_items where id = p_order_item_id and order_id = o.id for update;
  if v_item.id is null then raise exception 'NOT_FOUND'; end if;
  if v_item.packed_qty <= 0 then return public.scan_order_detail(o.id); end if;
  update public.order_items set packed_qty = packed_qty - 1 where id = v_item.id;
  v_msg := format('Removed one %s %s from the bag.', v_item.product_name, coalesce(v_item.pack_label, ''));
  insert into public.order_pack_events (request_key, order_id, order_item_id, product_id, result, message, actor_id, actor_name)
  values (p_request_key, o.id, v_item.id, v_item.product_id, 'undo', v_msg, auth.uid(), public._actor_name());
  return public.scan_order_detail(o.id);
end $$;
revoke all on function public.pack_undo(uuid, uuid, uuid) from public, anon;
grant execute on function public.pack_undo(uuid, uuid, uuid) to authenticated;

create or replace function public.pack_complete(p_request_key uuid, p_order_id uuid, p_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_missing jsonb; v_result jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_request_key is null then raise exception 'REQUEST_KEY_REQUIRED'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if exists (select 1 from public.order_pack_events where request_key = p_request_key) or (o.packed_at is not null and o.status not in ('cancelled','rejected')) then
    return jsonb_build_object('ok', true, 'already', true, 'order', public.scan_order_detail(o.id));
  end if;
  if not coalesce(p_confirmed, false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
  if o.status <> 'preparing' then raise exception 'NOT_PACKABLE: %', o.status; end if;
  select jsonb_agg(jsonb_build_object('name', product_name, 'pack_label', pack_label, 'missing', quantity - packed_qty)) into v_missing
  from public.order_items where order_id = o.id and packed_qty < quantity;
  if v_missing is not null then
    return jsonb_build_object('ok', false, 'missing', v_missing, 'order', public.scan_order_detail(o.id));
  end if;
  update public.orders set packed_at = now(), packed_by = auth.uid(), packed_by_name = public._actor_name() where id = o.id;
  insert into public.order_pack_events (request_key, order_id, result, message, actor_id, actor_name)
  values (p_request_key, o.id, 'packed', 'Packing confirmed', auth.uid(), public._actor_name());
  v_result := public.fulfil_order(o.id, 'ready', 'Packed and checked by scan');
  perform public.audit('order.packed', 'orders', o.id::text, null, jsonb_build_object('order_number', o.order_number));
  return jsonb_build_object('ok', true, 'already', false, 'assignment_id', v_result -> 'assignment_id', 'order', public.scan_order_detail(o.id));
end $$;
revoke all on function public.pack_complete(uuid, uuid, boolean) from public, anon;
grant execute on function public.pack_complete(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Dispatch. A scan can hand an order over; it can never deliver one.
-- ---------------------------------------------------------------------------
create or replace function public.scan_assign_rider(p_order_id uuid, p_rider_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; a public.delivery_assignments; v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into a from public.delivery_assignments where order_id = o.id and status in ('offered','accepted','picked_up') order by created_at desc limit 1;
  if a.id is not null and a.rider_id = p_rider_id then
    return jsonb_build_object('ok', true, 'already', true, 'order', public.scan_order_detail(o.id));
  end if;
  if a.id is not null and a.status <> 'offered' then raise exception 'ALREADY_ASSIGNED'; end if;
  v_id := public.admin_assign_rider(o.id, p_rider_id);
  return jsonb_build_object('ok', true, 'already', false, 'assignment_id', v_id, 'order', public.scan_order_detail(o.id));
end $$;
revoke all on function public.scan_assign_rider(uuid, uuid) from public, anon;
grant execute on function public.scan_assign_rider(uuid, uuid) to authenticated;

-- Shared by the staff and rider scans: the packed bag leaves the shop with the assigned rider.
create or replace function public._scan_dispatch(p_order public.orders, p_assignment public.delivery_assignments)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_order.ready_at is null then raise exception 'ORDER_NOT_PACKED'; end if;
  if p_order.status not in ('rider_assigned','ready_for_pickup') then raise exception 'ORDER_NOT_READY: %', p_order.status; end if;
  update public.delivery_assignments set status = 'picked_up', picked_up_at = now() where id = p_assignment.id;
  perform public._set_order_status(p_order.id, 'out_for_delivery', null);
end $$;
revoke all on function public._scan_dispatch(public.orders, public.delivery_assignments) from public, anon, authenticated;

create or replace function public.scan_confirm_dispatch(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; a public.delivery_assignments;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into a from public.delivery_assignments where order_id = o.id and status in ('accepted','picked_up') order by created_at desc limit 1 for update;
  if a.status = 'picked_up' then return jsonb_build_object('ok', true, 'already', true, 'order', public.scan_order_detail(o.id)); end if;
  if a.id is null then raise exception 'NO_RIDER_ACCEPTED'; end if;
  perform public._scan_dispatch(o, a);
  perform public.audit('order.dispatch_scan', 'orders', o.id::text, null, jsonb_build_object('assignment_id', a.id, 'rider_id', a.rider_id));
  return jsonb_build_object('ok', true, 'already', false, 'order', public.scan_order_detail(o.id));
end $$;
revoke all on function public.scan_confirm_dispatch(uuid) from public, anon;
grant execute on function public.scan_confirm_dispatch(uuid) to authenticated;

create or replace function public.rider_scan_pickup(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; o public.orders; a public.delivery_assignments;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid() and status = 'active';
  if dp.id is null then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  select * into a from public.delivery_assignments where order_id = p_order_id and rider_id = dp.id and status in ('accepted','picked_up') order by created_at desc limit 1 for update;
  if o.id is null or a.id is null then raise exception 'NOT_ASSIGNED'; end if;
  if a.status = 'picked_up' then return jsonb_build_object('ok', true, 'already', true); end if;
  perform public._scan_dispatch(o, a);
  return jsonb_build_object('ok', true, 'already', false);
end $$;
revoke all on function public.rider_scan_pickup(uuid) from public, anon;
grant execute on function public.rider_scan_pickup(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Label printing. Identity only: no price goes on a label or into its code.
-- ---------------------------------------------------------------------------
create or replace function public.admin_label_products(p_ids uuid[] default null, p_category text default null, p_listed_only boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return (
    select coalesce(jsonb_agg(x.row order by x.category, x.family, x.grams), '[]'::jsonb) from (
      select jsonb_build_object('id', p.id, 'name', p.name, 'brand_name', b.name, 'pack_label', p.pack_label, 'sku', p.sku, 'barcode', p.barcode, 'scan_code', p.scan_code,
               'category', c.name, 'listed', i.id is not null, 'loose', p.stock_pool_id is not null) as row,
             c.name as category, lower(trim(p.name)) as family, public.pack_grams(p.weight_value, p.weight_unit) as grams
      from public.products p
      left join public.brands b on b.id = p.brand_id
      left join public.categories c on c.id = p.category_id
      left join public.inventory i on i.product_id = p.id
      where (p_ids is null or p.id = any(p_ids))
        and (p_category is null or c.slug = p_category or c.parent_id = (select id from public.categories where slug = p_category))
        and (not coalesce(p_listed_only, true) or i.id is not null)
        and (p_ids is not null or p.is_active)
      limit 500
    ) x);
end $$;
revoke all on function public.admin_label_products(uuid[], text, boolean) from public, anon;
grant execute on function public.admin_label_products(uuid[], text, boolean) to authenticated;
