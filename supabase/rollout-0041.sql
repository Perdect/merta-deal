-- Merta Deal: UPI on delivery (0041). Paste into the Supabase SQL editor and run once. Runs as one transaction.
begin;
-- ============================================================================
-- MERTA DEAL — UPI on delivery, to the business's own UPI ID. No gateway, so nothing confirms the
-- money automatically. The customer scans at the door and the rider records "UPI" instead of cash.
-- That amount stays on the rider's cash balance until an admin sees it in the bank and confirms it
-- with the reference; "not received" turns it back into cash the rider owes. A rider's tap alone
-- can therefore never clear money. Depends on 0034 and 0037. Idempotent.
-- ============================================================================
alter table public.cod_collections
  add column if not exists collected_mode text not null default 'cash' check (collected_mode in ('cash', 'upi')),
  add column if not exists upi_reference text,
  add column if not exists upi_verified_at timestamptz,
  add column if not exists upi_verified_by uuid references public.profiles (id) on delete set null;
create index if not exists cod_collections_upi_pending_idx on public.cod_collections (created_at) where collected_mode = 'upi' and upi_verified_at is null;

insert into public.settings (key, value, "group", label, description, is_public) values
('upi_on_delivery_enabled', 'true', 'payments', 'UPI on delivery', 'Shows your UPI QR to customers and riders, and lets riders record UPI instead of cash.', true),
('upi_id', '"8875020202@hdfc"', 'payments', 'UPI ID', 'Payments go straight to this UPI ID. Check it carefully.', true),
('upi_payee_name', '"DESHWALI MINERALS"', 'payments', 'UPI payee name', 'The name registered on this UPI ID, as customers see it in their UPI app.', true)
on conflict (key) do nothing;

drop function if exists public.verify_delivery_otp(uuid, text, boolean);
create or replace function public.verify_delivery_otp(p_assignment_id uuid, p_otp text, p_cash_collected boolean default false, p_upi_collected boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; dp public.delivery_partners; o public.orders; sec public.order_secrets; v_max int; v_points int; v_upi boolean := coalesce(p_upi_collected, false);
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  -- Lock the assignment first: concurrent or repeated submissions run one after another.
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  if a.status = 'delivered' then return jsonb_build_object('ok', true, 'status', 'delivered', 'already', true, 'reward_points', 0); end if;
  if a.status <> 'picked_up' then raise exception 'INVALID_STATE: %', a.status; end if;
  select * into o from public.orders where id = a.order_id for update;
  select * into sec from public.order_secrets where order_id = o.id for update;
  v_max := public.get_setting_num('otp_max_attempts', 5)::int;
  if sec.otp_attempts >= v_max then
    return jsonb_build_object('ok', false, 'locked', true, 'reason', 'Too many wrong OTPs. Call Merta Deal support to complete this delivery.');
  end if;
  if v_upi and o.payment_method <> 'cod' then v_upi := false; end if;
  if v_upi and (coalesce(p_cash_collected, false) or not public.get_setting_bool('upi_on_delivery_enabled', false)) then
    return jsonb_build_object('ok', false, 'needs_cash', true, 'reason', 'Choose either cash or UPI.');
  end if;
  -- Payment first, so a missing confirmation never uses up an OTP attempt.
  if o.payment_method = 'cod' and not coalesce(p_cash_collected, false) and not v_upi then
    return jsonb_build_object('ok', false, 'needs_cash', true, 'reason', format('Collect ₹%s and confirm it before entering the OTP.', to_char(o.total, 'FM9999990.00')));
  end if;
  if sec.delivery_otp <> regexp_replace(coalesce(p_otp, ''), '\D', '', 'g') then
    update public.order_secrets set otp_attempts = otp_attempts + 1 where order_id = o.id;
    return jsonb_build_object('ok', false, 'reason', 'Incorrect OTP', 'attempts_left', greatest(v_max - sec.otp_attempts - 1, 0), 'locked', sec.otp_attempts + 1 >= v_max);
  end if;
  v_points := public._complete_delivery(a.id, 'otp');
  if v_upi then
    update public.cod_collections set collected_mode = 'upi' where order_id = o.id;
    perform public.notify_admins('upi_to_confirm', 'Check UPI for ' || o.order_number, format('Rider recorded ₹%s by UPI. Confirm it in your bank.', to_char(o.total, 'FM9999990.00')), jsonb_build_object('order_id', o.id, 'url', '/admin/payments'));
  end if;
  return jsonb_build_object('ok', true, 'status', 'delivered', 'reward_points', v_points);
end $$;
revoke execute on function public.verify_delivery_otp(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.verify_delivery_otp(uuid, text, boolean, boolean) to authenticated;

-- A confirmed UPI payment reached the bank, so it isn't cash in the rider's hand. Unconfirmed UPI still counts.
create or replace function public._rider_cash(p_rider_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with c as (
    select coalesce(sum(a.cod_amount), 0) as collected
    from public.delivery_assignments a join public.orders o on o.id = a.order_id
    left join public.cod_collections k on k.order_id = o.id
    where a.rider_id = p_rider_id and a.status = 'delivered' and o.payment_method = 'cod' and o.payment_status = 'cod_collected'
      and not (coalesce(k.collected_mode, 'cash') = 'upi' and k.upi_verified_at is not null)
  ), r as (select coalesce(sum(amount), 0) as remitted from public.rider_cash_remittances where rider_id = p_rider_id)
  select jsonb_build_object('collected', c.collected, 'remitted', r.remitted, 'due', greatest(c.collected - r.remitted, 0)) from c, r;
$$;
revoke all on function public._rider_cash(uuid) from public, anon, authenticated;

create or replace function public.admin_pending_upi()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'amount', k.amount, 'rider', p.full_name, 'recorded_at', k.created_at) order by k.created_at)
    from public.cod_collections k join public.orders o on o.id = k.order_id left join public.profiles p on p.id = k.collected_by
    where k.collected_mode = 'upi' and k.upi_verified_at is null), '[]'::jsonb);
end $$;
revoke execute on function public.admin_pending_upi() from public, anon;
grant execute on function public.admin_pending_upi() to authenticated;

/** Received: needs the bank reference and clears it from the rider. Not received: it becomes cash the rider owes. */
create or replace function public.admin_confirm_upi(p_order_id uuid, p_received boolean, p_reference text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k public.cod_collections; v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into k from public.cod_collections where order_id = p_order_id for update;
  if k.id is null or k.collected_mode <> 'upi' then raise exception 'UPI: This order has no UPI payment to confirm.'; end if;
  if k.upi_verified_at is not null then raise exception 'UPI: This payment is already confirmed.'; end if;
  if p_received then
    if v_ref is null or char_length(v_ref) < 4 then raise exception 'UPI: Enter the UPI reference from your bank.'; end if;
    if exists (select 1 from public.cod_collections x where x.upi_reference = v_ref and x.id <> k.id) then raise exception 'UPI: That reference is already used on another order.'; end if;
    update public.cod_collections set upi_reference = v_ref, upi_verified_at = now(), upi_verified_by = auth.uid() where id = k.id;
  else
    update public.cod_collections set collected_mode = 'cash' where id = k.id;
  end if;
  perform public.audit('upi.confirm', 'cod_collections', p_order_id::text, null, jsonb_build_object('received', p_received, 'reference', v_ref, 'amount', k.amount));
end $$;
revoke execute on function public.admin_confirm_upi(uuid, boolean, text) from public, anon;
grant execute on function public.admin_confirm_upi(uuid, boolean, text) to authenticated;

commit;
select (select count(*) from pg_proc where proname = 'admin_confirm_upi') as has_0041, (select value #>> '{}' from public.settings where key = 'upi_id') as upi_id;
