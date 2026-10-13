-- ============================================================================
-- MERTA DEAL — Per-product quantity limits ("packs per order"), enforced on the server.
-- * Every product (store offer = inventory row) has max_order_qty; new offers default to the
--   `default_max_order_qty` setting (5). Admins change a product in Admin → Products → offer.
-- * add_to_cart serialises writes per cart (row lock), so rapid taps, retries and several tabs
--   cannot exceed a limit; raising a quantity past the limit or stock fails with a clear reason
--   (MAX_PER_ORDER / ONLY_AVAILABLE), lowering and removing always work.
-- * cart_summary flags lines over the limit, short of stock or whose price changed since they
--   were added; place_order already refuses a cart with issues (ITEMS_UNAVAILABLE).
-- * reorder adds what fits and reports every reduction instead of trimming silently.
-- ============================================================================

insert into public.settings (key, value, "group", label, description, is_public) values
('default_max_order_qty', '5', 'orders', 'Default max packs per product', 'Packs of one product a customer can order at once. Used for new products; change one product from its store offer (Max per order).', true)
on conflict (key) do nothing;

-- Existing offers on the old built-in default (10) move to the new default; custom limits stay.
update public.inventory set max_order_qty = 5 where max_order_qty = 10;
update public.inventory set max_order_qty = least(greatest(max_order_qty, 1), 100) where max_order_qty < 1 or max_order_qty > 100;
alter table public.inventory alter column max_order_qty set default (public.get_setting_num('default_max_order_qty', 5))::int;
alter table public.inventory drop constraint if exists inventory_max_order_qty_range;
alter table public.inventory add constraint inventory_max_order_qty_range check (max_order_qty between 1 and 100);

-- Price when the customer last set the quantity, to tell them if it changes before checkout.
alter table public.cart_items add column if not exists price_at_add numeric(10,2);

create or replace function public.add_to_cart(p_inventory_id uuid, p_quantity int default 1, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cart public.carts; v_inv public.inventory; v_store public.stores; v_cart_id uuid; v_current int; v_allowed int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_cart_id := public.get_or_create_cart();
  -- One writer per cart: concurrent requests (rapid taps, retries, other tabs) wait here, so the
  -- checks below always see the latest quantities.
  select * into v_cart from public.carts where id = v_cart_id for update;
  select quantity into v_current from public.cart_items where cart_id = v_cart.id and inventory_id = p_inventory_id;
  v_current := coalesce(v_current, 0);

  -- Removing always works, even for an item that has since become unavailable.
  if p_quantity <= 0 then
    delete from public.cart_items where cart_id = v_cart.id and inventory_id = p_inventory_id;
    if not exists (select 1 from public.cart_items where cart_id = v_cart.id) then
      update public.carts set store_id = null, coupon_id = null where id = v_cart.id;
    end if;
    return jsonb_build_object('ok', true, 'cart_id', v_cart.id, 'quantity', 0);
  end if;

  select * into v_inv from public.inventory where id = p_inventory_id and is_active;
  if v_inv.id is null then raise exception 'ITEM_UNAVAILABLE'; end if;
  select * into v_store from public.stores where id = v_inv.store_id;
  if v_store.status <> 'active' then raise exception 'STORE_UNAVAILABLE'; end if;

  -- Raising a quantity must fit the per-product limit and the stock; lowering is always allowed
  -- (e.g. the limit was reduced after the item went into the cart).
  if p_quantity > v_current then
    if v_inv.stock_qty <= 0 then raise exception 'OUT_OF_STOCK'; end if;
    v_allowed := least(v_inv.max_order_qty, v_inv.stock_qty);
    if p_quantity > v_allowed then
      if v_inv.stock_qty < v_inv.max_order_qty then raise exception 'ONLY_AVAILABLE: %', v_inv.stock_qty; end if;
      raise exception 'MAX_PER_ORDER: %', v_inv.max_order_qty;
    end if;
  end if;

  if v_cart.store_id is not null and v_cart.store_id <> v_inv.store_id
     and exists (select 1 from public.cart_items where cart_id = v_cart.id) then
    if not p_replace then
      return jsonb_build_object('ok', false, 'conflict', true,
        'current_store', (select jsonb_build_object('id', id, 'name', name) from public.stores where id = v_cart.store_id),
        'new_store', jsonb_build_object('id', v_store.id, 'name', v_store.name));
    end if;
    delete from public.cart_items where cart_id = v_cart.id;
    update public.carts set coupon_id = null where id = v_cart.id;
  end if;

  update public.carts set store_id = v_inv.store_id where id = v_cart.id;
  insert into public.cart_items (cart_id, inventory_id, product_id, quantity, price_at_add)
  values (v_cart.id, p_inventory_id, v_inv.product_id, p_quantity, v_inv.selling_price)
  on conflict (cart_id, inventory_id) do update set quantity = excluded.quantity, price_at_add = excluded.price_at_add, updated_at = now();

  return jsonb_build_object('ok', true, 'cart_id', v_cart.id, 'quantity', p_quantity, 'max_order_qty', v_inv.max_order_qty, 'stock_qty', v_inv.stock_qty);
end $$;

-- The customer has seen the current prices (shown before they continue to payment).
create or replace function public.acknowledge_cart_prices()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.cart_items ci set price_at_add = i.selling_price
  from public.inventory i, public.carts c
  where i.id = ci.inventory_id and c.id = ci.cart_id and c.user_id = auth.uid() and c.status = 'active'
    and ci.price_at_add is distinct from i.selling_price;
end $$;
revoke all on function public.acknowledge_cart_prices() from public;
grant execute on function public.acknowledge_cart_prices() to authenticated;

-- Reorder: add what fits, and say exactly what was reduced or left out (never silently).
create or replace function public.reorder(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_added int := 0; v_skipped jsonb := '[]'::jsonb; v_adjusted jsonb := '[]'::jsonb;
  v_res jsonb; v_first boolean := true; v_qty int;
begin
  select * into o from public.orders where id = p_order_id and user_id = auth.uid();
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  for v_item in
    select oi.product_name, oi.quantity, i.id as inventory_id, i.stock_qty, i.is_active, i.max_order_qty
    from public.order_items oi
    left join public.inventory i on i.product_id = oi.product_id and i.store_id = o.store_id
    where oi.order_id = o.id
  loop
    if v_item.inventory_id is null or not v_item.is_active or v_item.stock_qty <= 0 then
      v_skipped := v_skipped || jsonb_build_object('name', v_item.product_name, 'reason', 'unavailable');
      continue;
    end if;
    v_qty := least(v_item.quantity, v_item.max_order_qty, v_item.stock_qty);
    begin
      v_res := public.add_to_cart(v_item.inventory_id, v_qty, v_first);
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('name', v_item.product_name, 'reason', 'unavailable');
      continue;
    end;
    v_first := false;
    if (v_res ->> 'ok')::boolean then
      v_added := v_added + 1;
      if v_qty < v_item.quantity then
        v_adjusted := v_adjusted || jsonb_build_object('name', v_item.product_name, 'requested', v_item.quantity, 'added', v_qty,
          'reason', case when v_item.stock_qty < least(v_item.quantity, v_item.max_order_qty) then 'stock' else 'limit' end);
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skipped, 'adjusted', v_adjusted);
end $$;

-- Product upsert: new offers get the default limit; edits without a limit keep the current one.
create or replace function public.upsert_store_product(
  p_store_id uuid, p_name text, p_category_id uuid, p_brand_name text, p_weight_value numeric, p_weight_unit text, p_pack_label text,
  p_mrp numeric, p_selling_price numeric, p_stock_qty int, p_low_stock_threshold int default 5, p_description text default null,
  p_image_url text default null, p_is_local boolean default false, p_is_veg boolean default true, p_product_id uuid default null, p_max_order_qty int default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pid uuid := p_product_id; v_bid uuid; v_slug text; v_inv uuid;
begin
  if not (public.is_store_member(p_store_id) or public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_selling_price > p_mrp then raise exception 'PRICE_ABOVE_MRP'; end if;
  if p_brand_name is not null and length(trim(p_brand_name)) > 0 then
    insert into public.brands (name, slug) values (trim(p_brand_name), public.slugify(p_brand_name))
    on conflict (name) do update set updated_at = now() returning id into v_bid;
  end if;
  if v_pid is null then
    v_slug := public.slugify(p_name || ' ' || coalesce(p_pack_label,''));
    if exists (select 1 from public.products where slug = v_slug) then v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 6); end if;
    insert into public.products (name, slug, brand_id, category_id, created_by_store_id, description, weight_value, weight_unit, pack_label, mrp, image_url, is_local, is_veg, is_approved)
    values (p_name, v_slug, v_bid, p_category_id, p_store_id, p_description, p_weight_value, p_weight_unit, p_pack_label, p_mrp, p_image_url, p_is_local, p_is_veg,
            not public.get_setting_bool('require_product_approval', false))
    returning id into v_pid;
  else
    -- Stores may only edit master data of products they created; catalog products are admin-managed.
    update public.products set name = p_name, brand_id = coalesce(v_bid, brand_id), category_id = p_category_id, description = coalesce(p_description, description),
      weight_value = p_weight_value, weight_unit = p_weight_unit, pack_label = p_pack_label, mrp = p_mrp, image_url = coalesce(p_image_url, image_url), is_local = p_is_local, is_veg = p_is_veg
    where id = v_pid and (created_by_store_id = p_store_id or public.is_admin());
  end if;
  insert into public.inventory (store_id, product_id, selling_price, mrp, stock_qty, low_stock_threshold, max_order_qty)
  values (p_store_id, v_pid, p_selling_price, p_mrp, p_stock_qty, p_low_stock_threshold, coalesce(p_max_order_qty, (public.get_setting_num('default_max_order_qty', 5))::int))
  on conflict (store_id, product_id) do update set selling_price = excluded.selling_price, mrp = excluded.mrp, stock_qty = excluded.stock_qty,
    low_stock_threshold = excluded.low_stock_threshold, max_order_qty = coalesce(p_max_order_qty, public.inventory.max_order_qty), is_active = true, updated_at = now()
  returning id into v_inv;
  return jsonb_build_object('product_id', v_pid, 'inventory_id', v_inv);
end $$;

create or replace function public.cart_summary(p_address_id uuid default null, p_delivery_type public.delivery_type default 'standard')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cart public.carts; v_store public.stores; v_addr public.addresses; v_zone public.delivery_zones;
  v_items jsonb; v_sub numeric := 0; v_mrp_total numeric := 0; v_count int := 0;
  v_delivery numeric := 0; v_threshold numeric; v_min_order numeric; v_gap numeric := 0;
  v_platform numeric; v_tax numeric := 0; v_tax_rate numeric; v_coupon jsonb := null; v_coupon_disc numeric := 0;
  v_total numeric; v_cats uuid[]; v_dist numeric; v_express_fee numeric := 0; v_eta_min int; v_eta_max int;
  v_serviceable boolean := true; v_msg text := null; v_issues jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_cart from public.carts where user_id = auth.uid() and status = 'active';
  if v_cart.id is null then
    return jsonb_build_object('items','[]'::jsonb,'item_count',0,'subtotal',0,'total',0,'empty',true);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ci.id, 'inventory_id', ci.inventory_id, 'product_id', p.id, 'name', p.name, 'slug', p.slug,
      'image_url', p.image_url, 'pack_label', p.pack_label, 'brand_name', b.name,
      'quantity', ci.quantity, 'unit_price', i.selling_price, 'unit_mrp', i.mrp,
      'line_total', ci.quantity * i.selling_price, 'stock_qty', i.stock_qty, 'max_order_qty', i.max_order_qty,
      'available', (i.is_active and i.stock_qty >= ci.quantity),
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
      'reason', case when not i.is_active then 'unavailable' when i.stock_qty < ci.quantity then 'stock' else 'limit' end)), '[]'::jsonb) into v_issues
  from public.cart_items ci join public.inventory i on i.id = ci.inventory_id join public.products p on p.id = ci.product_id
  where ci.cart_id = v_cart.id and (not i.is_active or i.stock_qty < ci.quantity or ci.quantity > i.max_order_qty);

  select * into v_store from public.stores where id = v_cart.store_id;

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
  v_min_order := greatest(coalesce(v_zone.min_order_amount, public.get_setting_num('min_order_amount', 99)), coalesce(v_store.min_order_amount, 0));
  v_delivery := coalesce(v_zone.delivery_fee, public.get_setting_num('delivery_fee_base', 25));
  v_eta_min := coalesce(v_zone.eta_min_minutes, public.get_setting_num('delivery_eta_min_minutes', 30)::int);
  v_eta_max := coalesce(v_zone.eta_max_minutes, public.get_setting_num('delivery_eta_max_minutes', 60)::int);

  -- distance surcharge beyond the included distance
  if v_addr.lat is not null and v_store.id is not null then
    v_dist := public.haversine_km(v_addr.lat, v_addr.lng, v_store.lat, v_store.lng);
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
    v_gap := 0; v_delivery := 0;
  else
    v_gap := greatest(v_threshold - v_sub, 0);
  end if;

  v_platform := case when v_count > 0 then public.get_setting_num('platform_fee', 2) else 0 end;
  v_tax_rate := public.get_setting_num('tax_rate_percent', 18);
  v_tax := round((v_delivery + v_express_fee + v_platform) * v_tax_rate / 100, 2);

  if v_cart.coupon_id is not null then
    v_coupon := public.validate_coupon((select code from public.coupons where id = v_cart.coupon_id), v_cart.store_id, v_sub, v_cats);
    if (v_coupon ->> 'valid')::boolean then v_coupon_disc := (v_coupon ->> 'discount')::numeric; end if;
  end if;

  v_total := greatest(v_sub - v_coupon_disc, 0) + v_delivery + v_express_fee + v_platform + v_tax;

  return jsonb_build_object(
    'cart_id', v_cart.id, 'empty', v_count = 0,
    'store', case when v_store.id is null then null else jsonb_build_object('id', v_store.id, 'name', v_store.name, 'slug', v_store.slug, 'area', v_store.area, 'is_open', v_store.is_open, 'avg_prep_minutes', v_store.avg_prep_minutes, 'lat', v_store.lat, 'lng', v_store.lng) end,
    'items', v_items, 'item_count', v_count, 'issues', v_issues,
    'subtotal', v_sub, 'mrp_total', v_mrp_total, 'item_savings', v_mrp_total - v_sub,
    'coupon', v_coupon, 'coupon_discount', v_coupon_disc,
    'delivery_fee', v_delivery, 'express_fee', v_express_fee, 'platform_fee', v_platform, 'tax', v_tax, 'tax_rate', v_tax_rate,
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
