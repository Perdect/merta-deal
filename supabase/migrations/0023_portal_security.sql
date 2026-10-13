-- ============================================================================
-- MERTA DEAL — Separate portals: role hardening, rider sign-up by approval, rider privacy.
--
-- Roles
-- * Public sign-up always creates a customer. The 'role' value in sign-up metadata is ignored
--   (it used to allow store_owner / rider), so nobody can self-grant a staff role.
-- * A delivery_partners row created by a user is always a pending application: status, online flag,
--   ratings and totals are forced to their defaults, and guest (anonymous) sessions cannot apply.
-- * The 'rider' role is granted only when an admin activates the application (status → active).
-- * A profile row inserted by a user is always a plain customer (handle_new_user creates the real one).
-- * is_admin() / is_super_admin() require an active profile, so a deactivated admin loses access at once.
--
-- Rider privacy
-- * Riders see an order's full address, phone and instructions only while the delivery is theirs
--   (accepted / picked up). Offers and past deliveries show the area and pincode only, with the drop
--   point rounded to ~100 m; the orders table itself is readable only during an active delivery.
--
-- Internal helpers
-- * notify_user / notify_store / audit were executable by anyone holding the public anon key, so any
--   visitor could push fake notifications to any customer or store, or write audit rows. Direct calls are
--   revoked; app code uses admin_* wrappers that check is_admin(). SECURITY DEFINER functions that call
--   the helpers internally (place_order, cancel_order, dispatch…) are unaffected.
-- * Store payout details (bank, IFSC, UPI, GSTIN, PAN) can be changed only by the owner or an admin,
--   not by store staff.
--
-- Rider recruitment
-- * Rider pay rates become public settings so the "Deliver with Merta Deal" page shows real numbers.
-- * Each new application notifies every active admin.
-- ============================================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','super_admin') and is_active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' and is_active from public.profiles where id = auth.uid()), false);
$$;

-- Sign-up: always a customer.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, phone, email, referral_code, city_id, is_guest)
  values (
    new.id, 'customer',
    coalesce(new.raw_user_meta_data ->> 'full_name', nullif(split_part(coalesce(new.email,''), '@', 1), ''), 'Guest'),
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone),
    new.email,
    upper(substr(md5(new.id::text), 1, 8)),
    (select id from public.cities where slug = 'merta-city'),
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- A profile a user inserts for themselves can never carry a staff role or balances.
create or replace function public.profiles_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_service() then
    new.role := 'customer';
    new.wallet_balance := 0;
    new.reward_points := 0;
    new.is_active := true;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_insert_trg on public.profiles;
create trigger profiles_guard_insert_trg before insert on public.profiles for each row execute function public.profiles_guard_insert();

-- A rider application a user submits is always pending, offline and starts from zero.
create or replace function public.delivery_partners_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_service() then
    if coalesce((select is_guest from public.profiles where id = auth.uid()), true) then
      raise exception 'ACCOUNT_REQUIRED';
    end if;
    new.user_id := auth.uid();
    new.status := 'pending';
    new.is_online := false;
    new.current_lat := null; new.current_lng := null; new.last_location_at := null;
    new.rating_avg := 0; new.rating_count := 0;
    new.total_deliveries := 0; new.total_earnings := 0;
  end if;
  return new;
end $$;
drop trigger if exists delivery_partners_guard_insert_trg on public.delivery_partners;
create trigger delivery_partners_guard_insert_trg before insert on public.delivery_partners for each row execute function public.delivery_partners_guard_insert();

-- New application: no role change yet; tell the admins.
create or replace function public.riders_after_insert_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  a record;
begin
  if new.status = 'active' then
    update public.profiles set role = 'rider' where id = new.user_id and role = 'customer';
  elsif new.status = 'pending' then
    select coalesce(nullif(trim(full_name), ''), phone) into v_name from public.profiles where id = new.user_id;
    for a in select id from public.profiles where role in ('admin', 'super_admin') and is_active and id <> new.user_id loop
      perform public.notify_user(a.id, 'rider_registered', 'New rider application',
        format('%s applied to deliver with Merta Deal. Check the details and approve under Riders.', coalesce(v_name, 'Someone')),
        jsonb_build_object('rider_id', new.id));
    end loop;
  end if;
  return new;
end $$;

-- Approval is what makes someone a rider.
create or replace function public.riders_after_status_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    update public.profiles set role = 'rider' where id = new.user_id and role = 'customer';
  end if;
  return new;
end $$;
drop trigger if exists riders_after_status_role_trg on public.delivery_partners;
create trigger riders_after_status_role_trg after update of status on public.delivery_partners for each row execute function public.riders_after_status_role();

-- Order rows (address, phone, instructions) are visible to a rider only during their active delivery.
create or replace function public.is_assigned_rider(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id
    where a.order_id = p_order_id and dp.user_id = auth.uid() and a.status in ('accepted','picked_up'));
$$;

create or replace function public.rider_assignments(p_status text[] default array['offered','accepted','picked_up'])
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  update public.delivery_assignments set status = 'expired' where rider_id = dp.id and status = 'offered' and expires_at < now();
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
      'store', jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone, 'address_line1', s.address_line1, 'area', s.area, 'lat', s.lat, 'lng', s.lng),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'pack_label', oi.pack_label)), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id)
    ) order by a.created_at desc), '[]'::jsonb)
    from public.delivery_assignments a
    cross join lateral (select a.status in ('accepted','picked_up') as live) x
    join public.orders o on o.id = a.order_id join public.stores s on s.id = o.store_id
    where a.rider_id = dp.id and a.status::text = any(p_status));
end $$;

update public.settings set is_public = true where key in ('rider_base_earning', 'rider_per_km_earning');

-- ---------------------------------------------------------------------------- internal helpers --
create or replace function public.admin_audit(p_action text, p_entity text, p_entity_id text, p_before jsonb default null, p_after jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform public.audit(p_action, p_entity, p_entity_id, p_before, p_after);
end $$;

create or replace function public.admin_notify_user(p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform public.notify_user(p_user_id, p_type, p_title, p_body, p_data);
end $$;

create or replace function public.admin_notify_store(p_store_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform public.notify_store(p_store_id, p_type, p_title, p_body, p_data);
end $$;

revoke execute on function public.notify_user(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_store(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.audit(text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_audit(text, text, text, jsonb, jsonb) from public, anon;
revoke execute on function public.admin_notify_user(uuid, text, text, text, jsonb) from public, anon;
revoke execute on function public.admin_notify_store(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.admin_audit(text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.admin_notify_user(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.admin_notify_store(uuid, text, text, text, jsonb) to authenticated;

-- Payout details: owner or admin only.
create or replace function public.stores_protect_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_service() then
    new.status := old.status;
    new.commission_rate := old.commission_rate;
    new.is_featured := old.is_featured;
    new.owner_id := old.owner_id;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.total_orders := old.total_orders;
    if auth.uid() is distinct from old.owner_id then
      new.bank_account_name := old.bank_account_name;
      new.bank_account_number := old.bank_account_number;
      new.bank_ifsc := old.bank_ifsc;
      new.upi_id := old.upi_id;
      new.gstin := old.gstin;
      new.pan := old.pan;
    end if;
  end if;
  return new;
end $$;
