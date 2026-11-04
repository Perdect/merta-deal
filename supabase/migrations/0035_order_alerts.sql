-- ============================================================================
-- MERTA DEAL — Ringing order alerts for the admin dashboard and the rider app.
--
-- * An order is "accepted" when an admin taps Accept on the alert (or on the order page). Acceptance is
--   recorded once, on the order (accepted_at / accepted_by / accepted_by_name); every other admin
--   session sees the UPDATE over Realtime and stops ringing. Accepting a 'placed' order also confirms it
--   under the same payment rules as fulfil_order; an auto-confirmed order is simply marked accepted.
-- * admin_order_alerts() is the one feed the dashboard rings from: unaccepted, fulfilable orders, with
--   the ring / reminder policy from settings and the server clock. A prepaid order appears only once
--   its payment is verified, so nothing rings for an order that cannot be packed yet.
-- * escalate_unattended_orders() (cron / admin) sends every admin a push for an order nobody accepted
--   within the configured time, at most once per interval per order.
-- * auto_dispatch tells admins when a packed order finds no online rider in range, at most once per
--   window per order, instead of only writing an audit row.
-- Nothing here changes stock, payments or delivery; Delivered still comes only from the rider's OTP.
-- Idempotent (safe to re-run).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Settings (group "alerts")
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, "group", label, description, is_public) values
('order_alert_ring_seconds', '120', 'alerts', 'New order rings for (seconds)',
 'How long the admin dashboard rings for a new order before going quiet. The order stays on screen until someone accepts it.', false),
('order_alert_reminder_seconds', '300', 'alerts', 'Reminder ring every (seconds)',
 'While an order is still unaccepted, ring again this often (about 15 seconds each time). 0 turns reminders off.', false),
('order_alert_escalate_minutes', '10', 'alerts', 'Escalate unattended orders after (minutes)',
 'An order nobody has accepted for this long sends every admin a push notification, repeated at the same interval until accepted. 0 turns it off. Needs the notifications cron.', false),
('order_alert_recover_minutes', '180', 'alerts', 'Show unaccepted orders up to (minutes old)',
 'After a reconnect or a fresh sign-in the dashboard shows unaccepted orders no older than this.', false),
('dispatch_no_rider_alert_minutes', '5', 'alerts', 'No-rider alert at most every (minutes)',
 'When a packed order finds no online rider in range, admins are alerted at most this often per order.', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Acceptance on the order
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists accepted_at timestamptz;
alter table public.orders add column if not exists accepted_by uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists accepted_by_name text;
create index if not exists orders_unaccepted_idx on public.orders (created_at desc) where accepted_at is null;

-- Alert notifications are deduplicated per order; this keeps that lookup cheap.
create index if not exists notifications_alert_dedupe_idx on public.notifications (type, (data ->> 'order_id'), created_at desc)
  where type in ('order_unattended', 'dispatch_no_rider');

create or replace function public.admin_accept_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_already boolean := false;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status in ('cancelled', 'rejected') then raise exception 'ORDER_CLOSED: %', o.status; end if;
  if o.status = 'placed' then
    if o.payment_method <> 'cod' and o.payment_status not in ('paid', 'authorized') then raise exception 'PAYMENT_PENDING: Online payment has not been received yet'; end if;
    perform public._set_order_status(o.id, 'confirmed', 'Accepted');
  end if;
  if o.accepted_at is not null then
    v_already := true;
  else
    update public.orders set accepted_at = now(), accepted_by = auth.uid(), accepted_by_name = public._actor_name() where id = o.id;
    perform public.audit('order.accept', 'orders', o.id::text, null, jsonb_build_object('order_number', o.order_number));
  end if;
  select * into o from public.orders where id = o.id;
  return jsonb_build_object('ok', true, 'already', v_already, 'status', o.status, 'accepted_at', o.accepted_at,
    'accepted_by', o.accepted_by, 'accepted_by_name', o.accepted_by_name);
end $$;
revoke all on function public.admin_accept_order(uuid) from public, anon;
grant execute on function public.admin_accept_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The alert feed: everything an admin still has to accept
-- ---------------------------------------------------------------------------
create or replace function public.admin_order_alerts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_recover int := greatest(1, public.get_setting_num('order_alert_recover_minutes', 180))::int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  -- Packed orders still waiting for a rider are re-offered from here too, so dispatch does not depend on a rider polling.
  perform public.dispatch_pending();
  return jsonb_build_object(
    'now', now(),
    'ring_seconds', public.get_setting_num('order_alert_ring_seconds', 120),
    'reminder_seconds', public.get_setting_num('order_alert_reminder_seconds', 300),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'status', o.status, 'item_count', o.item_count, 'total', o.total,
        'payment_method', o.payment_method, 'payment_status', o.payment_status, 'delivery_type', o.delivery_type,
        'area', o.address_snapshot ->> 'area', 'city', o.address_snapshot ->> 'city',
        'created_at', o.created_at, 'promised_at', o.promised_at
      ) order by o.created_at), '[]'::jsonb)
      from public.orders o
      where o.status in ('placed', 'confirmed', 'preparing')
        and o.accepted_at is null
        and o.created_at > now() - make_interval(mins => v_recover)
        and (o.payment_method = 'cod' or o.payment_status in ('paid', 'authorized'))));
end $$;
revoke all on function public.admin_order_alerts() from public, anon;
grant execute on function public.admin_order_alerts() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Escalation: nobody accepted the order in time
-- ---------------------------------------------------------------------------
create or replace function public.escalate_unattended_orders()
returns int language plpgsql security definer set search_path = public as $$
declare v_min int := public.get_setting_num('order_alert_escalate_minutes', 10)::int;
  v_recover int := greatest(1, public.get_setting_num('order_alert_recover_minutes', 180))::int; r record; n int := 0;
begin
  -- The cron calls this with the service role (no user); a signed-in caller must be an admin.
  if auth.uid() is not null and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_min <= 0 then return 0; end if;
  for r in
    select o.id, o.order_number, o.item_count, o.total, o.created_at from public.orders o
    where o.status in ('placed', 'confirmed', 'preparing') and o.accepted_at is null
      and o.created_at <= now() - make_interval(mins => v_min)
      and o.created_at > now() - make_interval(mins => v_recover)
      and (o.payment_method = 'cod' or o.payment_status in ('paid', 'authorized'))
      and not exists (select 1 from public.notifications x where x.type = 'order_unattended' and x.data ->> 'order_id' = o.id::text
                      and x.created_at > now() - make_interval(mins => v_min))
    order by o.created_at
  loop
    perform public.notify_admins('order_unattended', format('Order %s is still waiting', r.order_number),
      format('Nobody has accepted it for %s minutes · %s items · ₹%s', greatest(1, floor(extract(epoch from now() - r.created_at) / 60))::int, r.item_count, to_char(r.total, 'FM9999990.00')),
      jsonb_build_object('order_id', r.id, 'order_number', r.order_number));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.escalate_unattended_orders() from public, anon;
grant execute on function public.escalate_unattended_orders() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. auto_dispatch: alert admins when no rider is available (0030 body + the alert)
-- ---------------------------------------------------------------------------
create or replace function public.auto_dispatch(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; r record; v_id uuid; v_dist numeric; v_pp jsonb := public.pickup_point();
  v_lat double precision := (v_pp ->> 'lat')::double precision; v_lng double precision := (v_pp ->> 'lng')::double precision; v_city uuid := (v_pp ->> 'city_id')::uuid;
  v_window int := greatest(1, public.get_setting_num('dispatch_no_rider_alert_minutes', 5))::int;
begin
  -- Lock the order so two concurrent sweeps can't both offer it.
  select * into o from public.orders where id = p_order_id for update;
  if o.status not in ('ready_for_pickup') then return null; end if;
  -- Close timed-out offers first, so a missed offer doesn't block the order forever.
  update public.delivery_assignments set status = 'expired' where status = 'offered' and expires_at < now();
  if exists (select 1 from public.delivery_assignments where order_id = o.id and status in ('offered','accepted','picked_up')) then return null; end if;

  select dp.*, public.haversine_km(dp.current_lat, dp.current_lng, v_lat, v_lng) as dist into r
  from public.delivery_partners dp
  where dp.status = 'active' and dp.is_online
    and dp.current_lat is not null
    and (dp.city_id is null or v_city is null or dp.city_id = v_city)
    and public.haversine_km(dp.current_lat, dp.current_lng, v_lat, v_lng) <= public.get_setting_num('dispatch_radius_km', 8)
    and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.status in ('offered','accepted','picked_up'))
    -- Only a rider who declined this order is skipped; one who simply missed the offer gets it again.
    and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.order_id = o.id and a.status = 'rejected')
  order by dist asc, dp.rating_avg desc
  limit 1;

  if r.id is null then
    -- Sweeps run every few seconds from every open dashboard and rider app: alert (and audit) once per window per order.
    if not exists (select 1 from public.notifications x where x.type = 'dispatch_no_rider' and x.data ->> 'order_id' = o.id::text
                   and x.created_at > now() - make_interval(mins => v_window)) then
      perform public.audit('dispatch.no_rider', 'orders', o.id::text, null, jsonb_build_object('order_number', o.order_number));
      perform public.notify_admins('dispatch_no_rider', 'No rider available for ' || o.order_number,
        'The order is packed but no online rider is in range. Assign a rider from the order page, or it is offered automatically when one comes online.',
        jsonb_build_object('order_id', o.id, 'order_number', o.order_number));
    end if;
    return null;
  end if;

  -- A customer address without a map pin has no distance; the rider sees "no pin" rather than a made-up 0 km.
  v_dist := public.haversine_km(v_lat, v_lng, o.delivery_lat, o.delivery_lng);
  insert into public.delivery_assignments (order_id, rider_id, status, expires_at, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount)
  values (o.id, r.id, 'offered', now() + make_interval(secs => public.get_setting_num('dispatch_offer_timeout_seconds', 180)),
          v_lat, v_lng, o.delivery_lat, o.delivery_lng, round(v_dist::numeric, 2), o.rider_earning,
          case when o.payment_method = 'cod' then o.total else 0 end)
  returning id into v_id;

  perform public.notify_user(r.user_id, 'delivery_offer', 'New delivery request',
    format('Pickup from %s · %s · Earn ₹%s', coalesce(v_pp ->> 'name', 'Merta Deal'), case when v_dist is null then 'distance not known' else round(v_dist::numeric,1) || ' km' end, to_char(o.rider_earning,'FM9999990')),
    jsonb_build_object('assignment_id', v_id, 'order_id', o.id, 'order_number', o.order_number));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Distance is a fact or unknown, never a placeholder 0 (0030 admin_assign_rider body + the same rule)
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_rider(p_order_id uuid, p_rider_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; dp public.delivery_partners; v_id uuid; v_dist numeric; v_pp jsonb := public.pickup_point();
  v_lat double precision := (v_pp ->> 'lat')::double precision; v_lng double precision := (v_pp ->> 'lng')::double precision;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.status not in ('ready_for_pickup','preparing','confirmed') then raise exception 'INVALID_STATE: %', o.status; end if;
  select * into dp from public.delivery_partners where id = p_rider_id and status = 'active';
  if dp.id is null then raise exception 'RIDER_NOT_FOUND'; end if;
  update public.delivery_assignments set status = 'cancelled' where order_id = o.id and status = 'offered';
  v_dist := public.haversine_km(v_lat, v_lng, o.delivery_lat, o.delivery_lng);
  insert into public.delivery_assignments (order_id, rider_id, status, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount, note)
  values (o.id, dp.id, 'offered', v_lat, v_lng, o.delivery_lat, o.delivery_lng, round(v_dist::numeric,2), o.rider_earning,
          case when o.payment_method = 'cod' then o.total else 0 end, 'Assigned by admin')
  returning id into v_id;
  perform public.notify_user(dp.user_id, 'delivery_offer', 'New delivery request (admin)', format('Pickup from %s · Earn ₹%s', coalesce(v_pp ->> 'name', 'Merta Deal'), to_char(o.rider_earning,'FM9999990')),
    jsonb_build_object('assignment_id', v_id, 'order_id', o.id, 'order_number', o.order_number));
  perform public.audit('dispatch.manual_assign', 'orders', o.id::text, null, jsonb_build_object('rider_id', dp.id));
  return v_id;
end $$;

-- Earlier assignments for orders without a pin were stored as 0.00 km; that was never a measurement.
update public.delivery_assignments set distance_km = null where distance_km = 0 and (drop_lat is null or drop_lng is null);

-- ---------------------------------------------------------------------------
-- 7. A tap on an expired offer: the expiry is recorded (a RAISE used to roll it back) and the order is
--    re-offered at once, instead of waiting for the next sweep. The app gets {ok:false, error:'OFFER_EXPIRED'}.
-- ---------------------------------------------------------------------------
create or replace function public.rider_respond_assignment(p_assignment_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; dp public.delivery_partners; o public.orders; v_next uuid;
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
    if exists (select 1 from public.delivery_assignments where rider_id = dp.id and status in ('accepted','picked_up')) then raise exception 'ALREADY_ON_DELIVERY'; end if;
    update public.delivery_assignments set status = 'accepted', responded_at = now() where id = a.id;
    perform public._set_order_status(o.id, 'rider_assigned', null);
    perform public.notify_admins('rider_assigned', 'Rider assigned for ' || o.order_number, 'A delivery partner is on the way to pick it up.', jsonb_build_object('order_id', o.id));
    return jsonb_build_object('ok', true, 'status', 'accepted');
  else
    update public.delivery_assignments set status = 'rejected', responded_at = now() where id = a.id;
    v_next := public.auto_dispatch(o.id);
    return jsonb_build_object('ok', true, 'status', 'rejected', 'reassigned_to', v_next);
  end if;
end $$;
