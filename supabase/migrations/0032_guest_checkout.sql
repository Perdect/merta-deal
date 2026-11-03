-- ============================================================================
-- MERTA DEAL — Guest checkout, Zepto-style: shop → address → login → pay.
-- A guest (anonymous Supabase session) can now save a delivery address before
-- signing in. Signing in switches to the real account, so the merge that already
-- carried the cart over now carries the guest's addresses too (same row ids, so
-- the address chosen in the cart stays selected after login).
-- ============================================================================
create or replace function public.merge_guest_cart(p_guest_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_guest_cart_id uuid;
  v_moved int := 0;
  v_addresses int := 0;
  v_has_default boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED: Sign in first'; end if;
  if p_guest_user_id = v_uid then return jsonb_build_object('moved', 0, 'addresses', 0); end if;
  if not exists (select 1 from auth.users where id = p_guest_user_id and coalesce(is_anonymous, false)) then
    return jsonb_build_object('moved', 0, 'addresses', 0, 'reason', 'not_a_guest');
  end if;

  -- Addresses: keep their ids; the account's own default wins, otherwise the guest's newest becomes it.
  select exists (select 1 from public.addresses where user_id = v_uid and is_default) into v_has_default;
  with moved as (
    update public.addresses
       set user_id = v_uid, is_default = false, updated_at = now()
     where user_id = p_guest_user_id
    returning id, created_at
  )
  select count(*) into v_addresses from moved;
  if v_addresses > 0 and not v_has_default then
    update public.addresses set is_default = true
     where id = (select id from public.addresses where user_id = v_uid order by created_at desc limit 1);
  end if;

  -- Cart: the guest's (newer) cart replaces whatever the account had.
  select id into v_guest_cart_id from public.carts where user_id = p_guest_user_id and status = 'active';
  if v_guest_cart_id is null or not exists (select 1 from public.cart_items where cart_id = v_guest_cart_id) then
    return jsonb_build_object('moved', 0, 'addresses', v_addresses);
  end if;
  delete from public.carts where user_id = v_uid and status = 'active';
  update public.carts set user_id = v_uid, updated_at = now() where id = v_guest_cart_id;
  select count(*) into v_moved from public.cart_items where cart_id = v_guest_cart_id;
  return jsonb_build_object('moved', v_moved, 'addresses', v_addresses);
end $$;
revoke all on function public.merge_guest_cart(uuid) from public;
grant execute on function public.merge_guest_cart(uuid) to authenticated;
