-- rollout-0049-0051.sql: 0049 (cake options + rest of 0048), 0050 (dispatch reliability) and 0051 (rider journey)
-- in one paste, in order. Safe to run twice. The last result row must read has_0049 = true, has_0050 = true, has_0051 = true.

-- ROLLOUT for production (paste the whole file into the Supabase SQL editor and run it once).
-- 1) Migration 0049 in full: cake options (weights in pounds, eggless, message on cake) including the
--    0048-style place_order that reserves stock.
-- 2) The rest of 0048 that is still missing in production: cancel_order, fulfil_order, _apply_item_exception,
--    _complete_delivery (reservation release / finalise).
-- The last row must read has_0049 = true.

-- ============================================================================
-- MERTA DEAL — Cake options (0049): made-to-order bakery products.
--   * Weights in pounds: 'lb' is a product unit (1 Pound ≈ 454 g), so the sizes of one cake (1 lb, 2 lb,
--     3 lb) are sibling products exactly like 500 g / 1 kg packs and sort by real weight.
--   * Eggless: a product may offer an eggless version at a per-unit extra set by the admin (0 = free).
--   * Message on the cake: a product may accept a short message (40 characters), carried on the cart
--     line and the order line so the baker, the slip and the rider all see it.
--   * The eggless extra is folded into the order line's unit price (one figure everywhere).
--   * A public setting holds the note shown on cake pages ("design may differ from the photo").
-- Idempotent. Business rules stay in settings/products; nothing here is hardcoded for a category.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists eggless_option boolean not null default false;
alter table public.products add column if not exists eggless_extra numeric(10,2) not null default 0;
alter table public.products add column if not exists cake_message boolean not null default false;
comment on column public.products.eggless_option is 'The customer may ask for an eggless version (0049).';
comment on column public.products.eggless_extra is 'Per-unit extra charged for the eggless version; 0 = no extra (0049).';
comment on column public.products.cake_message is 'The customer may add a short message to be written on the cake (0049).';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_eggless_extra_nonneg') then
    alter table public.products add constraint products_eggless_extra_nonneg check (eggless_extra >= 0);
  end if;
end $$;

alter table public.cart_items add column if not exists eggless boolean not null default false;
alter table public.cart_items add column if not exists cake_message text;
alter table public.order_items add column if not exists eggless boolean not null default false;
alter table public.order_items add column if not exists cake_message text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cart_items_cake_message_len') then
    alter table public.cart_items add constraint cart_items_cake_message_len check (cake_message is null or char_length(cake_message) between 1 and 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_items_cake_message_len') then
    alter table public.order_items add constraint order_items_cake_message_len check (cake_message is null or char_length(cake_message) between 1 and 40);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Pounds are a weight: 1 lb = 453.592 g, so "1 Pound" sorts between "250 g" and "1 kg"
-- ---------------------------------------------------------------------------
create or replace function public.pack_grams(p_value numeric, p_unit text)
returns numeric language sql immutable as $$
  select case lower(coalesce(p_unit, '')) when 'kg' then p_value * 1000 when 'l' then p_value * 1000 when 'ltr' then p_value * 1000
              when 'lb' then p_value * 453.592 when 'lbs' then p_value * 453.592 when 'pound' then p_value * 453.592
              else coalesce(p_value, 0) end
$$;

-- ---------------------------------------------------------------------------
-- 3. The note shown on cake pages (editable in Admin → Settings; empty hides it)
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, "group", label, description, is_public) values
  ('cake_variance_note', to_jsonb('Design and icing may differ a little from the photo: every cake is decorated by hand.'::text), 'general',
   'Note on made-to-order cakes', 'Shown under the cake options on the product page (eggless / message on cake). Leave empty to hide it.', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. A message is one trimmed line: whitespace collapsed, control characters removed, empty → null
-- ---------------------------------------------------------------------------
create or replace function public._cake_message_clean(p text)
returns text language sql immutable as $$
  -- Tabs and newlines count as spaces first; what is left of the control range is dropped.
  select nullif(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'), '[[:cntrl:]]', '', 'g')), '')
$$;
revoke all on function public._cake_message_clean(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. add_to_cart carries the options (0030 body). The old 3-argument signature is dropped so PostgREST
--    resolves one function; callers that pass only a quantity keep working through the defaults.
-- ---------------------------------------------------------------------------
drop function if exists public.add_to_cart(uuid, int, boolean);
create or replace function public.add_to_cart(p_inventory_id uuid, p_quantity int default 1, p_replace boolean default false, p_eggless boolean default null, p_cake_message text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cart public.carts; v_inv public.inventory; v_prod public.products; v_line public.cart_items; v_cart_id uuid; v_current int; v_allowed int;
  v_eggless boolean; v_msg text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_cart_id := public.get_or_create_cart();
  -- One writer per cart: concurrent requests (rapid taps, retries, other tabs) wait here.
  select * into v_cart from public.carts where id = v_cart_id for update;
  select * into v_line from public.cart_items where cart_id = v_cart.id and inventory_id = p_inventory_id;
  v_current := coalesce(v_line.quantity, 0);

  -- Removing always works, even for an item that has since become unavailable.
  if p_quantity <= 0 then
    delete from public.cart_items where cart_id = v_cart.id and inventory_id = p_inventory_id;
    if not exists (select 1 from public.cart_items where cart_id = v_cart.id) then
      update public.carts set coupon_id = null where id = v_cart.id;
    end if;
    return jsonb_build_object('ok', true, 'cart_id', v_cart.id, 'quantity', 0);
  end if;

  select * into v_inv from public.inventory where id = p_inventory_id and is_active;
  if v_inv.id is null then raise exception 'ITEM_UNAVAILABLE'; end if;

  -- Raising a quantity must fit the per-product limit and the stock; lowering is always allowed.
  if p_quantity > v_current then
    if v_inv.stock_qty <= 0 then raise exception 'OUT_OF_STOCK'; end if;
    v_allowed := least(v_inv.max_order_qty, v_inv.stock_qty);
    if p_quantity > v_allowed then
      if v_inv.stock_qty < v_inv.max_order_qty then raise exception 'ONLY_AVAILABLE: %', v_inv.stock_qty; end if;
      raise exception 'MAX_PER_ORDER: %', v_inv.max_order_qty;
    end if;
  end if;

  -- Cake options (0049). Null keeps what the line already has, so a quantity tap never clears a message;
  -- an empty message clears it. A choice the product does not offer is refused; one it stopped offering is dropped quietly.
  select * into v_prod from public.products where id = v_inv.product_id;
  if p_eggless is null then v_eggless := coalesce(v_line.eggless, false) and v_prod.eggless_option;
  else
    if p_eggless and not v_prod.eggless_option then raise exception 'OPTION_UNAVAILABLE: eggless'; end if;
    v_eggless := p_eggless;
  end if;
  if p_cake_message is null then v_msg := case when v_prod.cake_message then v_line.cake_message end;
  else
    v_msg := public._cake_message_clean(p_cake_message);
    if v_msg is not null and not v_prod.cake_message then raise exception 'OPTION_UNAVAILABLE: message'; end if;
    if char_length(coalesce(v_msg, '')) > 40 then raise exception 'MESSAGE_TOO_LONG: 40'; end if;
  end if;

  insert into public.cart_items (cart_id, inventory_id, product_id, quantity, price_at_add, eggless, cake_message)
  values (v_cart.id, p_inventory_id, v_inv.product_id, p_quantity, v_inv.selling_price, v_eggless, v_msg)
  on conflict (cart_id, inventory_id) do update set quantity = excluded.quantity, price_at_add = excluded.price_at_add,
    eggless = excluded.eggless, cake_message = excluded.cake_message, updated_at = now();

  return jsonb_build_object('ok', true, 'cart_id', v_cart.id, 'quantity', p_quantity, 'max_order_qty', v_inv.max_order_qty, 'stock_qty', v_inv.stock_qty,
    'eggless', v_eggless, 'cake_message', v_msg);
end $$;
grant execute on function public.add_to_cart(uuid, int, boolean, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. cart_summary (0043 body): the eggless extra is part of the line price and the subtotal
-- ---------------------------------------------------------------------------
create or replace function public.cart_summary(p_address_id uuid default null, p_delivery_type public.delivery_type default 'standard')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cart public.carts; v_addr public.addresses; v_zone public.delivery_zones; v_pp jsonb := public.pickup_point();
  v_items jsonb; v_sub numeric := 0; v_mrp_total numeric := 0; v_count int := 0;
  v_delivery numeric := 0; v_threshold numeric; v_min_order numeric; v_gap numeric := 0;
  v_platform numeric; v_tax numeric := 0; v_tax_rate numeric; v_coupon jsonb := null; v_coupon_disc numeric := 0;
  v_total numeric; v_cats uuid[]; v_dist numeric; v_express_fee numeric := 0; v_eta_min int; v_eta_max int;
  v_serviceable boolean := true; v_msg text := null; v_issues jsonb := '[]'::jsonb; v_delivery_waived numeric := 0;
  v_referral_credit boolean := false;
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
      'quantity', ci.quantity, 'unit_price', i.selling_price + x.extra, 'unit_mrp', i.mrp + x.extra,
      'line_total', ci.quantity * (i.selling_price + x.extra),
      'eggless', ci.eggless, 'eggless_extra', x.extra, 'cake_message', ci.cake_message, 'stock_qty', i.stock_qty, 'max_order_qty', i.max_order_qty,
      'available', (i.is_active and i.stock_qty >= ci.quantity and not (p.stock_pool_id = any(v_short))),
      'over_limit', ci.quantity > i.max_order_qty,
      'price_at_add', ci.price_at_add,
      'price_changed', (ci.price_at_add is not null and ci.price_at_add <> i.selling_price)
    ) order by ci.created_at), '[]'::jsonb),
    coalesce(sum(ci.quantity * (i.selling_price + x.extra)),0), coalesce(sum(ci.quantity * (i.mrp + x.extra)),0), coalesce(sum(ci.quantity),0),
    array_agg(distinct p.category_id)
  into v_items, v_sub, v_mrp_total, v_count, v_cats
  from public.cart_items ci
  join public.inventory i on i.id = ci.inventory_id
  join public.products p on p.id = ci.product_id
  left join public.brands b on b.id = p.brand_id
  -- Eggless is a per-unit extra set on the product (0049); it is part of the line price, never a separate fee.
  cross join lateral (select case when ci.eggless then coalesce(p.eggless_extra, 0) else 0::numeric end as extra) x
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

  if p_delivery_type <> 'express' and v_delivery > 0 and exists (
    select 1 from public.free_delivery_credits c where c.user_id = auth.uid() and c.redeemed_order_id is null
      and (c.expires_at is null or c.expires_at > now())
      and (not c.first_order_only or not exists (select 1 from public.orders o where o.user_id = auth.uid() and o.status not in ('cancelled', 'rejected')))
  ) then
    v_delivery_waived := v_delivery; v_delivery := 0; v_gap := 0; v_referral_credit := true;
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
    'delivery_fee', v_delivery, 'delivery_fee_waived', v_delivery_waived, 'referral_delivery_credit', v_referral_credit, 'express_fee', v_express_fee, 'platform_fee', v_platform, 'tax', v_tax, 'tax_rate', v_tax_rate,
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
-- 7. product_detail (0033 body) exposes the options
-- ---------------------------------------------------------------------------
create or replace function public.product_detail(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_p record; v_row record; r jsonb;
begin
  select * into v_p from public.v_product_cards where slug = p_slug;
  if v_p.id is null then return null; end if;
  select description, ingredients, nutrition, manufacturer, country_of_origin, shelf_life, seller_name, seller_address, seller_license,
    eggless_option, eggless_extra, cake_message
    into v_row from public.products where id = v_p.id;
  r := to_jsonb(v_p);
  r := r || jsonb_build_object(
    'description', v_row.description,
    'ingredients', v_row.ingredients,
    'nutrition', v_row.nutrition,
    'manufacturer', v_row.manufacturer,
    'country_of_origin', v_row.country_of_origin,
    'shelf_life', v_row.shelf_life,
    'seller_name', v_row.seller_name,
    'seller_address', v_row.seller_address,
    'seller_license', v_row.seller_license,
    -- Made-to-order options (0049): an eggless version (with its per-unit extra) and a message piped on the cake.
    'eggless_option', v_row.eggless_option,
    'eggless_extra', v_row.eggless_extra,
    'cake_message', v_row.cake_message,
    -- Other sizes of this product ("Select unit"); empty when there is only this one.
    'variants', public.product_pack_options(v_p.id),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object(
        'inventory_id', i.id, 'selling_price', i.selling_price, 'mrp', i.mrp, 'stock_qty', i.stock_qty, 'status', i.status,
        'max_order_qty', i.max_order_qty,
        'discount_pct', case when i.mrp > 0 then round(((i.mrp - i.selling_price)/i.mrp)*100) else 0 end
      )), '[]'::jsonb)
      from public.inventory i where i.product_id = v_p.id and i.is_active),
    'related', (select coalesce(jsonb_agg(to_jsonb(v) - 'tags'), '[]'::jsonb) from (
        select * from public.v_product_cards where category_id = v_p.category_id and id <> v_p.id and inventory_id is not null order by popularity_score desc limit 10) v),
    'frequently_bought', (select coalesce(jsonb_agg(to_jsonb(v) - 'tags'), '[]'::jsonb) from (
        select v.* from public.v_product_cards v join (
          select oi2.product_id, count(*) n from public.order_items oi1 join public.order_items oi2 on oi1.order_id = oi2.order_id and oi2.product_id <> oi1.product_id
          where oi1.product_id = v_p.id group by oi2.product_id order by n desc limit 8) f on f.product_id = v.id
        where v.inventory_id is not null) v),
    -- Same brand, in stock, most popular first (was a second search_products call from the page).
    'more_from_brand', (select coalesce(jsonb_agg(to_jsonb(v) - 'tags'), '[]'::jsonb) from (
        select * from public.v_product_cards where v_p.brand_id is not null and brand_id = v_p.brand_id and id <> v_p.id
          and inventory_id is not null and stock_status <> 'out_of_stock' order by popularity_score desc limit 12) v),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'title', r.title, 'comment', r.comment, 'created_at', r.created_at,
        'user_name', coalesce(pr.full_name, 'Customer')) order by r.created_at desc), '[]'::jsonb)
        from public.reviews r join public.profiles pr on pr.id = r.user_id where r.product_id = v_p.id and r.status = 'approved'),
    'in_wishlist', (auth.uid() is not null and exists (select 1 from public.wishlists w where w.user_id = auth.uid() and w.product_id = v_p.id))
  );
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- 8. place_order (0048 body): options and the extra land on the order line
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
    select ci.inventory_id, ci.product_id, ci.quantity, i.selling_price, i.mrp, p.name, p.pack_label, p.image_url, b.name as brand_name,
      ci.eggless, ci.cake_message, case when ci.eggless then coalesce(p.eggless_extra, 0) else 0::numeric end as extra
    from public.cart_items ci join public.inventory i on i.id = ci.inventory_id join public.products p on p.id = ci.product_id
    left join public.brands b on b.id = p.brand_id
    where ci.cart_id = v_cart.id
  loop
    -- The eggless extra is folded into the unit price so every later figure (slip, exceptions, refunds, profit) reads one number.
    insert into public.order_items (order_id, product_id, inventory_id, product_name, brand_name, pack_label, image_url, quantity, unit_price, unit_mrp, line_total, eggless, cake_message)
    values (v_order_id, v_item.product_id, v_item.inventory_id, v_item.name, v_item.brand_name, v_item.pack_label, v_item.image_url, v_item.quantity,
            v_item.selling_price + v_item.extra, v_item.mrp + v_item.extra, v_item.quantity * (v_item.selling_price + v_item.extra), v_item.eggless, v_item.cake_message);
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
-- 9. Where staff and riders read the lines: packing slip / scan lines, rider assignments, reorder
-- ---------------------------------------------------------------------------
create or replace function public._pack_lines(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', oi.id, 'product_id', oi.product_id, 'name', oi.product_name, 'brand_name', oi.brand_name, 'pack_label', oi.pack_label, 'image_url', oi.image_url,
      'quantity', oi.quantity, 'packed_qty', oi.packed_qty, 'sku', p.sku, 'unit_price', oi.unit_price, 'bin_location', p.bin_location,
      'eggless', oi.eggless, 'cake_message', oi.cake_message,
      'exception', (select jsonb_build_object('id', x.id, 'status', x.status, 'available_qty', x.available_qty, 'kind', x.kind)
                    from public.order_exceptions x where x.order_item_id = oi.id order by x.created_at desc limit 1))
    order by oi.packed_qty >= oi.quantity, p.bin_location nulls last, oi.product_name), '[]'::jsonb)
  from public.order_items oi left join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id;
$$;

create or replace function public.rider_assignments(p_status text[] default array['offered','accepted','picked_up'])
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; v_pp jsonb := public.pickup_point();
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  update public.delivery_assignments set status = 'expired' where rider_id = dp.id and status = 'offered' and expires_at < now();
  -- An active rider who is online picks up any packed order still waiting for a rider.
  if dp.status = 'active' and dp.is_online then perform public.dispatch_pending(); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'status', a.status, 'offered_at', a.offered_at, 'expires_at', a.expires_at, 'responded_at', a.responded_at,
      'picked_up_at', a.picked_up_at, 'delivered_at', a.delivered_at, 'distance_km', a.distance_km, 'earning', a.earning, 'cod_amount', a.cod_amount,
      'pickup_lat', a.pickup_lat, 'pickup_lng', a.pickup_lng,
      'drop_lat', case when x.live then a.drop_lat else round(a.drop_lat::numeric, 3)::double precision end,
      'drop_lng', case when x.live then a.drop_lng else round(a.drop_lng::numeric, 3)::double precision end,
      'order', jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'total', o.total, 'item_count', o.item_count,
        'payment_method', o.payment_method,
        'delivery_instructions', case when x.live then o.delivery_instructions end,
        'address', case when x.live then o.address_snapshot
                        else jsonb_strip_nulls(jsonb_build_object('area', o.address_snapshot ->> 'area', 'city', o.address_snapshot ->> 'city', 'pincode', o.address_snapshot ->> 'pincode')) end,
        'promised_at', o.promised_at, 'created_at', o.created_at),
      'pickup', jsonb_build_object('name', coalesce(v_pp ->> 'name', 'Merta Deal'), 'phone', v_pp ->> 'phone', 'address_line1', v_pp ->> 'address_line1', 'area', v_pp ->> 'area',
                                   'lat', a.pickup_lat, 'lng', a.pickup_lng),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'pack_label', oi.pack_label, 'eggless', oi.eggless, 'cake_message', oi.cake_message)), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id)
    ) order by a.created_at desc), '[]'::jsonb)
    from public.delivery_assignments a
    cross join lateral (select a.status in ('accepted','picked_up') as live) x
    join public.orders o on o.id = a.order_id
    where a.rider_id = dp.id and a.status::text = any(p_status));
end $$;

create or replace function public.reorder(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_added int := 0; v_skipped jsonb := '[]'::jsonb; v_adjusted jsonb := '[]'::jsonb;
  v_res jsonb; v_qty int;
begin
  select * into o from public.orders where id = p_order_id and user_id = auth.uid();
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  for v_item in
    select oi.product_name, oi.quantity, i.id as inventory_id, i.stock_qty, i.is_active, i.max_order_qty,
      -- Cake options come along only while the product still offers them (0049).
      (oi.eggless and coalesce(p.eggless_option, false)) as eggless, case when coalesce(p.cake_message, false) then oi.cake_message end as cake_message
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    left join public.inventory i on i.product_id = oi.product_id
    where oi.order_id = o.id
  loop
    if v_item.inventory_id is null or not v_item.is_active or v_item.stock_qty <= 0 then
      v_skipped := v_skipped || jsonb_build_object('name', v_item.product_name, 'reason', 'unavailable');
      continue;
    end if;
    v_qty := least(v_item.quantity, v_item.max_order_qty, v_item.stock_qty);
    begin
      v_res := public.add_to_cart(v_item.inventory_id, v_qty, false, v_item.eggless, coalesce(v_item.cake_message, ''));
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('name', v_item.product_name, 'reason', 'unavailable');
      continue;
    end;
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

grant execute on function public.rider_assignments(text[]) to authenticated, service_role;

-- ===========================================================================
-- Rest of 0048 (order lifecycle)
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

-- check

-- Check
select (select count(*) from information_schema.columns where table_name = 'order_items' and column_name = 'cake_message') = 1
   and (select count(*) from pg_proc where proname = 'place_order' and prosrc like '%cake_message%') = 1
   and (select count(*) from pg_proc where proname = 'cancel_order' and prosrc like '%_order_release_stock%') = 1
   and (select count(*) from pg_proc where proname = 'add_to_cart') = 1 as has_0049;

-- rollout-0050.sql: paste into the Supabase SQL editor AFTER rollout-0049.sql has run (it redefines
-- rider_assignments from the 0049 body). Safe to run twice. Ends with one check row: has_0050 = true.
-- 0050: dispatch reliability.
-- Live dispatch that does not depend on an open app: stale offers expire and are re-offered by one
-- housekeeping function (scheduled with pg_cron where the extension exists), a rider who goes offline or
-- whose app has gone quiet hands their open offers back, rider answers are safe to retry after a lost
-- response, an admin can only hand-assign a packed order and can unassign a rider who never turned up.
-- Nothing here changes who may mark an order delivered (still verify_delivery_otp only) or how stock moves.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, "group", label, description, is_public) values
  ('rider_online_stale_minutes', '30', coalesce((select "group" from public.settings where key = 'dispatch_offer_timeout_seconds'), 'delivery'),
   'Set a quiet rider offline after (minutes)',
   'A rider whose app has not checked in for this long is set offline and their open delivery requests go to other riders. A rider on a delivery is never set offline. 0 keeps riders online until they switch off themselves.', false),
  ('payment_pending_minutes', '30', coalesce((select "group" from public.settings where key = 'upi_pay_now_enabled'), 'payments'),
   'Cancel unpaid online orders after (minutes)',
   'An online or UPI order whose payment has not arrived within this time is cancelled and its stock released. A UPI order the customer has marked as paid is never cancelled automatically.', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Rider heartbeat
-- ---------------------------------------------------------------------------
alter table public.delivery_partners add column if not exists last_seen_at timestamptz;
comment on column public.delivery_partners.last_seen_at is 'Last time the rider app polled or the rider acted (0050). Feeds rider_online_stale_minutes.';

-- ---------------------------------------------------------------------------
-- 3. Sweeps: expire stale offers, set quiet riders offline, re-offer waiting orders
-- ---------------------------------------------------------------------------
create or replace function public._expire_stale_offers()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.delivery_assignments set status = 'expired', responded_at = coalesce(responded_at, now())
  where status = 'offered' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public._expire_stale_offers() from public, anon, authenticated;

create or replace function public._sleep_stale_riders()
returns int language plpgsql security definer set search_path = public as $$
declare v_min numeric := public.get_setting_num('rider_online_stale_minutes', 30); r record; n int := 0;
begin
  if v_min <= 0 then return 0; end if;
  for r in
    select dp.id, dp.user_id from public.delivery_partners dp
    where dp.is_online
      and coalesce(greatest(dp.last_seen_at, dp.last_location_at), dp.updated_at, dp.created_at) < now() - make_interval(mins => v_min::int)
      -- Never interrupt a delivery in progress.
      and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.status in ('accepted','picked_up'))
  loop
    update public.delivery_partners set is_online = false where id = r.id;
    update public.delivery_assignments set status = 'expired', responded_at = coalesce(responded_at, now()) where rider_id = r.id and status = 'offered';
    perform public.notify_user(r.user_id, 'rider_offline', 'You were set offline',
      format('The app had not checked in for %s minutes. Go online again when you are ready for requests.', v_min::int), '{}'::jsonb);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public._sleep_stale_riders() from public, anon, authenticated;

-- 0028 body plus the two sweeps above, so every caller (rider polls, admin polls, a rider going online, the scheduler) tidies up first.
create or replace function public.dispatch_pending()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  perform public._expire_stale_offers();
  perform public._sleep_stale_riders();
  for r in
    select o.id from public.orders o
    where o.status = 'ready_for_pickup'
      and not exists (select 1 from public.delivery_assignments a where a.order_id = o.id and a.status in ('accepted','picked_up')
                      or a.order_id = o.id and a.status = 'offered' and a.expires_at >= now())
    order by o.ready_at nulls first
    limit 20
  loop
    if public.auto_dispatch(r.id) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Rider online / offline: going offline hands open offers back at once
-- ---------------------------------------------------------------------------
create or replace function public.rider_set_online(p_online boolean, p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  if dp.status <> 'active' and p_online then raise exception 'RIDER_NOT_ACTIVE'; end if;
  update public.delivery_partners set is_online = p_online, last_seen_at = now(),
    current_lat = coalesce(p_lat, current_lat), current_lng = coalesce(p_lng, current_lng),
    last_location_at = case when p_lat is not null then now() else last_location_at end
  where id = dp.id;
  if not p_online then
    update public.delivery_assignments set status = 'expired', responded_at = coalesce(responded_at, now()) where rider_id = dp.id and status = 'offered';
  end if;
  -- Online: pick up any waiting order. Offline: the orders this rider held are offered to whoever is left.
  perform public.dispatch_pending();
  return jsonb_build_object('ok', true, 'is_online', p_online);
end $$;

-- ---------------------------------------------------------------------------
-- 5. rider_assignments (rollout-0049 body) with the heartbeat
-- ---------------------------------------------------------------------------
create or replace function public.rider_assignments(p_status text[] default array['offered','accepted','picked_up'])
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; v_pp jsonb := public.pickup_point();
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  update public.delivery_assignments set status = 'expired' where rider_id = dp.id and status = 'offered' and expires_at < now();
  -- Heartbeat (0050): every poll of the rider app records that it is open, so a quiet rider can be set offline.
  update public.delivery_partners set last_seen_at = now() where id = dp.id;
  -- An active rider who is online picks up any packed order still waiting for a rider.
  if dp.status = 'active' and dp.is_online then perform public.dispatch_pending(); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'status', a.status, 'offered_at', a.offered_at, 'expires_at', a.expires_at, 'responded_at', a.responded_at,
      'picked_up_at', a.picked_up_at, 'delivered_at', a.delivered_at, 'distance_km', a.distance_km, 'earning', a.earning, 'cod_amount', a.cod_amount,
      'pickup_lat', a.pickup_lat, 'pickup_lng', a.pickup_lng,
      'drop_lat', case when x.live then a.drop_lat else round(a.drop_lat::numeric, 3)::double precision end,
      'drop_lng', case when x.live then a.drop_lng else round(a.drop_lng::numeric, 3)::double precision end,
      'order', jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'total', o.total, 'item_count', o.item_count,
        'payment_method', o.payment_method,
        'delivery_instructions', case when x.live then o.delivery_instructions end,
        'address', case when x.live then o.address_snapshot
                        else jsonb_strip_nulls(jsonb_build_object('area', o.address_snapshot ->> 'area', 'city', o.address_snapshot ->> 'city', 'pincode', o.address_snapshot ->> 'pincode')) end,
        'promised_at', o.promised_at, 'created_at', o.created_at),
      'pickup', jsonb_build_object('name', coalesce(v_pp ->> 'name', 'Merta Deal'), 'phone', v_pp ->> 'phone', 'address_line1', v_pp ->> 'address_line1', 'area', v_pp ->> 'area',
                                   'lat', a.pickup_lat, 'lng', a.pickup_lng),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'pack_label', oi.pack_label, 'eggless', oi.eggless, 'cake_message', oi.cake_message)), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id)
    ) order by a.created_at desc), '[]'::jsonb)
    from public.delivery_assignments a
    cross join lateral (select a.status in ('accepted','picked_up') as live) x
    join public.orders o on o.id = a.order_id
    where a.rider_id = dp.id and a.status::text = any(p_status));
end $$;
-- ---------------------------------------------------------------------------
-- 6. rider_respond_assignment (0046 body): safe to retry, clears a stale exception on accept
-- ---------------------------------------------------------------------------
create or replace function public.rider_respond_assignment(p_assignment_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; dp public.delivery_partners; o public.orders; v_next uuid; v_q jsonb;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or dp.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  -- Safe to retry (0050): a repeated answer after a lost response reports what already happened instead of failing.
  if p_accept and a.status in ('accepted','picked_up','delivered') then
    return jsonb_build_object('ok', true, 'status', a.status, 'already', true, 'earning', a.earning);
  end if;
  if not p_accept and a.status = 'rejected' then return jsonb_build_object('ok', true, 'status', 'rejected', 'already', true); end if;
  if a.status = 'expired' then
    -- Offer-everyone mode closes the other offers the moment one rider accepts: a late tap learns it was taken, not merely expired.
    if exists (select 1 from public.delivery_assignments where order_id = a.order_id and id <> a.id and status in ('accepted','picked_up','delivered')) then
      return jsonb_build_object('ok', false, 'status', 'taken', 'error', 'OFFER_TAKEN');
    end if;
    return jsonb_build_object('ok', false, 'status', 'expired', 'error', 'OFFER_EXPIRED');
  end if;
  if a.status <> 'offered' then raise exception 'INVALID_STATE: %', a.status; end if;
  if a.expires_at < now() then
    update public.delivery_assignments set status = 'expired', responded_at = now() where id = a.id;
    v_next := public.auto_dispatch(a.order_id);
    return jsonb_build_object('ok', false, 'status', 'expired', 'error', 'OFFER_EXPIRED', 'reassigned_to', v_next);
  end if;
  select * into o from public.orders where id = a.order_id for update;
  if p_accept then
    -- Offer-everyone mode: another rider may have accepted this order a moment ago.
    if exists (select 1 from public.delivery_assignments where order_id = o.id and id <> a.id and status in ('accepted','picked_up')) then
      update public.delivery_assignments set status = 'expired', responded_at = now() where id = a.id;
      return jsonb_build_object('ok', false, 'status', 'taken', 'error', 'OFFER_TAKEN');
    end if;
    if exists (select 1 from public.delivery_assignments where rider_id = dp.id and status in ('accepted','picked_up')) then raise exception 'ALREADY_ON_DELIVERY'; end if;
    v_q := public.rider_pay_quote(o.id);
    update public.delivery_assignments set status = 'accepted', responded_at = now(),
      earning = (v_q ->> 'amount')::numeric, quoted_breakdown = v_q, quoted_at = now(), rate_card_id = (v_q ->> 'rate_card_id')::uuid where id = a.id;
    -- Withdraw the same order's other open offers (offer-everyone mode); their riders simply see it disappear.
    update public.delivery_assignments set status = 'expired', responded_at = now() where order_id = o.id and id <> a.id and status = 'offered';
    perform public._set_order_status(o.id, 'rider_assigned', null);
    -- A rider now holds the order: the no-rider / failed-delivery flag no longer applies (0050).
    if o.exception in ('no_rider', 'delivery_failed') then perform public._set_exception(o.id, null); end if;
    perform public.notify_admins('rider_assigned', 'Rider assigned for ' || o.order_number, 'A delivery partner is on the way to pick it up.', jsonb_build_object('order_id', o.id));
    return jsonb_build_object('ok', true, 'status', 'accepted', 'earning', (v_q ->> 'amount')::numeric);
  else
    update public.delivery_assignments set status = 'rejected', responded_at = now() where id = a.id;
    v_next := public.auto_dispatch(o.id);
    return jsonb_build_object('ok', true, 'status', 'rejected', 'reassigned_to', v_next);
  end if;
end $$;
-- ---------------------------------------------------------------------------
-- 7. Admin assignment only once packed; expiry from the setting; unassign a no-show
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_rider(p_order_id uuid, p_rider_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; dp public.delivery_partners; v_id uuid; v_dist numeric; v_pp jsonb := public.pickup_point();
  v_lat double precision := (v_pp ->> 'lat')::double precision; v_lng double precision := (v_pp ->> 'lng')::double precision;
  v_timeout numeric := public.get_setting_num('dispatch_offer_timeout_seconds', 180);
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  -- A rider is only sent for a packed bag (0050): assigning earlier left orders stuck at rider_assigned with nothing to collect.
  if o.status <> 'ready_for_pickup' then raise exception 'INVALID_STATE: %', o.status; end if;
  if exists (select 1 from public.delivery_assignments where order_id = o.id and status in ('accepted','picked_up')) then raise exception 'ALREADY_ASSIGNED'; end if;
  select * into dp from public.delivery_partners where id = p_rider_id and status = 'active';
  if dp.id is null then raise exception 'RIDER_NOT_FOUND'; end if;
  update public.delivery_assignments set status = 'cancelled', responded_at = coalesce(responded_at, now()) where order_id = o.id and status = 'offered';
  v_dist := public.haversine_km(v_lat, v_lng, o.delivery_lat, o.delivery_lng);
  insert into public.delivery_assignments (order_id, rider_id, status, expires_at, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount, note)
  values (o.id, dp.id, 'offered', now() + make_interval(secs => v_timeout), v_lat, v_lng, o.delivery_lat, o.delivery_lng, round(v_dist::numeric,2), o.rider_earning,
          case when o.payment_method = 'cod' then o.total else 0 end, 'Assigned by admin')
  returning id into v_id;
  if o.exception in ('no_rider', 'delivery_failed') then perform public._set_exception(o.id, null); end if;
  perform public.notify_user(dp.user_id, 'delivery_offer', 'New delivery request (admin)', format('Pickup from %s · Earn ₹%s', coalesce(v_pp ->> 'name', 'Merta Deal'), to_char(o.rider_earning,'FM9999990')),
    jsonb_build_object('assignment_id', v_id, 'order_id', o.id, 'order_number', o.order_number));
  perform public.audit('dispatch.manual_assign', 'orders', o.id::text, null, jsonb_build_object('rider_id', dp.id));
  return v_id;
end $$;

-- A rider accepted but never turned up: free the order and offer it again. A bag already collected cannot be
-- unassigned here; the rider reports a failed delivery or the admin cancels the order.
create or replace function public.admin_unassign_rider(p_order_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; a public.delivery_assignments; dp public.delivery_partners; v_next uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if exists (select 1 from public.delivery_assignments where order_id = o.id and status = 'picked_up') then raise exception 'PICKED_UP: The rider already has the bag; use a failed delivery report or cancel the order.'; end if;
  select * into a from public.delivery_assignments where order_id = o.id and status = 'accepted' order by responded_at desc nulls last limit 1 for update;
  if a.id is null then raise exception 'NO_RIDER: No rider is assigned to this order.'; end if;
  update public.delivery_assignments set status = 'cancelled', note = coalesce(v_note, 'Unassigned by admin') where id = a.id;
  select * into dp from public.delivery_partners where id = a.rider_id;
  perform public.notify_user(dp.user_id, 'delivery_cancelled', 'Delivery reassigned', format('Order %s was given to another rider by Merta Deal. You are free for new requests.', o.order_number),
    jsonb_build_object('assignment_id', a.id, 'order_id', o.id, 'order_number', o.order_number));
  if o.status = 'rider_assigned' then perform public._set_order_status(o.id, 'ready_for_pickup', coalesce(v_note, 'Rider unassigned; finding another rider')); end if;
  perform public.audit('dispatch.unassign', 'orders', o.id::text, jsonb_build_object('rider_id', a.rider_id, 'assignment_id', a.id), jsonb_build_object('note', v_note));
  v_next := public.auto_dispatch(o.id);
  return jsonb_build_object('ok', true, 'unassigned', a.id, 'reassigned_to', v_next);
end $$;
revoke all on function public.admin_unassign_rider(uuid, text) from public, anon;
grant execute on function public.admin_unassign_rider(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. A delivered order carries no dispatch exception
-- ---------------------------------------------------------------------------
create or replace function public._orders_clear_exception_on_close()
returns trigger language plpgsql as $$
begin
  if new.status in ('delivered','completed') and new.exception in ('no_rider','delivery_failed','unattended') then new.exception := null; new.exception_at := null; end if;
  return new;
end $$;
drop trigger if exists orders_clear_exception_on_close_trg on public.orders;
create trigger orders_clear_exception_on_close_trg before update of status on public.orders for each row execute function public._orders_clear_exception_on_close();

-- ---------------------------------------------------------------------------
-- 9. Housekeeping for a scheduler: everything that used to wait for an open app
-- ---------------------------------------------------------------------------
create or replace function public.run_order_housekeeping()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_offers int; v_riders int; v_dispatched int; v_exceptions int; v_escalated int; v_unpaid int;
begin
  if not public.is_admin_or_service() then raise exception 'FORBIDDEN'; end if;
  v_offers := public._expire_stale_offers();
  v_riders := public._sleep_stale_riders();
  v_dispatched := public.dispatch_pending();
  v_exceptions := public.expire_item_exceptions();
  v_escalated := public.escalate_unattended_orders();
  v_unpaid := public.expire_unpaid_orders(greatest(5, public.get_setting_num('payment_pending_minutes', 30))::int);
  return jsonb_build_object('expired_offers', v_offers, 'riders_set_offline', v_riders, 'orders_offered', v_dispatched,
    'exceptions_expired', v_exceptions, 'orders_escalated', v_escalated, 'unpaid_cancelled', v_unpaid, 'ran_at', now());
end $$;
revoke all on function public.run_order_housekeeping() from public, anon;
grant execute on function public.run_order_housekeeping() to authenticated, service_role;

-- pg_cron every minute where the extension exists (Supabase). Elsewhere (PGlite harness, a bare Postgres) this
-- block is a no-op and /api/cron/housekeeping or the client polls do the same work.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'merta_order_housekeeping';
    perform cron.schedule('merta_order_housekeeping', '* * * * *', 'select public.run_order_housekeeping()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;

-- Check
select
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'run_order_housekeeping')
  and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_unassign_rider')
  and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'delivery_partners' and column_name = 'last_seen_at')
  and exists (select 1 from public.settings where key = 'rider_online_stale_minutes') as has_0050,
  exists (select 1 from pg_extension where extname = 'pg_cron') as pg_cron_installed,
  (select count(*) from cron.job where jobname = 'merta_order_housekeeping') as housekeeping_jobs;

-- rollout-0051.sql: paste into the Supabase SQL editor AFTER rollout-0050.sql has run (it redefines
-- rider_assignments, auto_dispatch and admin_assign_rider from the 0050 bodies). Safe to run twice.
-- Ends with one check row: has_0051 = true.

-- 0051: rider journey.
-- The rider app shows one request per order and a four-step delivery journey driven by the database:
--   * one `delivery_offer` notification per rider and order. A re-offer (expiry sweep, admin assignment,
--     a rider coming back online) refreshes that row instead of adding another "New delivery request",
--     so the rider's notification list keeps one line per order with how many times it was offered;
--   * `rider_assignments` exposes the arrival timestamps (`rider_mark_arrived`) and the handover method so
--     the journey step (go to pickup → collect → go to customer → OTP) comes from the server, not from a
--     value remembered on the phone.
-- Nothing here changes who may accept an offer (still first accept wins in rider_respond_assignment)
-- or how an order is completed (still verify_delivery_otp only).

-- ---------------------------------------------------------------------------
-- 1. One request notification per rider and order
-- ---------------------------------------------------------------------------
create or replace function public._notify_rider_offer(p_user_id uuid, p_order_id uuid, p_order_number text, p_assignment_id uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_offers int;
begin
  if p_user_id is null then return; end if;
  select id, coalesce((data ->> 'offers')::int, 1) into v_id, v_offers
  from public.notifications
  where user_id = p_user_id and type = 'delivery_offer' and data ->> 'order_id' = p_order_id::text
  order by created_at desc limit 1;
  if v_id is null then
    perform public.notify_user(p_user_id, 'delivery_offer', p_title, p_body,
      jsonb_build_object('assignment_id', p_assignment_id, 'order_id', p_order_id, 'order_number', p_order_number, 'offers', 1));
    return;
  end if;
  -- Same order offered again: refresh the one row (newest first, unread, pushed again) and count the offers.
  update public.notifications
  set title = p_title, body = p_body, created_at = now(), is_read = false, sent_push = false,
      data = jsonb_build_object('assignment_id', p_assignment_id, 'order_id', p_order_id, 'order_number', p_order_number, 'offers', v_offers + 1)
  where id = v_id;
end $$;
revoke all on function public._notify_rider_offer(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. auto_dispatch (0046 body; notification through _notify_rider_offer)
-- ---------------------------------------------------------------------------
create or replace function public.auto_dispatch(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; r record; v_id uuid; v_first uuid; v_dist numeric; v_pp jsonb := public.pickup_point();
  v_lat double precision := (v_pp ->> 'lat')::double precision; v_lng double precision := (v_pp ->> 'lng')::double precision; v_city uuid := (v_pp ->> 'city_id')::uuid;
  v_window int := greatest(1, public.get_setting_num('dispatch_no_rider_alert_minutes', 5))::int;
  v_all boolean := public.get_setting_bool('dispatch_offer_all_riders', false);
  v_timeout numeric := public.get_setting_num('dispatch_offer_timeout_seconds', 180);
  v_count int := 0;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.status not in ('ready_for_pickup') then return null; end if;
  update public.delivery_assignments set status = 'expired' where status = 'offered' and expires_at < now();
  if exists (select 1 from public.delivery_assignments where order_id = o.id and status in ('offered','accepted','picked_up')) then return null; end if;

  v_dist := public.haversine_km(v_lat, v_lng, o.delivery_lat, o.delivery_lng);
  for r in
    select dp.*, public.haversine_km(dp.current_lat, dp.current_lng, v_lat, v_lng) as dist
    from public.delivery_partners dp
    where dp.status = 'active' and dp.is_online
      and dp.current_lat is not null
      and (dp.city_id is null or v_city is null or dp.city_id = v_city)
      and public.haversine_km(dp.current_lat, dp.current_lng, v_lat, v_lng) <= public.get_setting_num('dispatch_radius_km', 8)
      -- Nearest-first: a rider holding any open offer is skipped. Offer-everyone: only a rider already on a delivery is skipped.
      and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id
                      and a.status in ('accepted','picked_up') or (not v_all and a.rider_id = dp.id and a.status = 'offered'))
      and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.order_id = o.id and a.status = 'rejected')
    order by dist asc, dp.rating_avg desc
  loop
    insert into public.delivery_assignments (order_id, rider_id, status, expires_at, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount)
    values (o.id, r.id, 'offered', now() + make_interval(secs => v_timeout),
            v_lat, v_lng, o.delivery_lat, o.delivery_lng, round(v_dist::numeric, 2), o.rider_earning,
            case when o.payment_method = 'cod' then o.total else 0 end)
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
    v_count := v_count + 1;
    perform public._notify_rider_offer(r.user_id, o.id, o.order_number, v_id, 'New delivery request',
      format('Pickup from %s · %s · Earn ₹%s', coalesce(v_pp ->> 'name', 'Merta Deal'), case when v_dist is null then 'distance not known' else round(v_dist::numeric,1) || ' km' end, to_char(o.rider_earning,'FM9999990')));
    exit when not v_all;
  end loop;

  if v_count = 0 then
    if o.exception is distinct from 'no_rider' and o.exception is distinct from 'delivery_failed' then perform public._set_exception(o.id, 'no_rider'); end if;
    if not exists (select 1 from public.notifications x where x.type = 'dispatch_no_rider' and x.data ->> 'order_id' = o.id::text
                   and x.created_at > now() - make_interval(mins => v_window)) then
      perform public.audit('dispatch.no_rider', 'orders', o.id::text, null, jsonb_build_object('order_number', o.order_number));
      perform public.notify_admins('dispatch_no_rider', 'No rider available for ' || o.order_number,
        'The order is packed but no online rider is in range. Assign a rider from the order page, or it is offered automatically when one comes online.',
        jsonb_build_object('order_id', o.id, 'order_number', o.order_number));
    end if;
    return null;
  end if;
  if o.exception = 'no_rider' then perform public._set_exception(o.id, null); end if;
  return v_first;
end $$;

-- ---------------------------------------------------------------------------
-- 3. admin_assign_rider (0050 body; notification through _notify_rider_offer)
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_rider(p_order_id uuid, p_rider_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; dp public.delivery_partners; v_id uuid; v_dist numeric; v_pp jsonb := public.pickup_point();
  v_lat double precision := (v_pp ->> 'lat')::double precision; v_lng double precision := (v_pp ->> 'lng')::double precision;
  v_timeout numeric := public.get_setting_num('dispatch_offer_timeout_seconds', 180);
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  -- A rider is only sent for a packed bag (0050): assigning earlier left orders stuck at rider_assigned with nothing to collect.
  if o.status <> 'ready_for_pickup' then raise exception 'INVALID_STATE: %', o.status; end if;
  if exists (select 1 from public.delivery_assignments where order_id = o.id and status in ('accepted','picked_up')) then raise exception 'ALREADY_ASSIGNED'; end if;
  select * into dp from public.delivery_partners where id = p_rider_id and status = 'active';
  if dp.id is null then raise exception 'RIDER_NOT_FOUND'; end if;
  update public.delivery_assignments set status = 'cancelled', responded_at = coalesce(responded_at, now()) where order_id = o.id and status = 'offered';
  v_dist := public.haversine_km(v_lat, v_lng, o.delivery_lat, o.delivery_lng);
  insert into public.delivery_assignments (order_id, rider_id, status, expires_at, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount, note)
  values (o.id, dp.id, 'offered', now() + make_interval(secs => v_timeout), v_lat, v_lng, o.delivery_lat, o.delivery_lng, round(v_dist::numeric,2), o.rider_earning,
          case when o.payment_method = 'cod' then o.total else 0 end, 'Assigned by admin')
  returning id into v_id;
  if o.exception in ('no_rider', 'delivery_failed') then perform public._set_exception(o.id, null); end if;
  perform public._notify_rider_offer(dp.user_id, o.id, o.order_number, v_id, 'New delivery request (admin)',
    format('Pickup from %s · Earn ₹%s', coalesce(v_pp ->> 'name', 'Merta Deal'), to_char(o.rider_earning,'FM9999990')));
  perform public.audit('dispatch.manual_assign', 'orders', o.id::text, null, jsonb_build_object('rider_id', dp.id));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. rider_assignments (0050 body + arrival timestamps and handover method)
-- ---------------------------------------------------------------------------
create or replace function public.rider_assignments(p_status text[] default array['offered','accepted','picked_up'])
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; v_pp jsonb := public.pickup_point();
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  update public.delivery_assignments set status = 'expired' where rider_id = dp.id and status = 'offered' and expires_at < now();
  -- Heartbeat (0050): every poll of the rider app records that it is open, so a quiet rider can be set offline.
  update public.delivery_partners set last_seen_at = now() where id = dp.id;
  -- An active rider who is online picks up any packed order still waiting for a rider.
  if dp.status = 'active' and dp.is_online then perform public.dispatch_pending(); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'status', a.status, 'offered_at', a.offered_at, 'expires_at', a.expires_at, 'responded_at', a.responded_at,
      'picked_up_at', a.picked_up_at, 'delivered_at', a.delivered_at, 'distance_km', a.distance_km, 'earning', a.earning, 'cod_amount', a.cod_amount,
      'arrived_pickup_at', a.arrived_pickup_at, 'arrived_customer_at', a.arrived_customer_at, 'handover_method', a.handover_method,
      'pickup_lat', a.pickup_lat, 'pickup_lng', a.pickup_lng,
      'drop_lat', case when x.live then a.drop_lat else round(a.drop_lat::numeric, 3)::double precision end,
      'drop_lng', case when x.live then a.drop_lng else round(a.drop_lng::numeric, 3)::double precision end,
      'order', jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'total', o.total, 'item_count', o.item_count,
        'payment_method', o.payment_method,
        'delivery_instructions', case when x.live then o.delivery_instructions end,
        'address', case when x.live then o.address_snapshot
                        else jsonb_strip_nulls(jsonb_build_object('area', o.address_snapshot ->> 'area', 'city', o.address_snapshot ->> 'city', 'pincode', o.address_snapshot ->> 'pincode')) end,
        'promised_at', o.promised_at, 'created_at', o.created_at),
      'pickup', jsonb_build_object('name', coalesce(v_pp ->> 'name', 'Merta Deal'), 'phone', v_pp ->> 'phone', 'address_line1', v_pp ->> 'address_line1', 'area', v_pp ->> 'area',
                                   'lat', a.pickup_lat, 'lng', a.pickup_lng),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'pack_label', oi.pack_label, 'eggless', oi.eggless, 'cake_message', oi.cake_message)), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id)
    ) order by a.created_at desc), '[]'::jsonb)
    from public.delivery_assignments a
    cross join lateral (select a.status in ('accepted','picked_up') as live) x
    join public.orders o on o.id = a.order_id
    where a.rider_id = dp.id and a.status::text = any(p_status));
end $$;

-- Check
select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_notify_rider_offer')
  and position('arrived_pickup_at' in pg_get_functiondef('public.rider_assignments(text[])'::regprocedure)) > 0
  and position('_notify_rider_offer' in pg_get_functiondef('public.auto_dispatch(uuid)'::regprocedure)) > 0 as has_0051;

-- Final check
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'eggless_option') as has_0049,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'run_order_housekeeping') as has_0050,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_notify_rider_offer') as has_0051;
