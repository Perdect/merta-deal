-- 0042: Pay by UPI before packing. The customer pays the business UPI ID (PhonePe, Google Pay, Paytm)
-- right after ordering; the order waits as placed / payment pending until an admin marks the payment
-- received under Payments, which confirms the order in the same step. There is no gateway, so the
-- admin's bank is the confirmation. "Not received" keeps the order waiting and tells the customer;
-- the customer can also switch an unpaid order to cash on delivery.

alter type public.payment_provider add value if not exists 'upi';

insert into public.settings (key, value, "group", label, description, is_public) values
('upi_pay_now_enabled', 'true', 'payments', 'UPI before packing', 'Customers can choose to pay by UPI (PhonePe, Google Pay, Paytm) right after ordering. The order is confirmed when you mark the payment received under Payments.', true)
on conflict (key) do nothing;

/** True while an order is waiting for a direct UPI payment (placed, pending, paid to the business UPI ID). */
create or replace function public._upi_waiting(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o join public.payments p on p.order_id = o.id
    where o.id = p_order_id and o.payment_status = 'pending' and p.provider::text = 'upi' and p.status = 'pending');
$$;
revoke all on function public._upi_waiting(uuid) from public, anon, authenticated;

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
  v_wallet numeric; v_auto boolean; v_brand text := coalesce(public.get_setting('brand_name') #>> '{}', 'Merta Deal');
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

create or replace function public.admin_accept_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_already boolean := false;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status in ('cancelled', 'rejected') then raise exception 'ORDER_CLOSED: %', o.status; end if;
  if o.status = 'placed' then
    if o.payment_method <> 'cod' and o.payment_status not in ('paid', 'authorized') then
      if public._upi_waiting(o.id) then raise exception 'PAYMENT_PENDING: The UPI payment has not been marked received yet. Check your bank, then tap "Payment received".'; end if;
      raise exception 'PAYMENT_PENDING: Online payment has not been received yet';
    end if;
    perform public._set_order_status(o.id, 'confirmed', 'Accepted');
  end if;
  if o.accepted_at is not null then
    v_already := true;
  else
    update public.orders set accepted_at = now(), accepted_by = auth.uid(), accepted_by_name = public._actor_name() where id = o.id;
    if o.exception = 'unattended' then perform public._set_exception(o.id, null); end if;
    perform public.audit('order.accept', 'orders', o.id::text, null, jsonb_build_object('order_number', o.order_number));
  end if;
  select * into o from public.orders where id = o.id;
  return jsonb_build_object('ok', true, 'already', v_already, 'status', o.status, 'accepted_at', o.accepted_at,
    'accepted_by', o.accepted_by, 'accepted_by_name', o.accepted_by_name);
end $$;

create or replace function public.admin_order_alerts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_recover int := greatest(1, public.get_setting_num('order_alert_recover_minutes', 180))::int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform public.dispatch_pending();
  perform public.expire_item_exceptions();
  return jsonb_build_object(
    'now', now(),
    'ring_seconds', public.get_setting_num('order_alert_ring_seconds', 120),
    'reminder_seconds', public.get_setting_num('order_alert_reminder_seconds', 300),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'status', o.status, 'item_count', o.item_count, 'total', o.total,
        'payment_method', o.payment_method, 'payment_status', o.payment_status, 'delivery_type', o.delivery_type,
        'area', o.address_snapshot ->> 'area', 'city', o.address_snapshot ->> 'city',
        'created_at', o.created_at, 'promised_at', o.promised_at,
        'upi_pending', public._upi_waiting(o.id),
        'upi_reference', (select p.provider_payment_id from public.payments p where p.order_id = o.id and p.provider = 'upi' and p.status = 'pending' order by p.created_at desc limit 1),
        'upi_claimed_at', (select p.raw_response ->> 'claimed_at' from public.payments p where p.order_id = o.id and p.provider = 'upi' and p.status = 'pending' order by p.created_at desc limit 1)
      ) order by o.created_at), '[]'::jsonb)
      from public.orders o
      where o.status in ('placed', 'confirmed', 'preparing')
        and o.accepted_at is null
        and o.created_at > now() - make_interval(mins => v_recover)
        and (o.payment_method = 'cod' or o.payment_status in ('paid', 'authorized') or public._upi_waiting(o.id))));
end $$;

create or replace function public.escalate_unattended_orders()
returns int language plpgsql security definer set search_path = public as $$
declare v_min int := public.get_setting_num('order_alert_escalate_minutes', 10)::int;
  v_recover int := greatest(1, public.get_setting_num('order_alert_recover_minutes', 180))::int; r record; n int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_min <= 0 then return 0; end if;
  for r in
    select o.id, o.order_number, o.item_count, o.total, o.created_at from public.orders o
    where o.status in ('placed', 'confirmed', 'preparing') and o.accepted_at is null
      and o.created_at <= now() - make_interval(mins => v_min)
      and o.created_at > now() - make_interval(mins => v_recover)
      and (o.payment_method = 'cod' or o.payment_status in ('paid', 'authorized') or public._upi_waiting(o.id))
      and not exists (select 1 from public.notifications x where x.type = 'order_unattended' and x.data ->> 'order_id' = o.id::text
                      and x.created_at > now() - make_interval(mins => v_min))
    order by o.created_at
  loop
    perform public._set_exception(r.id, 'unattended');
    perform public.notify_admins('order_unattended', format('Order %s is still waiting', r.order_number),
      format('Nobody has accepted it for %s minutes · %s items · ₹%s', greatest(1, floor(extract(epoch from now() - r.created_at) / 60))::int, r.item_count, to_char(r.total, 'FM9999990.00')),
      jsonb_build_object('order_id', r.id, 'order_number', r.order_number));
    n := n + 1;
  end loop;
  return n;
end $$;

/** The customer says they have paid: the reference (optional) is kept for the admin to match, and admins are told. */
create or replace function public.customer_upi_claim(p_order_id uuid, p_reference text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; pm public.payments; v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into o from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status <> 'placed' or not public._upi_waiting(o.id) then raise exception 'UPI: This order is not waiting for a UPI payment.'; end if;
  if v_ref is not null and char_length(v_ref) > 40 then raise exception 'UPI: The reference is too long.'; end if;
  select * into pm from public.payments where order_id = o.id and provider::text = 'upi' and status = 'pending' order by created_at desc limit 1 for update;
  update public.payments set provider_payment_id = coalesce(v_ref, provider_payment_id),
    raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object('claimed_at', now(), 'claimed_reference', v_ref)
    where id = pm.id;
  perform public.notify_admins('upi_to_confirm', format('Confirm UPI payment for %s', o.order_number),
    format('Customer says ₹%s was paid by UPI%s. Check the bank, then mark it received under Payments to confirm the order.', to_char(o.total, 'FM9999990.00'), case when v_ref is null then '' else ' · ref ' || v_ref end),
    jsonb_build_object('order_id', o.id, 'order_number', o.order_number));
  perform public.audit('upi.claim', 'payments', pm.id::text, null, jsonb_build_object('order_number', o.order_number, 'reference', v_ref));
  return jsonb_build_object('ok', true, 'claimed_at', now(), 'reference', v_ref);
end $$;
revoke execute on function public.customer_upi_claim(uuid, text) from public, anon;
grant execute on function public.customer_upi_claim(uuid, text) to authenticated;

/** An unpaid UPI order becomes cash on delivery; from then on it is an ordinary cash order (auto-confirmed when that is on). */
create or replace function public.customer_upi_to_cash(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; pm public.payments; v_auto boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.get_setting_bool('cod_enabled', true) then raise exception 'COD_DISABLED'; end if;
  select * into o from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status <> 'placed' or not public._upi_waiting(o.id) then raise exception 'UPI: This order is not waiting for a UPI payment.'; end if;
  select * into pm from public.payments where order_id = o.id and provider::text = 'upi' and status = 'pending' order by created_at desc limit 1 for update;
  update public.payments set provider = 'cod', method = 'cod', status = 'cod_pending',
    raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object('switched_to_cash_at', now()) where id = pm.id;
  update public.orders set payment_method = 'cod', payment_status = 'cod_pending' where id = o.id;
  v_auto := public.get_setting_bool('auto_accept_orders', true);
  if v_auto then v_auto := public._auto_confirm_order(o.id); end if;
  perform public.notify_user(o.user_id, 'order_placed', case when v_auto then 'Order confirmed' else 'Order placed' end,
    case when v_auto then format('Order %s is confirmed and being packed. Keep ₹%s ready for the rider.', o.order_number, to_char(o.total, 'FM9999990.00'))
         else format('Order %s will be paid in cash on delivery. We''ll confirm it shortly.', o.order_number) end,
    jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'status', case when v_auto then 'confirmed' else 'placed' end));
  perform public.notify_admins('new_order', 'New order ' || o.order_number,
    format('%s items · ₹%s · cash on delivery (the customer switched from UPI). Pack it and tap "Packed".', o.item_count, to_char(o.total, 'FM9999990.00')),
    jsonb_build_object('order_id', o.id, 'order_number', o.order_number));
  perform public.audit('upi.to_cash', 'orders', o.id::text, null, jsonb_build_object('order_number', o.order_number));
  select * into o from public.orders where id = o.id;
  return jsonb_build_object('ok', true, 'status', o.status, 'payment_method', o.payment_method, 'payment_status', o.payment_status);
end $$;
revoke execute on function public.customer_upi_to_cash(uuid) from public, anon;
grant execute on function public.customer_upi_to_cash(uuid) to authenticated;

/** Orders waiting for a direct UPI payment, oldest first, with what the customer told us. */
create or replace function public.admin_pending_upi_orders()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'order_id', o.id, 'order_number', o.order_number, 'amount', p.amount, 'customer', pr.full_name, 'phone', pr.phone,
      'placed_at', o.created_at, 'claimed_at', p.raw_response ->> 'claimed_at', 'reference', p.provider_payment_id, 'checked_at', p.raw_response ->> 'checked_at')
      order by o.created_at)
    from public.orders o join public.payments p on p.order_id = o.id and p.provider::text = 'upi' and p.status = 'pending'
    left join public.profiles pr on pr.id = o.user_id
    where o.status = 'placed' and o.payment_status = 'pending'), '[]'::jsonb);
end $$;
revoke execute on function public.admin_pending_upi_orders() from public, anon;
grant execute on function public.admin_pending_upi_orders() to authenticated;

/**
 * Received: the bank reference is recorded, the payment is paid and the order is confirmed and accepted
 * by this admin in one step. Not received: the order keeps waiting and the customer is told to pay or
 * switch to cash; cancelling stays a separate, deliberate action.
 */
create or replace function public.admin_confirm_upi_payment(p_order_id uuid, p_received boolean, p_reference text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; pm public.payments; v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status in ('cancelled', 'rejected') then raise exception 'ORDER_CLOSED: %', o.status; end if;
  if not public._upi_waiting(o.id) then raise exception 'UPI: This order has no UPI payment waiting to be confirmed.'; end if;
  select * into pm from public.payments where order_id = o.id and provider::text = 'upi' and status = 'pending' order by created_at desc limit 1 for update;
  if p_received then
    if v_ref is null or char_length(v_ref) < 4 then raise exception 'UPI: Enter the UPI reference from your bank.'; end if;
    if exists (select 1 from public.payments x where x.provider::text = 'upi' and x.status = 'paid' and x.provider_payment_id = v_ref and x.id <> pm.id) then raise exception 'UPI: That reference is already used on another order.'; end if;
    update public.payments set status = 'paid', provider_payment_id = v_ref,
      raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object('confirmed_at', now(), 'confirmed_by', auth.uid()) where id = pm.id;
    update public.orders set payment_status = 'paid' where id = o.id;
    if o.status = 'placed' then perform public._set_order_status(o.id, 'confirmed', 'UPI payment received'); end if;
    if o.accepted_at is null then
      update public.orders set accepted_at = now(), accepted_by = auth.uid(), accepted_by_name = public._actor_name() where id = o.id;
      if o.exception = 'unattended' then perform public._set_exception(o.id, null); end if;
    end if;
    perform public.notify_user(o.user_id, 'payment', 'Payment received', format('We received ₹%s for order %s. Thank you!', to_char(pm.amount, 'FM9999990.00'), o.order_number),
      jsonb_build_object('order_id', o.id, 'order_number', o.order_number));
    perform public.audit('upi.payment_confirm', 'payments', pm.id::text, null, jsonb_build_object('order_number', o.order_number, 'reference', v_ref, 'amount', pm.amount));
  else
    update public.payments set failure_reason = 'Not found in the bank',
      raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object('checked_at', now(), 'checked_by', auth.uid()) where id = pm.id;
    perform public.notify_user(o.user_id, 'payment', 'We could not find your UPI payment',
      format('Order %s: no UPI payment of ₹%s has reached us yet. Pay from the order page, or switch the order to cash on delivery.', o.order_number, to_char(pm.amount, 'FM9999990.00')),
      jsonb_build_object('order_id', o.id, 'order_number', o.order_number));
    perform public.audit('upi.payment_not_found', 'payments', pm.id::text, null, jsonb_build_object('order_number', o.order_number, 'amount', pm.amount));
  end if;
  select * into o from public.orders where id = o.id;
  return jsonb_build_object('ok', true, 'received', p_received, 'status', o.status, 'payment_status', o.payment_status, 'accepted_by_name', o.accepted_by_name);
end $$;
revoke execute on function public.admin_confirm_upi_payment(uuid, boolean, text) from public, anon;
grant execute on function public.admin_confirm_upi_payment(uuid, boolean, text) to authenticated;

/** Unpaid gateway orders still expire; a UPI order the customer says they paid waits for the admin instead. */
create or replace function public.expire_unpaid_orders(p_minutes int default 30)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  for r in select o.id from public.orders o
    where o.status = 'placed' and o.payment_status = 'pending' and o.payment_method <> 'cod' and o.created_at < now() - make_interval(mins => p_minutes)
      and not exists (select 1 from public.payments p where p.order_id = o.id and p.provider::text = 'upi' and p.status = 'pending' and p.raw_response ? 'claimed_at')
  loop
    perform public.cancel_order(r.id, 'Payment not completed');
    n := n + 1;
  end loop;
  return n;
end $$;
