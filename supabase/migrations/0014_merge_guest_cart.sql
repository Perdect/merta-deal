-- ============================================================================
-- MERTA DEAL — Keep a guest's cart when they sign in from the cart drawer.
-- Guests shop on an anonymous Supabase session; signing in switches to a real
-- user, which would otherwise orphan the cart they just filled. The sign-in
-- action calls this right after authentication. Only anonymous users' carts
-- can be claimed, and the guest's (newer) store choice wins: one store per cart.
-- ============================================================================
create or replace function public.merge_guest_cart(p_guest_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_guest_cart_id uuid;
  v_moved int := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED: Sign in first'; end if;
  if p_guest_user_id = v_uid then return jsonb_build_object('moved', 0); end if;
  if not exists (select 1 from auth.users where id = p_guest_user_id and coalesce(is_anonymous, false)) then
    return jsonb_build_object('moved', 0, 'reason', 'not_a_guest');
  end if;
  select id into v_guest_cart_id from public.carts where user_id = p_guest_user_id and status = 'active';
  if v_guest_cart_id is null or not exists (select 1 from public.cart_items where cart_id = v_guest_cart_id) then
    return jsonb_build_object('moved', 0);
  end if;
  delete from public.carts where user_id = v_uid and status = 'active';
  update public.carts set user_id = v_uid, updated_at = now() where id = v_guest_cart_id;
  select count(*) into v_moved from public.cart_items where cart_id = v_guest_cart_id;
  return jsonb_build_object('moved', v_moved);
end $$;
revoke all on function public.merge_guest_cart(uuid) from public;
grant execute on function public.merge_guest_cart(uuid) to authenticated;
