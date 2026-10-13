-- ============================================================================
-- MERTA DEAL — Failed delivery attempts and rider cash hand-over.
--
-- Failed delivery
-- * A rider who cannot hand over an order (customer unreachable, address problem, refused…) reports it:
--   their assignment is closed with the reason (so they can take new requests), the order goes back to
--   "ready for pickup" (goods return to the store) and the customer, store and admins are told. Admin
--   then re-dispatches/assigns a rider or cancels with the existing tools. No earning for a failed attempt.
--
-- Cash hand-over (COD remittance)
-- * Cash a rider collects on COD deliveries is owed to Merta Deal until an admin records receiving it.
--   rider_cash_remittances is that ledger; cash due = COD collected on delivered orders − remitted.
-- * admin_rider_balances adds cash_collected / cash_remitted / cash_due; rider_dashboard_stats adds
--   cash_due (shown as "Cash to hand over") alongside today's cod_in_hand.
-- ============================================================================

alter table public.delivery_assignments add column if not exists failure_reason text;
alter table public.delivery_assignments add column if not exists failed_at timestamptz;

create table if not exists public.rider_cash_remittances (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.delivery_partners(id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  reference text,
  note text,
  received_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists rider_cash_remittances_rider_idx on public.rider_cash_remittances(rider_id, created_at desc);
alter table public.rider_cash_remittances enable row level security;
drop policy if exists rider_cash_remittances_read on public.rider_cash_remittances;
create policy rider_cash_remittances_read on public.rider_cash_remittances for select
  using (public.is_admin() or rider_id in (select id from public.delivery_partners where user_id = auth.uid()));
-- No write policies: writes go through admin_record_cash_remittance.

-- Cash a rider holds: COD collected on their delivered orders minus what admins recorded as received.
create or replace function public._rider_cash(p_rider_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with c as (
    select coalesce(sum(a.cod_amount), 0) as collected
    from public.delivery_assignments a join public.orders o on o.id = a.order_id
    where a.rider_id = p_rider_id and a.status = 'delivered' and o.payment_method = 'cod' and o.payment_status = 'cod_collected'
  ), r as (select coalesce(sum(amount), 0) as remitted from public.rider_cash_remittances where rider_id = p_rider_id)
  select jsonb_build_object('collected', c.collected, 'remitted', r.remitted, 'due', greatest(c.collected - r.remitted, 0)) from c, r;
$$;
revoke all on function public._rider_cash(uuid) from public, anon, authenticated;

create or replace function public.rider_report_failed_delivery(p_assignment_id uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; a public.delivery_assignments; o public.orders; v_label text; v_note text := nullif(trim(coalesce(p_note, '')), ''); adm record;
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
    perform public._set_order_status(o.id, 'ready_for_pickup', 'Delivery attempt failed — ' || v_label || coalesce(': ' || v_note, '') || '. Returned to the store.');
  end if;

  perform public.notify_user(o.user_id, 'delivery_failed', 'We couldn''t deliver order ' || o.order_number,
    format('Our delivery partner couldn''t complete the handover (%s). We''ll contact you to arrange delivery again.', lower(v_label)), jsonb_build_object('order_id', o.id));
  perform public.notify_store(o.store_id, 'delivery_failed', 'Delivery failed: ' || o.order_number,
    format('%s. The rider is bringing the order back; admin will re-dispatch or cancel it.', v_label), jsonb_build_object('order_id', o.id));
  for adm in select id from public.profiles where role in ('admin', 'super_admin') and is_active loop
    perform public.notify_user(adm.id, 'delivery_failed', 'Delivery failed: ' || o.order_number,
      format('%s%s. Re-dispatch a rider or cancel the order.', v_label, coalesce(' — ' || v_note, '')), jsonb_build_object('order_id', o.id));
  end loop;
  perform public.audit('delivery.failed', 'orders', o.id::text, null, jsonb_build_object('assignment_id', a.id, 'rider_id', dp.id, 'reason', p_reason, 'note', v_note));
  return jsonb_build_object('ok', true, 'order_status', (select status from public.orders where id = o.id));
end $$;
revoke all on function public.rider_report_failed_delivery(uuid, text, text) from public, anon;
grant execute on function public.rider_report_failed_delivery(uuid, text, text) to authenticated;

create or replace function public.admin_record_cash_remittance(p_rider_id uuid, p_amount numeric, p_reference text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cash jsonb; v_due numeric; v_id uuid; v_user uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select user_id into v_user from public.delivery_partners where id = p_rider_id for update;
  if v_user is null then raise exception 'NOT_FOUND'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  v_cash := public._rider_cash(p_rider_id); v_due := (v_cash ->> 'due')::numeric;
  if p_amount > v_due then raise exception 'AMOUNT_ABOVE_DUE: %', v_due; end if;
  insert into public.rider_cash_remittances (rider_id, amount, reference, note, received_by)
  values (p_rider_id, round(p_amount, 2), nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  perform public.audit('rider.cash_received', 'delivery_partners', p_rider_id::text, v_cash, jsonb_build_object('remittance_id', v_id, 'amount', p_amount, 'reference', p_reference));
  perform public.notify_user(v_user, 'cash_received', 'Cash hand-over recorded', format('Merta Deal recorded ₹%s received from you. Cash still to hand over: ₹%s.', to_char(p_amount, 'FM999999990.00'), to_char(v_due - p_amount, 'FM999999990.00')), jsonb_build_object('remittance_id', v_id));
  return jsonb_build_object('ok', true, 'remittance_id', v_id, 'due', v_due - p_amount);
end $$;
revoke all on function public.admin_record_cash_remittance(uuid, numeric, text, text) from public, anon;
grant execute on function public.admin_record_cash_remittance(uuid, numeric, text, text) to authenticated;

create or replace function public.admin_rider_balances()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(r order by (r->>'payable')::numeric desc, r->>'name') from (
    select jsonb_build_object('rider_id', dp.id, 'name', coalesce(pr.full_name, 'Rider'), 'phone', pr.phone,
      'payable', coalesce(sum(e.amount) filter (where e.status in ('pending','failed')), 0),
      'processing', coalesce(sum(e.amount) filter (where e.status = 'processing'), 0),
      'paid', coalesce(sum(e.amount) filter (where e.status = 'paid'), 0),
      'failed', coalesce(sum(e.amount) filter (where e.status = 'failed'), 0))
      || jsonb_build_object('cash_collected', (public._rider_cash(dp.id) ->> 'collected')::numeric,
                            'cash_remitted', (public._rider_cash(dp.id) ->> 'remitted')::numeric,
                            'cash_due', (public._rider_cash(dp.id) ->> 'due')::numeric) as r
    from public.delivery_partners dp left join public.profiles pr on pr.id = dp.user_id
    left join public.rider_earnings e on e.rider_id = dp.id
    group by dp.id, pr.full_name, pr.phone) t), '[]'::jsonb);
end $$;

create or replace function public.rider_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare dp public.delivery_partners; v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  return jsonb_build_object(
    'rider', to_jsonb(dp),
    'today_deliveries', (select count(*) from public.delivery_assignments where rider_id = dp.id and status = 'delivered' and (delivered_at at time zone 'Asia/Kolkata')::date = v_today),
    'today_earnings', (select coalesce(sum(earning),0) from public.delivery_assignments where rider_id = dp.id and status = 'delivered' and (delivered_at at time zone 'Asia/Kolkata')::date = v_today),
    'week_earnings', (select coalesce(sum(earning),0) from public.delivery_assignments where rider_id = dp.id and status = 'delivered' and delivered_at > now() - interval '7 days'),
    'cod_in_hand', (select coalesce(sum(cod_amount),0) from public.delivery_assignments where rider_id = dp.id and status = 'delivered' and (delivered_at at time zone 'Asia/Kolkata')::date = v_today),
    'cash_due', (public._rider_cash(dp.id) ->> 'due')::numeric,
    'new_requests', (select count(*) from public.delivery_assignments where rider_id = dp.id and status = 'offered' and expires_at > now()),
    'active', (select count(*) from public.delivery_assignments where rider_id = dp.id and status in ('accepted','picked_up'))
  );
end $$;
