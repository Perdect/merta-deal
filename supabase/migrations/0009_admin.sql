-- ============================================================================
-- MERTA DEAL — Admin panel helpers. Every function is SECURITY DEFINER and
-- refuses non-admin callers via public.is_admin(). Aggregations live here
-- because PostgREST cannot GROUP BY; mutations write their own audit rows
-- when no table trigger already covers them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Wallet: admin credit (goodwill / manual refund). Atomic ledger + balance.
-- ----------------------------------------------------------------------------
create or replace function public.admin_credit_wallet(p_user_id uuid, p_amount numeric, p_description text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_balance numeric; v_txn uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT: Amount must be greater than zero'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'DESCRIPTION_REQUIRED: Add a short reason for the credit'; end if;
  select wallet_balance into v_balance from public.profiles where id = p_user_id for update;
  if v_balance is null then raise exception 'USER_NOT_FOUND'; end if;
  v_balance := v_balance + p_amount;
  update public.profiles set wallet_balance = v_balance where id = p_user_id;
  insert into public.wallet_transactions (user_id, type, amount, balance_after, description)
  values (p_user_id, 'credit', p_amount, v_balance, trim(p_description)) returning id into v_txn;
  perform public.audit('wallet.admin_credit', 'profiles', p_user_id::text, null, jsonb_build_object('amount', p_amount, 'balance_after', v_balance, 'description', trim(p_description), 'transaction_id', v_txn));
  perform public.notify_user(p_user_id, 'wallet_credit', 'Wallet credited', format('₹%s added to your Merta wallet: %s', to_char(p_amount, 'FM9999990.00'), trim(p_description)), jsonb_build_object('transaction_id', v_txn));
  return jsonb_build_object('ok', true, 'balance', v_balance, 'transaction_id', v_txn);
end $$;

-- ----------------------------------------------------------------------------
-- Broadcast notification to an audience (or one user by email)
-- ----------------------------------------------------------------------------
create or replace function public.admin_broadcast_notification(p_audience text, p_title text, p_body text, p_user_email text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; v_uid uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then raise exception 'INVALID_INPUT: Title and message are required'; end if;
  if p_audience = 'user' then
    if coalesce(trim(p_user_email), '') = '' then raise exception 'EMAIL_REQUIRED: Enter the user''s email'; end if;
    select id into v_uid from public.profiles where lower(email) = lower(trim(p_user_email)) limit 1;
    if v_uid is null then select id into v_uid from auth.users where lower(email) = lower(trim(p_user_email)) limit 1; end if;
    if v_uid is null then raise exception 'USER_NOT_FOUND: No account with that email'; end if;
    insert into public.notifications (user_id, type, title, body, data, channels)
    values (v_uid, 'broadcast', trim(p_title), trim(p_body), jsonb_build_object('audience', 'user'), '{in_app,push}');
    n := 1;
  elsif p_audience in ('customers', 'stores', 'riders', 'all') then
    insert into public.notifications (user_id, type, title, body, data, channels)
    select p.id, 'broadcast', trim(p_title), trim(p_body), jsonb_build_object('audience', p_audience), '{in_app,push}'
    from public.profiles p
    where p.is_active
      and (p_audience = 'all'
        or (p_audience = 'customers' and p.role = 'customer' and not coalesce(p.is_guest, false))
        or (p_audience = 'stores' and p.role in ('store_owner', 'store_staff'))
        or (p_audience = 'riders' and p.role = 'rider'));
    get diagnostics n = row_count;
  else
    raise exception 'INVALID_AUDIENCE';
  end if;
  perform public.audit('notification.broadcast', 'notifications', null, null, jsonb_build_object('audience', p_audience, 'title', trim(p_title), 'recipients', n, 'email', p_user_email));
  return n;
end $$;

-- ----------------------------------------------------------------------------
-- Per-user summary for the admin user detail page
-- ----------------------------------------------------------------------------
create or replace function public.admin_user_stats(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'addresses', (select count(*) from public.addresses where user_id = p_user_id),
    'orders', (select count(*) from public.orders where user_id = p_user_id),
    'delivered_orders', (select count(*) from public.orders where user_id = p_user_id and status in ('delivered','completed')),
    'cancelled_orders', (select count(*) from public.orders where user_id = p_user_id and status in ('cancelled','rejected')),
    'spent', (select coalesce(sum(total),0) from public.orders where user_id = p_user_id and status in ('delivered','completed')),
    'last_order_at', (select max(created_at) from public.orders where user_id = p_user_id),
    'reviews', (select count(*) from public.reviews where user_id = p_user_id),
    'tickets', (select count(*) from public.support_tickets where user_id = p_user_id),
    'email_auth', (select email from auth.users where id = p_user_id),
    'last_sign_in_at', (select last_sign_in_at from auth.users where id = p_user_id)
  );
end $$;

-- ----------------------------------------------------------------------------
-- Per-store KPIs for the admin store detail page
-- ----------------------------------------------------------------------------
create or replace function public.admin_store_stats(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'orders', (select count(*) from public.orders where store_id = p_store_id),
    'delivered', (select count(*) from public.orders where store_id = p_store_id and status in ('delivered','completed')),
    'cancelled', (select count(*) from public.orders where store_id = p_store_id and status in ('cancelled','rejected')),
    'active', (select count(*) from public.orders where store_id = p_store_id and status in ('placed','store_confirmed','preparing','ready_for_pickup','rider_assigned','out_for_delivery')),
    'gmv', (select coalesce(sum(total),0) from public.orders where store_id = p_store_id and status not in ('cancelled','rejected')),
    'store_revenue', (select coalesce(sum(store_payout_amount),0) from public.orders where store_id = p_store_id and status in ('delivered','completed')),
    'commission', (select coalesce(sum(commission_amount),0) from public.orders where store_id = p_store_id and status in ('delivered','completed')),
    'products', (select count(*) from public.inventory where store_id = p_store_id and is_active),
    'out_of_stock', (select count(*) from public.inventory where store_id = p_store_id and is_active and status = 'out_of_stock'),
    'pending_documents', (select count(*) from public.store_documents where store_id = p_store_id and status = 'pending'),
    'payouts_pending', (select coalesce(sum(net_amount),0) from public.payouts where store_id = p_store_id and status in ('pending','processing')),
    'weekly', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', c, 'gmv', g) order by d), '[]'::jsonb) from (
        select (created_at at time zone 'Asia/Kolkata')::date d, count(*) c, coalesce(sum(total),0) g from public.orders
        where store_id = p_store_id and created_at > now() - interval '7 days' and status not in ('cancelled','rejected') group by 1) w)
  );
end $$;

-- ----------------------------------------------------------------------------
-- Coupon usage aggregates (one row per coupon that has been used)
-- ----------------------------------------------------------------------------
create or replace function public.admin_coupon_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return (select coalesce(jsonb_object_agg(coupon_id, jsonb_build_object('uses', uses, 'unique_users', users, 'discount_total', disc, 'last_used_at', last_used)), '{}'::jsonb)
    from (select coupon_id, count(*) uses, count(distinct user_id) users, coalesce(sum(discount_amount),0) disc, max(created_at) last_used from public.coupon_usage group by coupon_id) s);
end $$;

-- ----------------------------------------------------------------------------
-- Weekly payouts: one row per store for delivered/completed orders in the
-- period that no existing payout already covers.
-- ----------------------------------------------------------------------------
create or replace function public.admin_generate_payouts(p_period_start date, p_period_end date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_created int := 0; v_total numeric := 0; v_ids uuid[] := '{}';
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then raise exception 'INVALID_RANGE: End date must be after start date'; end if;
  for r in
    select o.store_id, count(*) cnt, coalesce(sum(o.subtotal),0) gross, coalesce(sum(o.commission_amount),0) commission,
           -coalesce(sum(o.coupon_discount),0) adjustments, coalesce(sum(o.store_payout_amount),0) net
    from public.orders o
    where o.status in ('delivered','completed')
      and (coalesce(o.delivered_at, o.completed_at, o.created_at) at time zone 'Asia/Kolkata')::date between p_period_start and p_period_end
      and not exists (
        select 1 from public.payouts p
        where p.store_id = o.store_id and p.status <> 'failed'
          and (coalesce(o.delivered_at, o.completed_at, o.created_at) at time zone 'Asia/Kolkata')::date between p.period_start and p.period_end)
    group by o.store_id
  loop
    insert into public.payouts (store_id, period_start, period_end, gross_sales, commission_amount, adjustments, net_amount, order_count, status, created_by, note)
    values (r.store_id, p_period_start, p_period_end, r.gross, r.commission, r.adjustments, r.net, r.cnt, 'pending', auth.uid(), 'Auto-generated weekly payout')
    returning id into r.store_id;
    v_ids := v_ids || r.store_id; v_created := v_created + 1; v_total := v_total + r.net;
  end loop;
  return jsonb_build_object('created', v_created, 'total_amount', v_total, 'payout_ids', to_jsonb(v_ids));
end $$;

-- ----------------------------------------------------------------------------
-- Date-range business report
-- ----------------------------------------------------------------------------
create or replace function public.admin_report(p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz; v_to timestamptz;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'INVALID_RANGE: End date must be after start date'; end if;
  v_from := (p_start::timestamp at time zone 'Asia/Kolkata');
  v_to := ((p_end + 1)::timestamp at time zone 'Asia/Kolkata');
  return jsonb_build_object(
    'range', jsonb_build_object('start', p_start, 'end', p_end),
    'orders', (select count(*) from public.orders where created_at >= v_from and created_at < v_to),
    'delivered', (select count(*) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'cancelled', (select count(*) from public.orders where created_at >= v_from and created_at < v_to and status in ('cancelled','rejected')),
    'gmv', (select coalesce(sum(total),0) from public.orders where created_at >= v_from and created_at < v_to and status not in ('cancelled','rejected')),
    'commission', (select coalesce(sum(commission_amount),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'delivery_fees', (select coalesce(sum(delivery_fee),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'platform_fees', (select coalesce(sum(platform_fee),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'taxes', (select coalesce(sum(tax_amount),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'rider_earnings', (select coalesce(sum(rider_earning),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'store_payouts', (select coalesce(sum(store_payout_amount),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'coupon_discounts', (select coalesce(sum(coupon_discount),0) from public.orders where created_at >= v_from and created_at < v_to and status not in ('cancelled','rejected')),
    'net_revenue', (select coalesce(sum(commission_amount + platform_fee + delivery_fee - rider_earning),0) from public.orders where created_at >= v_from and created_at < v_to and status in ('delivered','completed')),
    'avg_order_value', (select round(coalesce(avg(total),0), 2) from public.orders where created_at >= v_from and created_at < v_to and status not in ('cancelled','rejected')),
    'avg_delivery_minutes', (select round(avg(extract(epoch from (delivered_at - created_at))/60)) from public.orders where created_at >= v_from and created_at < v_to and delivered_at is not null),
    'new_customers', (select count(*) from public.profiles where role = 'customer' and created_at >= v_from and created_at < v_to),
    'payment_methods', (select coalesce(jsonb_object_agg(payment_method, c), '{}'::jsonb) from (select payment_method, count(*) c from public.orders where created_at >= v_from and created_at < v_to and status not in ('cancelled','rejected') group by 1) pm),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', c, 'gmv', g, 'cancelled', x) order by d), '[]'::jsonb) from (
        select (created_at at time zone 'Asia/Kolkata')::date d, count(*) filter (where status not in ('cancelled','rejected')) c, coalesce(sum(total) filter (where status not in ('cancelled','rejected')),0) g, count(*) filter (where status in ('cancelled','rejected')) x
        from public.orders where created_at >= v_from and created_at < v_to group by 1) w),
    'top_products', (select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'name', name, 'quantity', q, 'revenue', r, 'orders', oc) order by r desc), '[]'::jsonb) from (
        select oi.product_id, max(oi.product_name) name, sum(oi.quantity) q, coalesce(sum(oi.line_total),0) r, count(distinct oi.order_id) oc
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where o.created_at >= v_from and o.created_at < v_to and o.status not in ('cancelled','rejected')
        group by oi.product_id order by r desc limit 15) tp),
    'top_stores', (select coalesce(jsonb_agg(jsonb_build_object('store_id', store_id, 'name', name, 'orders', c, 'gmv', g, 'commission', cm, 'cancelled', x) order by g desc), '[]'::jsonb) from (
        select o.store_id, max(s.name) name, count(*) filter (where o.status not in ('cancelled','rejected')) c, coalesce(sum(o.total) filter (where o.status not in ('cancelled','rejected')),0) g,
               coalesce(sum(o.commission_amount) filter (where o.status in ('delivered','completed')),0) cm, count(*) filter (where o.status in ('cancelled','rejected')) x
        from public.orders o join public.stores s on s.id = o.store_id
        where o.created_at >= v_from and o.created_at < v_to group by o.store_id order by g desc limit 15) ts),
    'riders', (select coalesce(jsonb_agg(jsonb_build_object('rider_id', rider_id, 'name', name, 'deliveries', c, 'earnings', e, 'avg_minutes', m, 'distance_km', dk, 'rating', rt) order by c desc), '[]'::jsonb) from (
        select a.rider_id, max(pr.full_name) name, count(*) c, coalesce(sum(a.earning),0) e,
               round(avg(extract(epoch from (a.delivered_at - coalesce(a.responded_at, a.offered_at)))/60)) m, coalesce(sum(a.distance_km),0) dk, max(dp.rating_avg) rt
        from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id join public.profiles pr on pr.id = dp.user_id
        where a.status = 'delivered' and a.delivered_at >= v_from and a.delivered_at < v_to
        group by a.rider_id order by c desc limit 20) rd)
  );
end $$;

-- ----------------------------------------------------------------------------
-- Rider live board: every online active rider with profile + current job
-- ----------------------------------------------------------------------------
create or replace function public.admin_live_riders()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', dp.id, 'user_id', dp.user_id, 'name', pr.full_name, 'phone', pr.phone, 'avatar_url', pr.avatar_url,
      'vehicle_type', dp.vehicle_type, 'vehicle_number', dp.vehicle_number, 'rating_avg', dp.rating_avg,
      'lat', dp.current_lat, 'lng', dp.current_lng, 'last_location_at', dp.last_location_at,
      'busy', exists (select 1 from public.delivery_assignments a where a.rider_id = dp.id and a.status in ('accepted','picked_up')),
      'current_order', (select jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', a.status, 'store_name', s.name)
                        from public.delivery_assignments a join public.orders o on o.id = a.order_id join public.stores s on s.id = o.store_id
                        where a.rider_id = dp.id and a.status in ('accepted','picked_up') order by a.created_at desc limit 1)
    ) order by dp.last_location_at desc nulls last), '[]'::jsonb)
    from public.delivery_partners dp join public.profiles pr on pr.id = dp.user_id
    where dp.status = 'active' and dp.is_online);
end $$;

grant execute on function public.admin_credit_wallet(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.admin_broadcast_notification(text, text, text, text) to authenticated, service_role;
grant execute on function public.admin_user_stats(uuid) to authenticated, service_role;
grant execute on function public.admin_store_stats(uuid) to authenticated, service_role;
grant execute on function public.admin_coupon_stats() to authenticated, service_role;
grant execute on function public.admin_generate_payouts(date, date) to authenticated, service_role;
grant execute on function public.admin_report(date, date) to authenticated, service_role;
grant execute on function public.admin_live_riders() to authenticated, service_role;
