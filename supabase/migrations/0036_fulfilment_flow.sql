-- ============================================================================
-- MERTA DEAL — Fulfilment flow, stage 2: the gaps between "order placed" and "delivered".
--
-- * Capacity: settings.max_active_orders (0 = unlimited) stops new orders when the shop is swamped,
--   enforced by a trigger so every path that inserts an order obeys it.
-- * Exceptions: orders.exception marks an order that needs a person (no rider in range, nobody
--   accepted it, a delivery attempt failed, an item is unavailable). The admin Exceptions tab reads it.
-- * Unavailable items: an admin raises an exception on an order line while packing; the customer
--   approves a reduced quantity (or removal) or declines and the order is cancelled. Nothing is
--   substituted or re-priced without that approval. Stock for the released quantity returns to the
--   shelf, the bill is recomputed, and any prepaid difference is recorded for refund.
-- * Rider arrival at the pickup point and at the customer is recorded on the assignment; the handover
--   (who, how, when) is recorded whether an admin scans the bag, the rider scans it, or the rider
--   taps "collected" (which can be disallowed with settings.handover_requires_scan).
-- * Cancelling an order tells the assigned rider, not only the admins and the customer.
-- * A repeated payment callback for an already-paid order changes nothing and sends nothing.
-- * products.bin_location: where the item sits in the store, shown on pick lists.
-- Delivered still comes only from verify_delivery_otp / admin_confirm_delivery. Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, "group", label, description, is_public) values
('max_active_orders', '0', 'orders', 'Maximum active orders', 'New orders are refused while this many orders are being packed or delivered. 0 means no limit.', true),
('handover_requires_scan', 'false', 'orders', 'Pickup needs a bag scan', 'When on, a rider can only mark an order collected by scanning the bag label (or an admin scanning it). Off: the rider can tap "collected".', false),
('item_exception_timeout_minutes', '20', 'orders', 'Customer approval window (minutes)', 'How long a customer has to approve a reduced quantity before the exception is marked expired for an admin to decide.', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Columns
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists exception text;
alter table public.orders add column if not exists exception_at timestamptz;
create index if not exists orders_exception_idx on public.orders (exception_at desc) where exception is not null;

alter table public.products add column if not exists bin_location text;

alter table public.delivery_assignments add column if not exists arrived_pickup_at timestamptz;
alter table public.delivery_assignments add column if not exists arrived_customer_at timestamptz;
alter table public.delivery_assignments add column if not exists handed_over_at timestamptz;
alter table public.delivery_assignments add column if not exists handed_over_by uuid references public.profiles(id) on delete set null;
alter table public.delivery_assignments add column if not exists handed_over_by_name text;
alter table public.delivery_assignments add column if not exists handover_method text;

create table if not exists public.order_exceptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  kind text not null check (kind in ('unavailable', 'short')),
  requested_qty int not null,
  available_qty int not null check (available_qty >= 0),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'expired', 'withdrawn')),
  refund_amount numeric(10,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  expires_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists order_exceptions_order_idx on public.order_exceptions (order_id, created_at desc);
alter table public.order_exceptions enable row level security;
drop policy if exists order_exceptions_read on public.order_exceptions;
create policy order_exceptions_read on public.order_exceptions for select
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_exceptions') then
    execute 'alter publication supabase_realtime add table public.order_exceptions';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Capacity (trigger: every insert path obeys it)
-- ---------------------------------------------------------------------------
create or replace function public.order_capacity()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'max', public.get_setting_num('max_active_orders', 0)::int,
    'active', (select count(*) from public.orders where status in ('placed','confirmed','preparing','ready_for_pickup','rider_assigned','out_for_delivery'))::int,
    'accepting', public.get_setting_num('max_active_orders', 0) <= 0
      or (select count(*) from public.orders where status in ('placed','confirmed','preparing','ready_for_pickup','rider_assigned','out_for_delivery')) < public.get_setting_num('max_active_orders', 0));
$$;
grant execute on function public.order_capacity() to anon, authenticated;

create or replace function public.orders_capacity_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_max int := public.get_setting_num('max_active_orders', 0)::int;
begin
  if v_max > 0 and (select count(*) from public.orders where status in ('placed','confirmed','preparing','ready_for_pickup','rider_assigned','out_for_delivery')) >= v_max then
    raise exception 'CAPACITY_FULL: We are handling as many orders as we can right now. Please try again in a few minutes.';
  end if;
  return new;
end $$;
drop trigger if exists orders_capacity_trg on public.orders;
create trigger orders_capacity_trg before insert on public.orders for each row execute function public.orders_capacity_guard();

-- ---------------------------------------------------------------------------
-- 4. Pick list: bin location on every line (0034 body + bin)
-- ---------------------------------------------------------------------------
create or replace function public._pack_lines(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', oi.id, 'product_id', oi.product_id, 'name', oi.product_name, 'brand_name', oi.brand_name, 'pack_label', oi.pack_label, 'image_url', oi.image_url,
      'quantity', oi.quantity, 'packed_qty', oi.packed_qty, 'sku', p.sku, 'unit_price', oi.unit_price, 'bin_location', p.bin_location,
      'exception', (select jsonb_build_object('id', x.id, 'status', x.status, 'available_qty', x.available_qty, 'kind', x.kind)
                    from public.order_exceptions x where x.order_item_id = oi.id order by x.created_at desc limit 1))
    order by oi.packed_qty >= oi.quantity, p.bin_location nulls last, oi.product_name), '[]'::jsonb)
  from public.order_items oi left join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id;
$$;

-- ---------------------------------------------------------------------------
-- 5. Rider arrival (recorded, idempotent) and handover record
-- ---------------------------------------------------------------------------
create or replace function public.rider_mark_arrived(p_assignment_id uuid, p_where text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; a public.delivery_assignments; o public.orders;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or dp.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = a.order_id;
  if p_where = 'pickup' then
    if a.status <> 'accepted' then raise exception 'INVALID_STATE: %', a.status; end if;
    if a.arrived_pickup_at is null then
      update public.delivery_assignments set arrived_pickup_at = now() where id = a.id;
      perform public.notify_admins('rider_arrived', 'Rider at the pickup point for ' || o.order_number, 'Hand over the bag and scan the label (or let the rider scan it).', jsonb_build_object('order_id', o.id, 'assignment_id', a.id));
    end if;
  elsif p_where = 'customer' then
    if a.status <> 'picked_up' then raise exception 'INVALID_STATE: %', a.status; end if;
    if a.arrived_customer_at is null then update public.delivery_assignments set arrived_customer_at = now() where id = a.id; end if;
  else raise exception 'INVALID_PLACE'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.rider_mark_arrived(uuid, text) from public, anon;
grant execute on function public.rider_mark_arrived(uuid, text) to authenticated;

-- A scan by an admin or by the rider is the handover; who did it is kept on the assignment.
create or replace function public._scan_dispatch(p_order public.orders, p_assignment public.delivery_assignments)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text := public.current_user_role()::text;
begin
  if p_order.ready_at is null then raise exception 'ORDER_NOT_PACKED'; end if;
  if p_order.status not in ('rider_assigned','ready_for_pickup') then raise exception 'ORDER_NOT_READY: %', p_order.status; end if;
  update public.delivery_assignments set status = 'picked_up', picked_up_at = now(),
    handed_over_at = now(), handed_over_by = auth.uid(), handed_over_by_name = public._actor_name(),
    handover_method = case when v_role in ('admin','super_admin') then 'admin_scan' else 'rider_scan' end
  where id = p_assignment.id;
  perform public._set_order_status(p_order.id, 'out_for_delivery', null);
end $$;

-- The rider's "collected" tap (no scan). Can be switched off so only a scanned handover counts.
create or replace function public.rider_pickup(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; dp public.delivery_partners; o public.orders;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or dp.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  if a.status = 'picked_up' then return jsonb_build_object('ok', true, 'status', 'picked_up', 'already', true); end if;
  if a.status <> 'accepted' then raise exception 'INVALID_STATE: %', a.status; end if;
  if public.get_setting_bool('handover_requires_scan', false) then raise exception 'HANDOVER_SCAN_REQUIRED: Scan the bag label to collect this order.'; end if;
  select * into o from public.orders where id = a.order_id for update;
  if o.ready_at is null or o.status not in ('rider_assigned','ready_for_pickup') then raise exception 'ORDER_NOT_READY: %', o.status; end if;
  update public.delivery_assignments set status = 'picked_up', picked_up_at = now(),
    handed_over_at = now(), handed_over_by = auth.uid(), handed_over_by_name = public._actor_name(), handover_method = 'rider_tap'
  where id = a.id;
  perform public._set_order_status(o.id, 'out_for_delivery', null);
  return jsonb_build_object('ok', true, 'status', 'picked_up');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Exceptions flag maintained by the flow
-- ---------------------------------------------------------------------------
create or replace function public._set_exception(p_order_id uuid, p_kind text)
returns void language sql security definer set search_path = public as $$
  update public.orders set exception = p_kind, exception_at = case when p_kind is null then null else coalesce(exception_at, now()) end where id = p_order_id;
$$;
revoke all on function public._set_exception(uuid, text) from public, anon, authenticated;

-- Accepting clears "unattended"; everything else from 0035 unchanged.
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
    if o.exception = 'unattended' then perform public._set_exception(o.id, null); end if;
    perform public.audit('order.accept', 'orders', o.id::text, null, jsonb_build_object('order_number', o.order_number));
  end if;
  select * into o from public.orders where id = o.id;
  return jsonb_build_object('ok', true, 'already', v_already, 'status', o.status, 'accepted_at', o.accepted_at,
    'accepted_by', o.accepted_by, 'accepted_by_name', o.accepted_by_name);
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
      and (o.payment_method = 'cod' or o.payment_status in ('paid', 'authorized'))
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

create or replace function public.auto_dispatch(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; r record; v_id uuid; v_dist numeric; v_pp jsonb := public.pickup_point();
  v_lat double precision := (v_pp ->> 'lat')::double precision; v_lng double precision := (v_pp ->> 'lng')::double precision; v_city uuid := (v_pp ->> 'city_id')::uuid;
  v_window int := greatest(1, public.get_setting_num('dispatch_no_rider_alert_minutes', 5))::int;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.status not in ('ready_for_pickup') then return null; end if;
  update public.delivery_assignments set status = 'expired' where status = 'offered' and expires_at < now();
  if exists (select 1 from public.delivery_assignments where order_id = o.id and status in ('offered','accepted','picked_up')) then return null; end if;

  select dp.*, public.haversine_km(dp.current_lat, dp.current_lng, v_lat, v_lng) as dist into r
  from public.delivery_partners dp
  where dp.status = 'active' and dp.is_online
    and dp.current_lat is not null
    and (dp.city_id is null or v_city is null or dp.city_id = v_city)
    and public.haversine_km(dp.current_lat, dp.current_lng, v_lat, v_lng) <= public.get_setting_num('dispatch_radius_km', 8)
    and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.status in ('offered','accepted','picked_up'))
    and not exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.order_id = o.id and a.status = 'rejected')
  order by dist asc, dp.rating_avg desc
  limit 1;

  if r.id is null then
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

  v_dist := public.haversine_km(v_lat, v_lng, o.delivery_lat, o.delivery_lng);
  insert into public.delivery_assignments (order_id, rider_id, status, expires_at, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount)
  values (o.id, r.id, 'offered', now() + make_interval(secs => public.get_setting_num('dispatch_offer_timeout_seconds', 180)),
          v_lat, v_lng, o.delivery_lat, o.delivery_lng, round(v_dist::numeric, 2), o.rider_earning,
          case when o.payment_method = 'cod' then o.total else 0 end)
  returning id into v_id;
  if o.exception = 'no_rider' then perform public._set_exception(o.id, null); end if;

  perform public.notify_user(r.user_id, 'delivery_offer', 'New delivery request',
    format('Pickup from %s · %s · Earn ₹%s', coalesce(v_pp ->> 'name', 'Merta Deal'), case when v_dist is null then 'distance not known' else round(v_dist::numeric,1) || ' km' end, to_char(o.rider_earning,'FM9999990')),
    jsonb_build_object('assignment_id', v_id, 'order_id', o.id, 'order_number', o.order_number));
  return v_id;
end $$;

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
  if o.exception in ('no_rider', 'delivery_failed') then perform public._set_exception(o.id, null); end if;
  perform public.notify_user(dp.user_id, 'delivery_offer', 'New delivery request (admin)', format('Pickup from %s · Earn ₹%s', coalesce(v_pp ->> 'name', 'Merta Deal'), to_char(o.rider_earning,'FM9999990')),
    jsonb_build_object('assignment_id', v_id, 'order_id', o.id, 'order_number', o.order_number));
  perform public.audit('dispatch.manual_assign', 'orders', o.id::text, null, jsonb_build_object('rider_id', dp.id));
  return v_id;
end $$;

-- Failed delivery (0027 body): one admin notification instead of two, and the exception flag.
create or replace function public.rider_report_failed_delivery(p_assignment_id uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; a public.delivery_assignments; o public.orders; v_label text; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  if a.status not in ('accepted', 'picked_up') then raise exception 'INVALID_STATE: %', a.status; end if;
  v_label := case p_reason
    when 'customer_unreachable' then 'Customer not reachable'
    when 'address_problem' then 'Address wrong or not found'
    when 'customer_refused' then 'Customer refused the order'
    when 'other' then 'Other'
    else null end;
  if v_label is null then raise exception 'INVALID_REASON'; end if;
  if p_reason = 'other' and (v_note is null or length(v_note) < 5) then raise exception 'REASON_REQUIRED'; end if;
  if v_note is not null and length(v_note) > 300 then v_note := left(v_note, 300); end if;

  select * into o from public.orders where id = a.order_id for update;
  update public.delivery_assignments set status = 'cancelled', failure_reason = v_label || coalesce(': ' || v_note, ''), failed_at = now() where id = a.id;
  if o.status in ('rider_assigned', 'out_for_delivery') then
    perform public._set_order_status(o.id, 'ready_for_pickup', 'Delivery attempt failed — ' || v_label || coalesce(': ' || v_note, '') || '. Returned to the pickup point.');
  end if;
  perform public._set_exception(o.id, 'delivery_failed');
  perform public.notify_user(o.user_id, 'delivery_failed', 'We couldn''t deliver order ' || o.order_number,
    format('Our delivery partner couldn''t complete the handover (%s). We''ll contact you to arrange delivery again.', lower(v_label)), jsonb_build_object('order_id', o.id));
  perform public.notify_admins('delivery_failed', 'Delivery failed: ' || o.order_number,
    format('%s%s. The rider is bringing it back: re-dispatch a rider or cancel the order.', v_label, coalesce(' — ' || v_note, '')), jsonb_build_object('order_id', o.id));
  perform public.audit('delivery.failed', 'orders', o.id::text, null, jsonb_build_object('assignment_id', a.id, 'rider_id', dp.id, 'reason', p_reason, 'note', v_note));
  return jsonb_build_object('ok', true, 'order_status', (select status from public.orders where id = o.id));
end $$;

-- ---------------------------------------------------------------------------
-- 7. Cancellation tells the assigned rider (0030 body + rider notice + exception clear)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_is_admin boolean := public.is_admin(); r record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if not (v_is_admin or o.user_id = auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if o.status in ('delivered','completed','cancelled','rejected') then raise exception 'CANNOT_CANCEL: %', o.status; end if;
  -- A customer can cancel until packing starts, or when they decline an unavailable-item exception.
  if not v_is_admin and o.status not in ('placed','confirmed')
     and not exists (select 1 from public.order_exceptions x where x.order_id = o.id and x.status = 'declined' and x.resolved_at > now() - interval '5 minutes') then
    raise exception 'CANNOT_CANCEL: order is already being packed. Please contact support.';
  end if;

  for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
    update public.inventory set stock_qty = stock_qty + v_item.quantity, sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
    insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, v_item.quantity, 'cancel_restock', o.id, auth.uid());
  end loop;
  for r in select a.id, dp.user_id from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id
           where a.order_id = o.id and a.status in ('accepted','picked_up') loop
    perform public.notify_user(r.user_id, 'delivery_cancelled', 'Delivery cancelled: ' || o.order_number,
      case when o.status = 'out_for_delivery' then 'The order was cancelled. Please bring it back to the pickup point.' else 'The order was cancelled before pickup. No need to collect it.' end,
      jsonb_build_object('order_id', o.id, 'assignment_id', r.id));
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
-- 8. Payment callback: a repeat for an already-paid order is a no-op (0030 body + guard)
-- ---------------------------------------------------------------------------
create or replace function public.confirm_online_payment(p_order_id uuid, p_provider_order_id text, p_provider_payment_id text, p_signature text, p_raw jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; v_auto boolean := false;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.payment_status in ('paid', 'refunded', 'partially_refunded') then return; end if;
  update public.payments set status = 'paid', provider_order_id = p_provider_order_id, provider_payment_id = p_provider_payment_id,
    provider_signature = p_signature, raw_response = coalesce(p_raw, raw_response) where order_id = p_order_id;
  update public.orders set payment_status = 'paid' where id = p_order_id;
  if o.status = 'placed' and public.get_setting_bool('auto_accept_orders', true) then v_auto := public._auto_confirm_order(o.id); end if;
  perform public.notify_user(o.user_id, 'payment', case when v_auto then 'Payment received · order confirmed' else 'Payment received' end,
    format('₹%s received for order %s.%s', to_char(o.total,'FM9999990.00'), o.order_number, case when v_auto then ' It is being packed now.' else '' end), jsonb_build_object('order_id', o.id));
  perform public.notify_admins('payment_update', 'Payment confirmed for ' || o.order_number,
    case when v_auto then 'Online payment was successful. Pack the order and tap "Packed".' else 'Online payment was successful.' end, jsonb_build_object('order_id', o.id));
end $$;

-- ---------------------------------------------------------------------------
-- 9. Unavailable items: raise, resolve, expire
-- ---------------------------------------------------------------------------
create or replace function public.admin_raise_item_exception(p_order_item_id uuid, p_available_qty int, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare oi public.order_items; o public.orders; x public.order_exceptions; v_timeout int := greatest(1, public.get_setting_num('item_exception_timeout_minutes', 20))::int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into oi from public.order_items where id = p_order_item_id;
  if oi.id is null then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into o from public.orders where id = oi.order_id for update;
  if o.status not in ('placed', 'confirmed', 'preparing') then raise exception 'INVALID_STATE: %', o.status; end if;
  if p_available_qty < 0 or p_available_qty >= oi.quantity then raise exception 'INVALID_QUANTITY: available must be less than ordered'; end if;
  if exists (select 1 from public.order_exceptions where order_item_id = oi.id and status = 'pending') then raise exception 'EXCEPTION_PENDING'; end if;
  insert into public.order_exceptions (order_id, order_item_id, kind, requested_qty, available_qty, note, created_by, created_by_name, expires_at)
  values (o.id, oi.id, case when p_available_qty = 0 then 'unavailable' else 'short' end, oi.quantity, p_available_qty, nullif(trim(coalesce(p_note, '')), ''), auth.uid(), public._actor_name(), now() + make_interval(mins => v_timeout))
  returning * into x;
  perform public._set_exception(o.id, 'item_exception');
  perform public.notify_user(o.user_id, 'order_exception',
    case when p_available_qty = 0 then format('%s is unavailable', oi.product_name) else format('Only %s of %s %s available', p_available_qty, oi.quantity, oi.product_name) end,
    format('Order %s: approve the change and we pack the rest, or decline and the order is cancelled with a full refund. Please reply within %s minutes.', o.order_number, v_timeout),
    jsonb_build_object('order_id', o.id, 'exception_id', x.id));
  perform public.audit('order.exception_raised', 'orders', o.id::text, null, jsonb_build_object('exception_id', x.id, 'item', oi.product_name, 'available', p_available_qty));
  return to_jsonb(x);
end $$;
revoke all on function public.admin_raise_item_exception(uuid, int, text) from public, anon;
grant execute on function public.admin_raise_item_exception(uuid, int, text) to authenticated;

-- Applies an approved reduction: line, stock, bill, and the refund due on a prepaid order.
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
    update public.inventory set stock_qty = stock_qty + v_release, sold_count = greatest(sold_count - v_release, 0) where id = oi.inventory_id;
    insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id, note)
    values (oi.inventory_id, v_release, 'exception_release', o.id, auth.uid(), format('%s short on order %s', v_release, o.order_number));
  end if;
  update public.orders set
    subtotal = coalesce((select sum(line_total) from public.order_items where order_id = o.id), 0),
    item_count = coalesce((select sum(quantity) from public.order_items where order_id = o.id), 0)
  where id = o.id;
  update public.orders set total = greatest(0, subtotal - coalesce(coupon_discount, 0) + coalesce(delivery_fee, 0) + coalesce(platform_fee, 0) + coalesce(tax_amount, 0)) where id = o.id
  returning total into v_new_total;
  -- Only money already taken is a refund; on a cash order the rider simply collects the lower total.
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
revoke all on function public._apply_item_exception(uuid) from public, anon, authenticated;

create or replace function public.customer_resolve_exception(p_exception_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x public.order_exceptions; o public.orders; v_refund numeric := 0; v_name text;
begin
  select * into x from public.order_exceptions where id = p_exception_id for update;
  if x.id is null then raise exception 'NOT_FOUND'; end if;
  select * into o from public.orders where id = x.order_id for update;
  if o.user_id <> auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if x.status <> 'pending' then return jsonb_build_object('ok', true, 'already', true, 'status', x.status); end if;
  if o.status in ('cancelled', 'rejected', 'delivered', 'completed') then raise exception 'ORDER_CLOSED: %', o.status; end if;
  select product_name into v_name from public.order_items where id = x.order_item_id;
  if p_approve then
    update public.order_exceptions set status = 'approved', resolved_at = now() where id = x.id;
    v_refund := public._apply_item_exception(x.id);
    if not exists (select 1 from public.order_exceptions where order_id = o.id and status = 'pending') then perform public._set_exception(o.id, null); end if;
    perform public.notify_admins('exception_resolved', format('Customer approved: %s', coalesce(v_name, 'item')),
      format('Order %s continues with the reduced quantity.%s', o.order_number, case when v_refund > 0 then format(' Refund due ₹%s.', to_char(v_refund, 'FM9999990.00')) else '' end), jsonb_build_object('order_id', o.id));
    perform public.audit('order.exception_approved', 'orders', o.id::text, null, jsonb_build_object('exception_id', x.id, 'refund', v_refund));
    return jsonb_build_object('ok', true, 'status', 'approved', 'refund_amount', v_refund, 'total', (select total from public.orders where id = o.id));
  else
    update public.order_exceptions set status = 'declined', resolved_at = now() where id = x.id;
    perform public.audit('order.exception_declined', 'orders', o.id::text, null, jsonb_build_object('exception_id', x.id));
    perform public.cancel_order(o.id, format('Cancelled by customer: %s not available', coalesce(v_name, 'an item')));
    return jsonb_build_object('ok', true, 'status', 'declined', 'order_status', 'cancelled');
  end if;
end $$;
revoke all on function public.customer_resolve_exception(uuid, boolean) from public, anon;
grant execute on function public.customer_resolve_exception(uuid, boolean) to authenticated;

-- Pending approvals past their window: marked expired, admins told to decide (call the customer, cancel, or pack what is there).
create or replace function public.expire_item_exceptions()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  for r in select x.id, x.order_id, o.order_number from public.order_exceptions x join public.orders o on o.id = x.order_id
           where x.status = 'pending' and x.expires_at < now() loop
    update public.order_exceptions set status = 'expired', resolved_at = now() where id = r.id;
    perform public.notify_admins('exception_expired', format('No reply on %s', r.order_number), 'The customer did not answer about the unavailable item. Call them, cancel the order, or pack what is available.', jsonb_build_object('order_id', r.order_id));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.expire_item_exceptions() from public, anon;
grant execute on function public.expire_item_exceptions() to authenticated, service_role;

-- Admin decides for an expired or pending exception: pack the available quantity (same effect as approval) or withdraw it.
create or replace function public.admin_resolve_exception(p_exception_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x public.order_exceptions; o public.orders; v_refund numeric := 0;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into x from public.order_exceptions where id = p_exception_id for update;
  if x.id is null then raise exception 'NOT_FOUND'; end if;
  if x.status not in ('pending', 'expired') then return jsonb_build_object('ok', true, 'already', true, 'status', x.status); end if;
  select * into o from public.orders where id = x.order_id for update;
  if p_action = 'apply' then
    update public.order_exceptions set status = 'approved', resolved_at = now() where id = x.id;
    v_refund := public._apply_item_exception(x.id);
    perform public.notify_user(o.user_id, 'order_status', 'Order ' || o.order_number || ' updated', 'An unavailable item was removed or reduced and the bill adjusted. Any difference is refunded.', jsonb_build_object('order_id', o.id));
    perform public.audit('order.exception_applied_by_admin', 'orders', o.id::text, null, jsonb_build_object('exception_id', x.id, 'refund', v_refund));
  elsif p_action = 'withdraw' then
    update public.order_exceptions set status = 'withdrawn', resolved_at = now() where id = x.id;
    perform public.audit('order.exception_withdrawn', 'orders', o.id::text, null, jsonb_build_object('exception_id', x.id));
  else raise exception 'UNKNOWN_ACTION'; end if;
  if not exists (select 1 from public.order_exceptions where order_id = o.id and status = 'pending') then perform public._set_exception(o.id, null); end if;
  return jsonb_build_object('ok', true, 'status', (select status from public.order_exceptions where id = x.id), 'refund_amount', v_refund);
end $$;
revoke all on function public.admin_resolve_exception(uuid, text) from public, anon;
grant execute on function public.admin_resolve_exception(uuid, text) to authenticated;

-- Packing with a pending customer decision is refused: the quantity is not settled yet.
create or replace function public.fulfil_order(p_order_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_assignment uuid;
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
      for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
        update public.inventory set stock_qty = stock_qty + v_item.quantity, sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
        insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, v_item.quantity, 'reject_restock', o.id, auth.uid());
      end loop;
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

-- The alert feed also sweeps expired approvals so an admin is told without waiting for the cron.
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
        'created_at', o.created_at, 'promised_at', o.promised_at
      ) order by o.created_at), '[]'::jsonb)
      from public.orders o
      where o.status in ('placed', 'confirmed', 'preparing')
        and o.accepted_at is null
        and o.created_at > now() - make_interval(mins => v_recover)
        and (o.payment_method = 'cod' or o.payment_status in ('paid', 'authorized'))));
end $$;
