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
