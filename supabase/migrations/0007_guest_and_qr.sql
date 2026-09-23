-- ============================================================================
-- MERTA DEAL — Scan-to-pay support: pay-first rule, short-code tracking without login, QR links
-- ============================================================================

-- Short code on orders for phone + code lookup (guest recovery, like a receipt number)
alter table public.orders add column if not exists short_code text;
create or replace function public.orders_set_short_code()
returns trigger language plpgsql as $$
begin
  if new.short_code is null then new.short_code := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6)); end if;
  return new;
end $$;
drop trigger if exists orders_short_code_trg on public.orders;
create trigger orders_short_code_trg before insert on public.orders for each row execute function public.orders_set_short_code();
update public.orders set short_code = upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6)) where short_code is null;
create unique index if not exists orders_short_code_idx on public.orders(short_code);

-- Pay-first: stores may only accept online orders once paid (COD and wallet are fine).
create or replace function public.store_update_order(p_order_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; v_item record; v_assignment uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if not (public.is_store_member(o.store_id) or public.is_admin()) then raise exception 'FORBIDDEN'; end if;

  case p_action
    when 'accept' then
      if o.status <> 'placed' then raise exception 'INVALID_TRANSITION: % -> accept', o.status; end if;
      if o.payment_method not in ('cod') and o.payment_status not in ('paid','authorized') then raise exception 'PAYMENT_PENDING: Online payment has not been received yet'; end if;
      perform public._set_order_status(o.id, 'store_confirmed', p_note);
    when 'reject' then
      if o.status <> 'placed' then raise exception 'INVALID_TRANSITION: % -> reject', o.status; end if;
      for v_item in select inventory_id, quantity from public.order_items where order_id = o.id and inventory_id is not null loop
        update public.inventory set stock_qty = stock_qty + v_item.quantity, sold_count = greatest(sold_count - v_item.quantity, 0) where id = v_item.inventory_id;
        insert into public.inventory_movements (inventory_id, delta, reason, reference_id, actor_id) values (v_item.inventory_id, v_item.quantity, 'reject_restock', o.id, auth.uid());
      end loop;
      update public.orders set reject_reason = p_note where id = o.id;
      perform public._handle_refund_on_cancel(o.id);
      perform public._set_order_status(o.id, 'rejected', p_note);
    when 'preparing' then
      if o.status <> 'store_confirmed' then raise exception 'INVALID_TRANSITION: % -> preparing', o.status; end if;
      perform public._set_order_status(o.id, 'preparing', p_note);
    when 'ready' then
      if o.status not in ('store_confirmed','preparing') then raise exception 'INVALID_TRANSITION: % -> ready', o.status; end if;
      perform public._set_order_status(o.id, 'ready_for_pickup', p_note);
      v_assignment := public.auto_dispatch(o.id);
    else raise exception 'UNKNOWN_ACTION';
  end case;
  return jsonb_build_object('ok', true, 'status', (select status from public.orders where id = o.id), 'assignment_id', v_assignment);
end $$;

-- Track an order without a login: order number (or short code) + the phone used on the address.
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
    'delivery_otp', (select delivery_otp from public.order_secrets where order_id = o.id),
    'rider', (select jsonb_build_object('name', pr.full_name, 'vehicle_number', dp.vehicle_number) from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id join public.profiles pr on pr.id = dp.user_id where a.order_id = o.id and a.status in ('accepted','picked_up','delivered') order by a.created_at desc limit 1)
  );
end $$;
grant execute on function public.track_order_by_code(text, text) to anon, authenticated, service_role;

-- Editable QR short links (admin-managed): /r/<slug> -> target path
insert into public.settings (key, value, "group", label, description, is_public) values
('qr_links', '{"start":"/start","offers":"/c/grocery?coupon=WELCOME50","local":"/c/local-products","stores":"/stores"}', 'marketing', 'QR short links', 'Map of /r/<slug> to a destination path. Re-point printed QR codes without reprinting.', true)
on conflict (key) do nothing;

-- Anonymous (guest) users: mark profile so the UI can prompt them to save their account
alter table public.profiles add column if not exists is_guest boolean not null default false;
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := 'customer';
  v_requested text := new.raw_user_meta_data ->> 'role';
begin
  if v_requested in ('store_owner','rider') then v_role := v_requested::public.user_role; end if;
  insert into public.profiles (id, role, full_name, phone, email, referral_code, city_id, is_guest)
  values (
    new.id, v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', nullif(split_part(coalesce(new.email,''), '@', 1), ''), 'Guest'),
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone),
    new.email,
    upper(substr(md5(new.id::text), 1, 8)),
    (select id from public.cities where slug = 'merta-city'),
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do nothing;
  if v_role = 'rider' then
    insert into public.delivery_partners (user_id, city_id, vehicle_type, vehicle_number)
    values (new.id, (select id from public.cities where slug = 'merta-city'), coalesce((new.raw_user_meta_data ->> 'vehicle_type')::public.vehicle_type, 'bike'), new.raw_user_meta_data ->> 'vehicle_number')
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

-- When an anonymous user links an email/phone, clear the guest flag and sync contact details
create or replace function public.handle_user_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set
    email = coalesce(new.email, email),
    phone = coalesce(nullif(regexp_replace(coalesce(new.phone,''), '^\+?91', ''), ''), phone),
    is_guest = coalesce(new.is_anonymous, false),
    full_name = coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), full_name)
  where id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email, phone, is_anonymous, raw_user_meta_data on auth.users
for each row execute function public.handle_user_updated();
