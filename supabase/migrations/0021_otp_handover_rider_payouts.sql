-- ============================================================================
-- MERTA DEAL — OTP-confirmed handover and rider payment.
-- * Delivery OTPs come from a cryptographic RNG and are never put in a message: the order-placed
--   notification no longer carries it (old ones are scrubbed). The customer sees it in the app only
--   while the order is out for delivery; admins and stores never receive it.
-- * verify_delivery_otp: the assigned rider only, failed attempts capped, Cash on Delivery needs the
--   rider's confirmation that the full amount was collected (checked before any attempt is used),
--   and a retry after success returns "already delivered" instead of an error.
-- * Support override for customers who cannot reach their OTP: admin_confirm_delivery, admins only,
--   never the rider on that order, reason required, written to audit_logs.
-- * Rider earnings ledger: one row per delivery (unique), status pending → processing → paid, or
--   failed (then eligible again). Payouts are manual (no payout integration is configured): an admin
--   creates a payout from everything payable, then marks it paid with a reference or failed; repeated
--   or concurrent calls never pay an earning twice.
-- ============================================================================

-- 4-digit OTP from pgcrypto's CSPRNG (random() is not suitable for secrets).
create or replace function public.secure_otp4()
returns text language sql volatile set search_path = public, extensions as $$
  select lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 10000)::text, 4, '0')
$$;
revoke all on function public.secure_otp4() from public, anon, authenticated;

-- Old order-placed notifications carried the OTP in the text; remove it.
update public.notifications
set body = regexp_replace(body, ' Delivery OTP: \d{4}', ' Your delivery OTP appears in the app when the order is out for delivery.')
where type = 'order_placed' and body ~ 'Delivery OTP: \d{4}';

-- ---------------------------------------------------------------------------- earnings ledger
create table if not exists public.rider_payouts (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.delivery_partners(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  earning_count int not null,
  status public.payout_status not null default 'processing',
  method text not null default 'manual',
  reference_no text,
  failure_reason text,
  note text,
  created_by uuid references public.profiles(id),
  settled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists rider_payouts_rider_idx on public.rider_payouts(rider_id, created_at desc);

create table if not exists public.rider_earnings (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.delivery_partners(id) on delete restrict,
  assignment_id uuid not null unique references public.delivery_assignments(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  amount numeric(10,2) not null check (amount >= 0),
  status public.payout_status not null default 'pending',
  payout_id uuid references public.rider_payouts(id),
  confirmed_via text not null check (confirmed_via in ('otp','support')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rider_earnings_rider_idx on public.rider_earnings(rider_id, status, created_at desc);

alter table public.rider_earnings enable row level security;
alter table public.rider_payouts enable row level security;
drop policy if exists rider_earnings_read on public.rider_earnings;
create policy rider_earnings_read on public.rider_earnings for select
  using (public.is_admin() or rider_id in (select id from public.delivery_partners where user_id = auth.uid()));
drop policy if exists rider_payouts_read on public.rider_payouts;
create policy rider_payouts_read on public.rider_payouts for select
  using (public.is_admin() or rider_id in (select id from public.delivery_partners where user_id = auth.uid()));
-- No insert/update/delete policies: all writes go through the functions below.

-- The ledger starts with this release; earlier deliveries stay in delivery_partners.total_earnings only
-- (back-filling them as payable could prompt paying for test deliveries again).

-- ---------------------------------------------------------------------------- handover
-- Shared by the OTP path and the audited support path. Callers hold row locks on the assignment
-- and order. The earnings row is unique per assignment, so totals move exactly once.
create or replace function public._complete_delivery(p_assignment_id uuid, p_via text)
returns int language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; o public.orders; v_points int := 0; v_new uuid;
begin
  select * into a from public.delivery_assignments where id = p_assignment_id;
  select * into o from public.orders where id = a.order_id;
  update public.delivery_assignments set status = 'delivered', delivered_at = now() where id = a.id;
  perform public._set_order_status(o.id, 'delivered', case when p_via = 'support' then 'Confirmed by support without OTP' end);

  if o.payment_method = 'cod' then
    update public.payments set status = 'cod_collected', collected_by = (select user_id from public.delivery_partners where id = a.rider_id), collected_at = now() where order_id = o.id;
    update public.orders set payment_status = 'cod_collected' where id = o.id;
  end if;

  insert into public.rider_earnings (rider_id, assignment_id, order_id, amount, confirmed_via)
  values (a.rider_id, a.id, o.id, a.earning, p_via)
  on conflict (assignment_id) do nothing
  returning id into v_new;
  if v_new is not null then
    update public.delivery_partners set total_deliveries = total_deliveries + 1, total_earnings = total_earnings + a.earning where id = a.rider_id;
    v_points := floor(o.subtotal / 100) * public.get_setting_num('reward_points_per_100', 1)::int;
    if v_points > 0 then
      update public.profiles set reward_points = reward_points + v_points where id = o.user_id;
      insert into public.reward_transactions (user_id, points, reason, order_id) values (o.user_id, v_points, 'Order ' || o.order_number, o.id);
    end if;
    perform public.notify_store(o.store_id, 'order_delivered', 'Order ' || o.order_number || ' delivered', 'Delivered successfully by the rider.', jsonb_build_object('order_id', o.id));
  end if;
  return v_points;
end $$;
revoke all on function public._complete_delivery(uuid, text) from public, anon, authenticated;

drop function if exists public.verify_delivery_otp(uuid, text);
create or replace function public.verify_delivery_otp(p_assignment_id uuid, p_otp text, p_cash_collected boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; dp public.delivery_partners; o public.orders; sec public.order_secrets; v_max int; v_points int;
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
  -- Cash first, so a missing confirmation never uses up an OTP attempt.
  if o.payment_method = 'cod' and not coalesce(p_cash_collected, false) then
    return jsonb_build_object('ok', false, 'needs_cash', true, 'reason', format('Collect ₹%s in cash and confirm it before entering the OTP.', to_char(o.total, 'FM9999990.00')));
  end if;
  if sec.delivery_otp <> regexp_replace(coalesce(p_otp, ''), '\D', '', 'g') then
    update public.order_secrets set otp_attempts = otp_attempts + 1 where order_id = o.id;
    return jsonb_build_object('ok', false, 'reason', 'Incorrect OTP', 'attempts_left', greatest(v_max - sec.otp_attempts - 1, 0), 'locked', sec.otp_attempts + 1 >= v_max);
  end if;
  v_points := public._complete_delivery(a.id, 'otp');
  return jsonb_build_object('ok', true, 'status', 'delivered', 'reward_points', v_points);
end $$;
revoke all on function public.verify_delivery_otp(uuid, text, boolean) from public, anon;
grant execute on function public.verify_delivery_otp(uuid, text, boolean) to authenticated;

-- Support path for a customer who cannot reach their OTP (phone off, lost access): an admin who
-- has confirmed the handover with the customer completes it. Never the rider on that order.
create or replace function public.admin_confirm_delivery(p_order_id uuid, p_reason text, p_cash_collected boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; a public.delivery_assignments; v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if length(v_reason) < 10 then raise exception 'REASON_REQUIRED: Describe how the handover was confirmed with the customer (at least 10 characters).'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into a from public.delivery_assignments where order_id = o.id and status in ('picked_up','delivered') order by created_at desc limit 1 for update;
  if a.id is null then raise exception 'NO_ACTIVE_DELIVERY: The rider has not picked up this order.'; end if;
  if a.status = 'delivered' then return jsonb_build_object('ok', true, 'already', true); end if;
  if exists (select 1 from public.delivery_partners where id = a.rider_id and user_id = auth.uid()) then
    raise exception 'FORBIDDEN: The rider on this order cannot confirm their own delivery.';
  end if;
  if o.payment_method = 'cod' and not coalesce(p_cash_collected, false) then
    raise exception 'CASH_NOT_CONFIRMED: Confirm with the rider that the full cash amount was collected.';
  end if;
  perform public._complete_delivery(a.id, 'support');
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, before_data, after_data)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'delivery.confirm_without_otp', 'order', o.id::text,
          jsonb_build_object('status', o.status, 'assignment_id', a.id, 'rider_id', a.rider_id),
          jsonb_build_object('status', 'delivered', 'reason', v_reason, 'cash_collected', coalesce(p_cash_collected, false)));
  return jsonb_build_object('ok', true, 'status', 'delivered');
end $$;

-- ---------------------------------------------------------------------------- payouts
-- Everything payable for one rider becomes one payout ("processing" while the money is sent).
create or replace function public.admin_create_rider_payout(p_rider_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_amount numeric; v_count int; v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.delivery_partners where id = p_rider_id for update; -- one payout run per rider at a time
  if not found then raise exception 'NOT_FOUND'; end if;
  select coalesce(sum(amount), 0), count(*) into v_amount, v_count
  from public.rider_earnings where rider_id = p_rider_id and status in ('pending','failed') and payout_id is null and amount > 0;
  if v_count = 0 then raise exception 'NOTHING_TO_PAY: This rider has no payable earnings.'; end if;
  insert into public.rider_payouts (rider_id, amount, earning_count, note, created_by)
  values (p_rider_id, v_amount, v_count, nullif(trim(coalesce(p_note, '')), ''), auth.uid()) returning id into v_id;
  update public.rider_earnings set status = 'processing', payout_id = v_id, updated_at = now()
  where rider_id = p_rider_id and status in ('pending','failed') and payout_id is null and amount > 0;
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, after_data)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'rider_payout.create', 'rider_payout', v_id::text, jsonb_build_object('rider_id', p_rider_id, 'amount', v_amount, 'earnings', v_count));
  return jsonb_build_object('ok', true, 'payout_id', v_id, 'amount', v_amount, 'earnings', v_count);
end $$;

-- Paid (with the bank/UPI reference) or failed (earnings become payable again). Settling the same
-- way twice is a no-op; a paid payout can never be changed.
create or replace function public.admin_settle_rider_payout(p_payout_id uuid, p_outcome text, p_reference text default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.rider_payouts;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_outcome not in ('paid','failed') then raise exception 'INVALID_OUTCOME'; end if;
  select * into p from public.rider_payouts where id = p_payout_id for update;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  if p.status::text = p_outcome then return jsonb_build_object('ok', true, 'already', true, 'status', p.status); end if;
  if p.status <> 'processing' then raise exception 'INVALID_STATE: This payout is already %.', p.status; end if;
  if p_outcome = 'paid' then
    if length(trim(coalesce(p_reference, ''))) < 4 then raise exception 'REFERENCE_REQUIRED: Enter the UPI/bank transaction reference.'; end if;
    update public.rider_payouts set status = 'paid', reference_no = trim(p_reference), settled_by = auth.uid(), settled_at = now() where id = p.id;
    update public.rider_earnings set status = 'paid', updated_at = now() where payout_id = p.id;
  else
    update public.rider_payouts set status = 'failed', failure_reason = nullif(trim(coalesce(p_reason, '')), ''), settled_by = auth.uid(), settled_at = now() where id = p.id;
    update public.rider_earnings set status = 'failed', payout_id = null, updated_at = now() where payout_id = p.id;
  end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, before_data, after_data)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'rider_payout.' || p_outcome, 'rider_payout', p.id::text,
          jsonb_build_object('status', p.status), jsonb_build_object('status', p_outcome, 'reference', p_reference, 'reason', p_reason));
  return jsonb_build_object('ok', true, 'status', p_outcome);
end $$;

-- Balances per rider for the admin payouts screen.
create or replace function public.admin_rider_balances()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(r order by (r->>'payable')::numeric desc, r->>'name') from (
    select jsonb_build_object('rider_id', dp.id, 'name', coalesce(pr.full_name, 'Rider'), 'phone', pr.phone,
      'payable', coalesce(sum(e.amount) filter (where e.status in ('pending','failed')), 0),
      'processing', coalesce(sum(e.amount) filter (where e.status = 'processing'), 0),
      'paid', coalesce(sum(e.amount) filter (where e.status = 'paid'), 0),
      'failed', coalesce(sum(e.amount) filter (where e.status = 'failed'), 0)) as r
    from public.delivery_partners dp left join public.profiles pr on pr.id = dp.user_id
    left join public.rider_earnings e on e.rider_id = dp.id
    group by dp.id, pr.full_name, pr.phone) t), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------- existing functions
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
  v_wallet numeric;
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
  v_eta := (v_sum ->> 'eta_max_minutes')::int + v_store.avg_prep_minutes;

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
  perform public.notify_user(v_uid, 'order_placed', 'Order placed', format('Order %s placed with %s. Total ₹%s. Your delivery OTP appears in the app when the order is out for delivery.', v_order_no, v_store.name, to_char(v_total,'FM9999990.00')),
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'status', 'placed'));
  perform public.notify_store(v_store.id, 'new_order', 'New order ' || v_order_no,
    format('%s items · ₹%s · %s. Please accept within %s minutes.', (v_sum ->> 'item_count'), to_char(v_total,'FM9999990.00'), upper(p_payment_method::text), public.get_setting_num('store_accept_window_minutes', 5)),
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no));
  perform public.audit('order.place', 'orders', v_order_id::text, null, jsonb_build_object('order_number', v_order_no, 'total', v_total));

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'total', v_total,
    'payment_required', v_provider = 'razorpay', 'payment_method', p_payment_method);
end $$;

create or replace function public.order_tracking(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; v_uid uuid := auth.uid(); v_is_customer boolean; v_is_store boolean; v_is_rider boolean; v_admin boolean; a record; r jsonb;
begin
  select * into o from public.orders where id = p_order_id;
  if o.id is null then return null; end if;
  v_admin := public.is_admin();
  v_is_customer := o.user_id = v_uid;
  v_is_store := public.is_store_member(o.store_id);
  select a1.*, dp.user_id as rider_user_id, dp.vehicle_type, dp.vehicle_number, dp.rating_avg as rider_rating, dp.current_lat, dp.current_lng, dp.last_location_at,
         pr.full_name as rider_name, pr.phone as rider_phone, pr.avatar_url as rider_avatar
  into a
  from public.delivery_assignments a1
  join public.delivery_partners dp on dp.id = a1.rider_id
  join public.profiles pr on pr.id = dp.user_id
  where a1.order_id = o.id and a1.status in ('offered','accepted','picked_up','delivered')
  order by a1.created_at desc limit 1;
  v_is_rider := a.rider_user_id = v_uid;
  if not (v_admin or v_is_customer or v_is_store or v_is_rider) then raise exception 'FORBIDDEN'; end if;

  r := jsonb_build_object(
    'order', to_jsonb(o),
    'items', (select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'created_at', h.created_at, 'actor_role', h.actor_role) order by h.created_at), '[]'::jsonb) from public.order_status_history h where h.order_id = o.id),
    'store', (select jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'phone', s.phone, 'address_line1', s.address_line1, 'area', s.area, 'lat', s.lat, 'lng', s.lng, 'logo_url', s.logo_url) from public.stores s where s.id = o.store_id),
    'payment', (select jsonb_build_object('provider', p.provider, 'method', p.method, 'status', p.status, 'amount', p.amount, 'provider_order_id', p.provider_order_id, 'refund_required', p.refund_required) from public.payments p where p.order_id = o.id order by p.created_at desc limit 1),
    'assignment', case when a.id is null then null else jsonb_build_object(
        'id', a.id, 'status', a.status, 'accepted_at', a.responded_at, 'picked_up_at', a.picked_up_at, 'delivered_at', a.delivered_at, 'distance_km', a.distance_km,
        'earning', case when v_is_rider or v_admin then a.earning end, 'cod_amount', a.cod_amount, 'expires_at', a.expires_at,
        'rider', jsonb_build_object('name', a.rider_name, 'phone', case when v_is_customer or v_is_store or v_admin or v_is_rider then a.rider_phone end, 'avatar_url', a.rider_avatar,
                                    'vehicle_type', a.vehicle_type, 'vehicle_number', a.vehicle_number, 'rating_avg', a.rider_rating),
        'last_location', case when a.status in ('accepted','picked_up') then (
          select jsonb_build_object('lat', l.lat, 'lng', l.lng, 'heading', l.heading, 'speed_mps', l.speed_mps, 'accuracy_m', l.accuracy_m, 'recorded_at', l.recorded_at)
          from public.delivery_locations l where l.assignment_id = a.id order by l.recorded_at desc limit 1) end
      ) end,
    'customer', case when v_is_store or v_is_rider or v_admin then jsonb_build_object('name', o.address_snapshot ->> 'full_name', 'phone', o.address_snapshot ->> 'phone') else null end,
    'delivery_otp', case when v_is_customer and o.status = 'out_for_delivery' then (select delivery_otp from public.order_secrets where order_id = o.id) end,
    'otp_locked', case when v_is_customer or v_admin then (select otp_attempts >= public.get_setting_num('otp_max_attempts', 5)::int from public.order_secrets where order_id = o.id) end,
    'can_review', v_is_customer and o.status in ('delivered','completed'),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('target', rv.target, 'product_id', rv.product_id, 'rating', rv.rating, 'status', rv.status)), '[]'::jsonb) from public.reviews rv where rv.order_id = o.id and rv.user_id = v_uid),
    'viewer', case when v_admin then 'admin' when v_is_customer then 'customer' when v_is_store then 'store' else 'rider' end
  );
  return r;
end $$;

create or replace function public.track_order_by_code(p_code text, p_phone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; v_phone text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
begin
  if length(v_phone) < 10 then return null; end if;
  v_phone := right(v_phone, 10);
  select * into o from public.orders
  where (upper(order_number) = upper(trim(p_code)) or upper(short_code) = upper(trim(p_code)))
    and right(regexp_replace(coalesce(address_snapshot ->> 'phone',''), '\D', '', 'g'), 10) = v_phone
  limit 1;
  if o.id is null then return null; end if;
  return jsonb_build_object(
    'order', jsonb_build_object('id', o.id, 'order_number', o.order_number, 'short_code', o.short_code, 'status', o.status, 'total', o.total, 'item_count', o.item_count,
      'payment_method', o.payment_method, 'payment_status', o.payment_status, 'promised_at', o.promised_at, 'created_at', o.created_at, 'delivered_at', o.delivered_at),
    'store', (select jsonb_build_object('name', s.name, 'area', s.area, 'phone', s.phone) from public.stores s where s.id = o.store_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'pack_label', oi.pack_label, 'line_total', oi.line_total)), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'created_at', h.created_at, 'actor_role', h.actor_role) order by h.created_at), '[]'::jsonb) from public.order_status_history h where h.order_id = o.id),
    'delivery_otp', case when o.status = 'out_for_delivery' then (select delivery_otp from public.order_secrets where order_id = o.id) end,
    'rider', (select jsonb_build_object('name', pr.full_name, 'vehicle_number', dp.vehicle_number) from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id join public.profiles pr on pr.id = dp.user_id where a.order_id = o.id and a.status in ('accepted','picked_up','delivered') order by a.created_at desc limit 1)
  );
end $$;
