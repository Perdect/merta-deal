-- ============================================================================
-- MERTA DEAL — 0008: Store staff management
-- Store owners add/remove staff by email from the merchant portal. Profiles are
-- RLS-restricted to the owner row, so the lookup and the profile role bump run
-- inside SECURITY DEFINER functions with explicit ownership checks.
-- ============================================================================

-- The profile column guard (0003) silently resets `role` for non-admin callers,
-- including SECURITY DEFINER functions invoked by a store owner. Allow exactly two
-- narrow, non-escalating transitions that are backed by the store_staff table:
--   customer    -> store_staff  when the user has an active store_staff membership
--   store_staff -> customer     when the user has no active membership left
-- Everything else keeps the original admin-only behaviour.
create or replace function public.profiles_protect_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_has_membership boolean;
begin
  if not public.is_admin_or_service() then
    select exists (select 1 from public.store_staff where user_id = new.id and is_active) into v_has_membership;
    if not (
      (old.role = 'customer' and new.role = 'store_staff' and v_has_membership)
      or (old.role = 'store_staff' and new.role = 'customer' and not v_has_membership)
    ) then
      new.role := old.role;
    end if;
    new.wallet_balance := old.wallet_balance;
    new.reward_points := old.reward_points;
    new.is_active := old.is_active;
    new.referral_code := old.referral_code;
  elsif auth.uid() is not null and new.role in ('admin','super_admin') and old.role not in ('admin','super_admin') and not public.is_super_admin() then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;
  return new;
end $$;

-- Owner (or admin) adds a staff member by the email of an existing account.
create or replace function public.store_add_staff(p_store_id uuid, p_email text, p_role public.store_staff_role default 'staff')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_owner uuid; v_id uuid; v_role public.user_role;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select owner_id into v_owner from public.stores where id = p_store_id;
  if v_owner is null then raise exception 'STORE_NOT_FOUND'; end if;
  if not (v_owner = auth.uid() or public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_email is null or length(trim(p_email)) = 0 then raise exception 'INVALID_EMAIL: Enter the staff member''s email'; end if;

  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_uid is null then raise exception 'USER_NOT_FOUND: No Merta Deal account uses this email. Ask them to sign up first.'; end if;
  if v_uid = v_owner then raise exception 'ALREADY_OWNER: This account already owns the store.'; end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role in ('admin','super_admin','rider','store_owner') then
    raise exception 'ROLE_CONFLICT: This account is registered as %, it cannot be added as staff.', replace(v_role::text, '_', ' ');
  end if;

  insert into public.store_staff (store_id, user_id, role, is_active)
  values (p_store_id, v_uid, coalesce(p_role, 'staff'), true)
  on conflict (store_id, user_id) do update set role = excluded.role, is_active = true
  returning id into v_id;

  -- Bump plain customers to store_staff so the /store routes open for them (guard above allows this).
  update public.profiles set role = 'store_staff' where id = v_uid and role = 'customer';

  perform public.notify_user(v_uid, 'store_staff', 'You were added as store staff',
    'You can now manage orders and stock for ' || (select name from public.stores where id = p_store_id) || '.',
    jsonb_build_object('store_id', p_store_id));

  return jsonb_build_object('id', v_id, 'user_id', v_uid, 'role', coalesce(p_role, 'staff'));
end $$;

-- Owner (or admin) removes a staff member. Drops the profile back to customer when no membership remains.
create or replace function public.store_remove_staff(p_staff_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.store_staff; v_owner uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into s from public.store_staff where id = p_staff_id;
  if s.id is null then raise exception 'NOT_FOUND'; end if;
  select owner_id into v_owner from public.stores where id = s.store_id;
  if not (v_owner = auth.uid() or public.is_admin()) then raise exception 'FORBIDDEN'; end if;

  delete from public.store_staff where id = s.id;
  if not exists (select 1 from public.store_staff where user_id = s.user_id and is_active) then
    update public.profiles set role = 'customer' where id = s.user_id and role = 'store_staff';
  end if;
end $$;

-- Staff roster with contact details (profiles are otherwise only readable by their owner).
create or replace function public.store_list_staff(p_store_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when not (public.is_store_member(p_store_id) or public.is_admin()) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ss.id, 'user_id', ss.user_id, 'role', ss.role, 'is_active', ss.is_active, 'created_at', ss.created_at,
        'full_name', p.full_name, 'email', p.email, 'phone', p.phone, 'avatar_url', p.avatar_url
      ) order by ss.created_at)
      from public.store_staff ss join public.profiles p on p.id = ss.user_id
      where ss.store_id = p_store_id), '[]'::jsonb)
  end;
$$;

grant execute on function public.store_add_staff(uuid, text, public.store_staff_role) to authenticated, service_role;
grant execute on function public.store_remove_staff(uuid) to authenticated, service_role;
grant execute on function public.store_list_staff(uuid) to authenticated, service_role;
