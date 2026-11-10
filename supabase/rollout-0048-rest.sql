-- Inventory reservations (0048), remaining part: the order lifecycle functions. Parts A (columns, passbook,
-- _inv_move, order helpers, backfill) and D (wholesale placement, adjust_stock, admin reads) are already applied.
-- Paste the whole file into the Supabase SQL editor and run it once; the last row must read has_0048_rest = true.

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

-- check
select position('_order_reserve_stock' in pg_get_functiondef('public.place_order'::regproc)) > 0 and position('_order_release_stock' in pg_get_functiondef('public.cancel_order'::regproc)) > 0 and position('_order_finalise_stock' in pg_get_functiondef('public._complete_delivery'::regproc)) > 0 as has_0048_rest;
