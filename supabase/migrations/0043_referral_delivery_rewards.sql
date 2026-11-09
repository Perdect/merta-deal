-- Referral links: attribute a new customer's first delivered order, then grant free delivery.
-- Referral rewards are order credits so delivery is priced and consumed atomically by checkout.

insert into public.settings (key, value, "group", label, description, is_public) values
('referral_program_enabled', 'true', 'marketing', 'Referral program', 'Customers can invite new customers with their unique referral link.', true),
('referral_invitee_free_delivery_orders', '1', 'marketing', 'Invitee free deliveries', 'Number of standard delivery fee credits applied to a referred customer''s first order.', true),
('referral_free_delivery_orders', '1', 'marketing', 'Free deliveries per referral', 'Number of standard delivery fee credits granted after a referred customer''s first order is delivered.', true),
('referral_credit_expiry_days', '0', 'marketing', 'Referral credit expiry (days)', 'Days a free-delivery credit stays usable after it is granted. 0 = never expires. Applies to credits granted after the change.', true)
on conflict (key) do nothing;

create table public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null unique references public.profiles(id) on delete cascade,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending', 'rewarded')),
  converted_order_id uuid unique references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  check (referrer_id <> referred_id)
);
create index referral_attributions_referrer_idx on public.referral_attributions(referrer_id, created_at desc);

create table public.free_delivery_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  referral_id uuid not null references public.referral_attributions(id) on delete cascade,
  credit_number int not null check (credit_number > 0),
  first_order_only boolean not null default false,
  granted_at timestamptz not null default now(),
  /** Null = never expires; otherwise set from referral_credit_expiry_days when the credit is granted. */
  expires_at timestamptz,
  redeemed_order_id uuid unique references public.orders(id) on delete set null,
  redeemed_at timestamptz,
  unique (user_id, referral_id, credit_number)
);
create index free_delivery_credits_available_idx on public.free_delivery_credits(user_id, granted_at) where redeemed_order_id is null;

alter table public.referral_attributions enable row level security;
alter table public.free_delivery_credits enable row level security;
create policy referral_attributions_read on public.referral_attributions for select using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin());
create policy free_delivery_credits_read on public.free_delivery_credits for select using (user_id = auth.uid() or public.is_admin());

/** Expiry for a credit granted now, from settings (0 = never). */
create or replace function public._referral_credit_expiry()
returns timestamptz language sql stable security definer set search_path = public as $$
  select case when public.get_setting_num('referral_credit_expiry_days', 0) > 0
    then now() + make_interval(days => public.get_setting_num('referral_credit_expiry_days', 0)::int) end
$$;
revoke all on function public._referral_credit_expiry() from public, anon, authenticated;

create or replace function public.track_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_referrer uuid; v_status text; v_referral_id uuid; v_rows int; v_invitee_count int; i int;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.get_setting_bool('referral_program_enabled', true) then return jsonb_build_object('accepted', false, 'reason', 'The referral program is not active right now.'); end if;
  select id into v_referrer from public.profiles where upper(referral_code) = upper(trim(coalesce(p_code, ''))) and role = 'customer' and is_active;
  if v_referrer is null then return jsonb_build_object('accepted', false, 'reason', 'This referral link is not valid.'); end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'customer' and is_active) then
    return jsonb_build_object('accepted', false, 'reason', 'Referral links are for active customer accounts.');
  end if;
  if v_referrer = v_uid then return jsonb_build_object('accepted', false, 'reason', 'You cannot use your own referral link.'); end if;
  if exists (select 1 from public.orders where user_id = v_uid and status not in ('cancelled', 'rejected')) then return jsonb_build_object('accepted', false, 'reason', 'Referral links are for customers before their first active order.'); end if;

  insert into public.referral_attributions(referrer_id, referred_id, referral_code)
  values (v_referrer, v_uid, upper(trim(p_code))) on conflict (referred_id) do nothing;
  get diagnostics v_rows = row_count;
  select status into v_status from public.referral_attributions where referred_id = v_uid and referrer_id = v_referrer;
  if v_status is not null and v_rows > 0 then
    select id into v_referral_id from public.referral_attributions where referred_id = v_uid;
    v_invitee_count := greatest(0, public.get_setting_num('referral_invitee_free_delivery_orders', 1)::int);
    for i in 1..v_invitee_count loop
      insert into public.free_delivery_credits(user_id, referral_id, credit_number, first_order_only, expires_at)
      values (v_uid, v_referral_id, i, true, public._referral_credit_expiry()) on conflict (user_id, referral_id, credit_number) do nothing;
    end loop;
  end if;
  return jsonb_build_object('accepted', v_status is not null, 'status', v_status,
    'reason', case when v_status is null then 'A different referral link was already used for this account.' end);
end $$;
revoke all on function public.track_referral(text) from public, anon;
grant execute on function public.track_referral(text) to authenticated;

create or replace function public.my_referral_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  return jsonb_build_object(
    'pending', (select count(*) from public.referral_attributions where referrer_id = v_uid and status = 'pending'),
    'rewarded', (select count(*) from public.referral_attributions where referrer_id = v_uid and status = 'rewarded'),
    'credits_available', (select count(*) from public.free_delivery_credits c where c.user_id = v_uid and c.redeemed_order_id is null
      and (c.expires_at is null or c.expires_at > now())
      and (not c.first_order_only or not exists (select 1 from public.orders o where o.user_id = v_uid and o.status not in ('cancelled', 'rejected')))),
    'credits_used', (select count(*) from public.free_delivery_credits where user_id = v_uid and redeemed_order_id is not null),
    'credits_expired', (select count(*) from public.free_delivery_credits where user_id = v_uid and redeemed_order_id is null and expires_at is not null and expires_at <= now())
  );
end $$;
revoke all on function public.my_referral_stats() from public, anon;
grant execute on function public.my_referral_stats() to authenticated;

create or replace function public.award_referral_delivery(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_referral public.referral_attributions; v_count int; i int;
begin
  select r.* into v_referral from public.referral_attributions r join public.orders o on o.user_id = r.referred_id
  where o.id = p_order_id and r.status = 'pending' for update of r;
  if v_referral.id is null then return; end if;
  v_count := greatest(0, public.get_setting_num('referral_free_delivery_orders', 1)::int);
  for i in 1..v_count loop
    insert into public.free_delivery_credits(user_id, referral_id, credit_number, expires_at)
    values (v_referral.referrer_id, v_referral.id, i, public._referral_credit_expiry()) on conflict (user_id, referral_id, credit_number) do nothing;
  end loop;
  update public.referral_attributions set status = 'rewarded', converted_order_id = p_order_id, rewarded_at = now() where id = v_referral.id;
  if v_count > 0 then
    perform public.notify_user(v_referral.referrer_id, 'referral_reward', 'Free delivery earned',
      'A friend you invited completed their first delivered order. Your free delivery reward is ready.',
      jsonb_build_object('referral_id', v_referral.id, 'order_id', p_order_id));
  end if;
end $$;
revoke all on function public.award_referral_delivery(uuid) from public, anon, authenticated;

create or replace function public.on_referral_order_delivered()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.award_referral_delivery(new.id);
  return new;
end $$;
revoke all on function public.on_referral_order_delivered() from public, anon, authenticated;
create trigger orders_referral_delivered_trg after update of status on public.orders
  for each row when (new.status = 'delivered' and old.status is distinct from new.status)
  execute function public.on_referral_order_delivered();

create or replace function public.release_referral_delivery_credit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.free_delivery_credits set redeemed_order_id = null, redeemed_at = null where redeemed_order_id = new.id;
  return new;
end $$;
revoke all on function public.release_referral_delivery_credit() from public, anon, authenticated;
create trigger orders_referral_credit_release_trg after update of status on public.orders
  for each row when (new.status in ('cancelled', 'rejected') and old.status is distinct from new.status)
  execute function public.release_referral_delivery_credit();

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
  -- Pay by UPI before packing is on when both UPI settings are on and a UPI ID is set (0042).
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
  -- The promise is the delivery window the customer was shown at checkout.
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
    update public.inventory set stock_qty = stock_qty - v_item.quantity, sold_count = sold_count + v_item.quantity where id = v_item.inventory_id;
    insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, -v_item.quantity, 'order', v_order_id, v_uid);
    update public.products set popularity_score = popularity_score + v_item.quantity where id = v_item.product_id;
  end loop;

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
  -- Quick commerce: a paid or cash-on-delivery order is confirmed at once and goes straight to packing.
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
