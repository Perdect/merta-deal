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
