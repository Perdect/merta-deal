-- ============================================================================
-- MERTA DEAL — Quick-commerce order flow (Zepto/Blinkit style) and stuck-order fixes.
--
-- Why orders stayed at "Placed"
-- * Every order waited for a manual "Accept" in the store panel; nothing happened if nobody tapped it.
-- * A rider offer that timed out was never re-offered: auto_dispatch returned early while the stale
--   "offered" row existed, skipped any rider whose offer had expired, and nothing retried later.
-- * The promised time added the store's prep minutes on top of the zone window the customer saw at
--   checkout (35 min shown vs "20–25 min").
--
-- Changes
-- * settings.auto_accept_orders (default on): COD / already-paid orders are confirmed the moment they are
--   placed; online orders are confirmed when the payment is captured. The store's only job is to pack and
--   tap "Packed" (store_update_order 'ready'), which requests a rider. The store can still reject an order
--   it cannot fulfil before it is packed.
-- * promised_at / eta_minutes = the zone's eta_max (what checkout shows).
-- * auto_dispatch expires stale offers first, locks the order (no double offers from concurrent sweeps)
--   and only skips riders who explicitly declined this order — a missed offer is re-offered.
-- * dispatch_pending() re-offers every packed order with no live rider request. It runs whenever an
--   active, online rider loads their requests (rider app poll) and when a rider goes online.
-- Nothing here marks an order delivered: that remains verify_delivery_otp only.
-- ============================================================================

insert into public.settings (key, value, "group", label, description, is_public) values
('auto_accept_orders', 'true', 'orders', 'Confirm orders automatically',
 'Quick-commerce flow: cash-on-delivery and paid orders are confirmed immediately and go straight to packing. Turn off to require the store to accept each order.', false)
on conflict (key) do nothing;

-- Confirms a placed order without a separate customer notification (the caller sends one combined message).
create or replace function public._auto_confirm_order(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'store_confirmed', store_confirmed_at = now() where id = p_order_id and status = 'placed';
  if not found then return false; end if;
  insert into public.order_status_history (order_id, status, actor_id, actor_role, note)
  values (p_order_id, 'store_confirmed', null, null, 'Confirmed automatically');
  return true;
end $$;
revoke all on function public._auto_confirm_order(uuid) from public, anon, authenticated;

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
  v_uid uuid := auth.uid(); v_cart public.carts; v_sum jsonb; v_store public.stores; v_addr public.addresses;
  v_order_id uuid; v_order_no text; v_total numeric; v_sub numeric; v_commission_rate numeric; v_commission numeric;
  v_otp text; v_item record; v_zone_id uuid; v_pay_status public.payment_status; v_provider public.payment_provider;
  v_eta int; v_coupon_id uuid; v_coupon_code text; v_coupon_disc numeric; v_payout numeric; v_rider_earning numeric;
  v_wallet numeric; v_auto boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_payment_method not in ('cod','upi','card','netbanking','wallet','razorpay') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_payment_method = 'cod' and not public.get_setting_bool('cod_enabled', true) then raise exception 'COD_DISABLED'; end if;

  select * into v_cart from public.carts where user_id = v_uid and status = 'active' for update;
  if v_cart.id is null or not exists (select 1 from public.cart_items where cart_id = v_cart.id) then raise exception 'CART_EMPTY'; end if;

  select * into v_addr from public.addresses where id = p_address_id and user_id = v_uid;
  if v_addr.id is null then raise exception 'ADDRESS_NOT_FOUND'; end if;

  v_sum := public.cart_summary(p_address_id, p_delivery_type);
  if not (v_sum ->> 'serviceable')::boolean then raise exception 'NOT_SERVICEABLE: %', v_sum ->> 'service_message'; end if;
  if jsonb_array_length(v_sum -> 'issues') > 0 then raise exception 'ITEMS_UNAVAILABLE: %', (v_sum -> 'issues')::text; end if;
  if not (v_sum ->> 'meets_min_order')::boolean then raise exception 'MIN_ORDER: Minimum order amount is ₹%', v_sum ->> 'min_order_amount'; end if;
  if p_delivery_type = 'express' and not coalesce((v_sum #>> '{zone,express_supported}')::boolean, false) then raise exception 'EXPRESS_UNAVAILABLE'; end if;
  if p_delivery_type = 'scheduled' and (p_scheduled_start is null or p_scheduled_start < now()) then raise exception 'INVALID_SLOT'; end if;

  select * into v_store from public.stores where id = v_cart.store_id for update;
  if v_store.status <> 'active' then raise exception 'STORE_UNAVAILABLE'; end if;
  if not v_store.is_open and p_delivery_type <> 'scheduled' then raise exception 'STORE_CLOSED'; end if;

  v_sub := (v_sum ->> 'subtotal')::numeric;
  v_total := (v_sum ->> 'total')::numeric;
  v_coupon_disc := (v_sum ->> 'coupon_discount')::numeric;
  v_coupon_id := case when v_coupon_disc > 0 then (v_sum #>> '{coupon,coupon_id}')::uuid end;
  v_coupon_code := case when v_coupon_disc > 0 then v_sum #>> '{coupon,code}' end;
  v_zone_id := (v_sum #>> '{zone,id}')::uuid;
  -- The promise is the delivery window the customer was shown at checkout (zone ETA, packing included).
  v_eta := (v_sum ->> 'eta_max_minutes')::int;

  v_commission_rate := coalesce(v_store.commission_rate, public.get_setting_num('commission_default_percent', 10));
  v_commission := round((v_sub - v_coupon_disc) * v_commission_rate / 100, 2);
  v_payout := (v_sub - v_coupon_disc) - v_commission;
  v_rider_earning := public.get_setting_num('rider_base_earning', 20) + ceil((v_sum ->> 'distance_km')::numeric) * public.get_setting_num('rider_per_km_earning', 5);

  if p_payment_method = 'wallet' then
    select wallet_balance into v_wallet from public.profiles where id = v_uid for update;
    if v_wallet < v_total then raise exception 'INSUFFICIENT_WALLET'; end if;
  end if;

  v_pay_status := case when p_payment_method = 'cod' then 'cod_pending' when p_payment_method = 'wallet' then 'paid' else 'pending' end;
  v_provider := case when p_payment_method = 'cod' then 'cod' when p_payment_method = 'wallet' then 'wallet' else 'razorpay' end;
  v_order_no := public.generate_order_number();
  v_otp := public.secure_otp4();

  insert into public.orders (
    order_number, user_id, store_id, zone_id, status, delivery_type, scheduled_slot_start, scheduled_slot_end,
    address_snapshot, delivery_lat, delivery_lng, delivery_instructions, payment_method, payment_status,
    subtotal, item_discount, coupon_id, coupon_code, coupon_discount, delivery_fee, platform_fee, tax_amount, total,
    commission_rate, commission_amount, store_payout_amount, rider_earning, item_count, eta_minutes, promised_at
  ) values (
    v_order_no, v_uid, v_store.id, v_zone_id, 'placed', p_delivery_type, p_scheduled_start, p_scheduled_end,
    to_jsonb(v_addr) - 'user_id', v_addr.lat, v_addr.lng, p_instructions, p_payment_method, v_pay_status,
    v_sub, (v_sum ->> 'item_savings')::numeric, v_coupon_id, v_coupon_code, v_coupon_disc,
    (v_sum ->> 'delivery_fee')::numeric + (v_sum ->> 'express_fee')::numeric, (v_sum ->> 'platform_fee')::numeric, (v_sum ->> 'tax')::numeric, v_total,
    v_commission_rate, v_commission, v_payout, v_rider_earning, (v_sum ->> 'item_count')::int, v_eta,
    case when p_delivery_type = 'scheduled' then p_scheduled_end else now() + make_interval(mins => v_eta) end
  ) returning id into v_order_id;

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
  update public.stores set total_orders = total_orders + 1 where id = v_store.id;

  insert into public.order_status_history (order_id, status, actor_id, actor_role, note) values (v_order_id, 'placed', v_uid, 'customer', null);
  -- Quick commerce: a paid or cash-on-delivery order is confirmed at once; the store goes straight to packing.
  v_auto := public.get_setting_bool('auto_accept_orders', true) and v_pay_status in ('cod_pending', 'paid');
  if v_auto then perform public._auto_confirm_order(v_order_id); end if;
  perform public.notify_user(v_uid, 'order_placed', case when v_auto then 'Order confirmed' else 'Order placed' end,
    case when v_auto then format('Order %s is confirmed and being packed by %s. Arriving in about %s minutes. Total ₹%s.', v_order_no, v_store.name, v_eta, to_char(v_total,'FM9999990.00'))
         else format('Order %s placed with %s. Total ₹%s. We''ll confirm it as soon as your payment is received.', v_order_no, v_store.name, to_char(v_total,'FM9999990.00')) end,
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'status', case when v_auto then 'store_confirmed' else 'placed' end));
  perform public.notify_store(v_store.id, 'new_order', 'New order ' || v_order_no,
    case when v_auto then format('%s items · ₹%s · %s. Pack it now and tap "Packed" — a rider is requested automatically.', (v_sum ->> 'item_count'), to_char(v_total,'FM9999990.00'), upper(p_payment_method::text))
         else format('%s items · ₹%s · %s. Waiting for online payment; it is confirmed automatically once paid.', (v_sum ->> 'item_count'), to_char(v_total,'FM9999990.00'), upper(p_payment_method::text)) end,
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no));
  perform public.audit('order.place', 'orders', v_order_id::text, null, jsonb_build_object('order_number', v_order_no, 'total', v_total));

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'total', v_total,
    'payment_required', v_provider = 'razorpay', 'payment_method', p_payment_method);
end $$;

create or replace function public.confirm_online_payment(p_order_id uuid, p_provider_order_id text, p_provider_payment_id text, p_signature text, p_raw jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; v_auto boolean := false;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  update public.payments set status = 'paid', provider_order_id = p_provider_order_id, provider_payment_id = p_provider_payment_id,
    provider_signature = p_signature, raw_response = coalesce(p_raw, raw_response) where order_id = p_order_id;
  update public.orders set payment_status = 'paid' where id = p_order_id;
  if o.status = 'placed' and public.get_setting_bool('auto_accept_orders', true) then v_auto := public._auto_confirm_order(o.id); end if;
  perform public.notify_user(o.user_id, 'payment', case when v_auto then 'Payment received · order confirmed' else 'Payment received' end,
    format('₹%s received for order %s.%s', to_char(o.total,'FM9999990.00'), o.order_number, case when v_auto then ' It is being packed now.' else '' end), jsonb_build_object('order_id', o.id));
  perform public.notify_store(o.store_id, 'payment_update', 'Payment confirmed for ' || o.order_number,
    case when v_auto then 'Online payment was successful. Pack the order and tap "Packed".' else 'Online payment was successful.' end, jsonb_build_object('order_id', o.id));
end $$;

create or replace function public.store_update_order(p_order_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_assignment uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if not (public.is_store_member(o.store_id) or public.is_admin()) then raise exception 'FORBIDDEN'; end if;

  case p_action
    when 'accept' then
      if o.status <> 'placed' then raise exception 'INVALID_TRANSITION: % -> accept', o.status; end if;
      if o.payment_method not in ('cod') and o.payment_status not in ('paid','authorized') then raise exception 'PAYMENT_PENDING: Online payment has not been received yet'; end if;
      perform public._set_order_status(o.id, 'store_confirmed', p_note);
    when 'reject' then
      -- Allowed until the order is packed (auto-confirmed orders start at store_confirmed).
      if o.status not in ('placed','store_confirmed','preparing') then raise exception 'INVALID_TRANSITION: % -> reject', o.status; end if;
      for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
        update public.inventory set stock_qty = stock_qty + v_item.quantity, sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
        insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, v_item.quantity, 'reject_restock', o.id, auth.uid());
      end loop;
      update public.orders set reject_reason = p_note where id = o.id;
      perform public._handle_refund_on_cancel(o.id);
      perform public._set_order_status(o.id, 'rejected', p_note);
    when 'preparing' then
      if o.status <> 'store_confirmed' then raise exception 'INVALID_TRANSITION: % -> preparing', o.status; end if;
      perform public._set_order_status(o.id, 'preparing', p_note);
    when 'ready' then
      if o.status not in ('store_confirmed','preparing') then raise exception 'INVALID_TRANSITION: % -> ready', o.status; end if;
      perform public._set_order_status(o.id, 'ready_for_pickup', p_note);
      v_assignment := public.auto_dispatch(o.id);
    else raise exception 'UNKNOWN_ACTION';
  end case;
  return jsonb_build_object('ok', true, 'status', (select status from public.orders where id = o.id), 'assignment_id', v_assignment);
end $$;

create or replace function public.auto_dispatch(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; s public.stores; r record; v_id uuid; v_dist numeric;
begin
  -- Lock the order so two concurrent sweeps can't both offer it.
  select * into o from public.orders where id = p_order_id for update;
  if o.status not in ('ready_for_pickup') then return null; end if;
  -- Close timed-out offers first, so a missed offer doesn't block the order forever.
  update public.delivery_assignments set status = 'expired' where status = 'offered' and expires_at < now();
  if exists (select 1 from public.delivery_assignments where order_id = o.id and status in ('offered','accepted','picked_up')) then return null; end if;
  select * into s from public.stores where id = o.store_id;

  select dp.*, public.haversine_km(dp.current_lat, dp.current_lng, s.lat, s.lng) as dist into r
  from public.delivery_partners dp
  where dp.status = 'active' and dp.is_online
    and dp.current_lat is not null
    and (dp.city_id is null or dp.city_id = s.city_id)
    and public.haversine_km(dp.current_lat, dp.current_lng, s.lat, s.lng) <= public.get_setting_num('dispatch_radius_km', 8)
    and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.status in ('offered','accepted','picked_up'))
    -- Only a rider who declined this order is skipped; one who simply missed the offer gets it again.
    and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.order_id = o.id and a.status = 'rejected')
  order by dist asc, dp.rating_avg desc
  limit 1;

  if r.id is null then
    perform public.audit('dispatch.no_rider', 'orders', o.id::text, null, jsonb_build_object('order_number', o.order_number));
    return null;
  end if;

  v_dist := coalesce(public.haversine_km(s.lat, s.lng, o.delivery_lat, o.delivery_lng), 0);
  insert into public.delivery_assignments (order_id, rider_id, status, expires_at, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount)
  values (o.id, r.id, 'offered', now() + make_interval(secs => public.get_setting_num('dispatch_offer_timeout_seconds', 180)),
          s.lat, s.lng, o.delivery_lat, o.delivery_lng, round(v_dist::numeric, 2), o.rider_earning,
          case when o.payment_method = 'cod' then o.total else 0 end)
  returning id into v_id;

  perform public.notify_user(r.user_id, 'delivery_offer', 'New delivery request',
    format('Pickup from %s · %s km · Earn ₹%s', s.name, round(v_dist::numeric,1), to_char(o.rider_earning,'FM9999990')),
    jsonb_build_object('assignment_id', v_id, 'order_id', o.id, 'order_number', o.order_number));
  return v_id;
end $$;

-- Re-offers packed orders that have no live rider request (missed/expired offers, no rider online earlier,
-- failed delivery attempts). Cheap when there is nothing to do.
create or replace function public.dispatch_pending()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
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
revoke all on function public.dispatch_pending() from public, anon, authenticated;
grant execute on function public.dispatch_pending() to service_role;

create or replace function public.rider_set_online(p_online boolean, p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  if dp.status <> 'active' and p_online then raise exception 'RIDER_NOT_ACTIVE'; end if;
  update public.delivery_partners set is_online = p_online,
    current_lat = coalesce(p_lat, current_lat), current_lng = coalesce(p_lng, current_lng),
    last_location_at = case when p_lat is not null then now() else last_location_at end
  where id = dp.id;
  if p_online then perform public.dispatch_pending(); end if;
  return jsonb_build_object('ok', true, 'is_online', p_online);
end $$;

create or replace function public.rider_assignments(p_status text[] default array['offered','accepted','picked_up'])
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners;
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
      'store', jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone, 'address_line1', s.address_line1, 'area', s.area, 'lat', s.lat, 'lng', s.lng),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'pack_label', oi.pack_label)), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id)
    ) order by a.created_at desc), '[]'::jsonb)
    from public.delivery_assignments a
    cross join lateral (select a.status in ('accepted','picked_up') as live) x
    join public.orders o on o.id = a.order_id join public.stores s on s.id = o.store_id
    where a.rider_id = dp.id and a.status::text = any(p_status));
end $$;
