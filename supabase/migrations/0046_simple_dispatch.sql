-- Simple dispatch (0046): two switches that remove manual steps from the daily flow.
--
-- * order_alert_require_accept (alerts, default on): when OFF, a new order still rings and shows on the
--   admin dashboard, but nothing "waits" for an admin to accept it: the popup disappears after the ring
--   window, the escalation to "unattended" is skipped, and the button reads "Got it". Orders are already
--   confirmed automatically (auto_accept_orders); this only removes the acknowledgement step. A direct UPI
--   order still has to have its payment confirmed, so those stay listed and escalate as before.
-- * dispatch_offer_all_riders (dispatch, default off): when ON, a packed order is offered to EVERY online,
--   free rider in range at once instead of the nearest one; the first to accept gets it and the other
--   offers are withdrawn (status 'expired', no notification). A rider who loses the race gets OFFER_TAKEN.
--   Delivered still comes only from the OTP check. Idempotent.

insert into public.settings (key, value, "group", label, description, is_public) values
  ('order_alert_require_accept', 'true', 'alerts', 'New orders must be accepted by an admin', 'On: a new order rings and waits until an admin taps Accept, and unattended orders escalate. Off: it rings for the ring window and then clears on its own; nothing waits. Orders are confirmed automatically either way.', false),
  ('dispatch_offer_all_riders', 'false', coalesce((select "group" from public.settings where key = 'dispatch_offer_timeout_seconds'), 'delivery'), 'Offer every packed order to all free riders', 'On: every online rider in range is offered the order at the same time and the first to accept gets it. Off: the nearest rider is offered first, then the next one if they decline or the offer times out.', false)
on conflict (key) do nothing;

-- Only one rider may hold (accepted / picked_up) an order, but several may be *offered* it at once.
drop index if exists public.delivery_assignments_one_live_per_order;
create unique index delivery_assignments_one_live_per_order on public.delivery_assignments(order_id) where status in ('accepted', 'picked_up');

-- ---------------------------------------------------------------------------
-- 1. Alert feed (0042 body + require_accept)
-- ---------------------------------------------------------------------------
create or replace function public.admin_order_alerts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_recover int := greatest(1, public.get_setting_num('order_alert_recover_minutes', 180))::int;
  v_require boolean := public.get_setting_bool('order_alert_require_accept', true);
  v_ring int := greatest(5, public.get_setting_num('order_alert_ring_seconds', 120))::int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform public.dispatch_pending();
  perform public.expire_item_exceptions();
  return jsonb_build_object(
    'now', now(),
    'ring_seconds', public.get_setting_num('order_alert_ring_seconds', 120),
    'reminder_seconds', case when v_require then public.get_setting_num('order_alert_reminder_seconds', 300) else 0 end,
    'require_accept', v_require,
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
        and (o.payment_method = 'cod' or o.payment_status in ('paid', 'authorized') or public._upi_waiting(o.id))
        -- No-accept mode: a plain order shows only while it rings; a UPI order waits for its payment check.
        and (v_require or public._upi_waiting(o.id) or o.created_at > now() - make_interval(secs => v_ring))));
end $$;

-- ---------------------------------------------------------------------------
-- 2. Escalation (0042 body): skipped in no-accept mode except for UPI payments still to confirm
-- ---------------------------------------------------------------------------
create or replace function public.escalate_unattended_orders()
returns int language plpgsql security definer set search_path = public as $$
declare v_min int := public.get_setting_num('order_alert_escalate_minutes', 10)::int;
  v_recover int := greatest(1, public.get_setting_num('order_alert_recover_minutes', 180))::int; r record; n int := 0;
  v_require boolean := public.get_setting_bool('order_alert_require_accept', true);
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_min <= 0 then return 0; end if;
  for r in
    select o.id, o.order_number, o.item_count, o.total, o.created_at from public.orders o
    where o.status in ('placed', 'confirmed', 'preparing') and o.accepted_at is null
      and o.created_at <= now() - make_interval(mins => v_min)
      and o.created_at > now() - make_interval(mins => v_recover)
      and (o.payment_method = 'cod' or o.payment_status in ('paid', 'authorized') or public._upi_waiting(o.id))
      and (v_require or public._upi_waiting(o.id))
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

-- ---------------------------------------------------------------------------
-- 3. auto_dispatch (0036 body + "offer everyone" mode)
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
    perform public.notify_user(r.user_id, 'delivery_offer', 'New delivery request',
      format('Pickup from %s · %s · Earn ₹%s', coalesce(v_pp ->> 'name', 'Merta Deal'), case when v_dist is null then 'distance not known' else round(v_dist::numeric,1) || ' km' end, to_char(o.rider_earning,'FM9999990')),
      jsonb_build_object('assignment_id', v_id, 'order_id', o.id, 'order_number', o.order_number));
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
-- 4. rider_respond_assignment (0037 body): first acceptance wins, the other offers are withdrawn
-- ---------------------------------------------------------------------------
create or replace function public.rider_respond_assignment(p_assignment_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; dp public.delivery_partners; o public.orders; v_next uuid; v_q jsonb;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or dp.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
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
    perform public.notify_admins('rider_assigned', 'Rider assigned for ' || o.order_number, 'A delivery partner is on the way to pick it up.', jsonb_build_object('order_id', o.id));
    return jsonb_build_object('ok', true, 'status', 'accepted', 'earning', (v_q ->> 'amount')::numeric);
  else
    update public.delivery_assignments set status = 'rejected', responded_at = now() where id = a.id;
    v_next := public.auto_dispatch(o.id);
    return jsonb_build_object('ok', true, 'status', 'rejected', 'reassigned_to', v_next);
  end if;
end $$;
