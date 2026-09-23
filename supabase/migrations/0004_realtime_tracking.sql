-- ============================================================================
-- MERTA DEAL — Realtime publication + order tracking + rider views
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  for t in select unnest(array['orders','order_status_history','delivery_assignments','delivery_locations','notifications','delivery_partners','inventory','carts','cart_items']) loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Full replica identity so realtime UPDATE payloads carry all columns (filters need them)
alter table public.orders replica identity full;
alter table public.delivery_assignments replica identity full;
alter table public.delivery_locations replica identity full;
alter table public.notifications replica identity full;

-- ----------------------------------------------------------------------------
-- Order tracking payload (customer / store / rider / admin — scoped by RLS-like checks)
-- ----------------------------------------------------------------------------
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
    'delivery_otp', case when v_is_customer or v_admin then (select delivery_otp from public.order_secrets where order_id = o.id) end,
    'can_review', v_is_customer and o.status in ('delivered','completed'),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('target', rv.target, 'product_id', rv.product_id, 'rating', rv.rating, 'status', rv.status)), '[]'::jsonb) from public.reviews rv where rv.order_id = o.id and rv.user_id = v_uid),
    'viewer', case when v_admin then 'admin' when v_is_customer then 'customer' when v_is_store then 'store' else 'rider' end
  );
  return r;
end $$;
grant execute on function public.order_tracking(uuid) to authenticated, service_role;

-- Rider: my assignments with order + store + customer info
create or replace function public.rider_assignments(p_status text[] default array['offered','accepted','picked_up'])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare dp public.delivery_partners;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  update public.delivery_assignments set status = 'expired' where rider_id = dp.id and status = 'offered' and expires_at < now();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'status', a.status, 'offered_at', a.offered_at, 'expires_at', a.expires_at, 'responded_at', a.responded_at,
      'picked_up_at', a.picked_up_at, 'delivered_at', a.delivered_at, 'distance_km', a.distance_km, 'earning', a.earning, 'cod_amount', a.cod_amount,
      'pickup_lat', a.pickup_lat, 'pickup_lng', a.pickup_lng, 'drop_lat', a.drop_lat, 'drop_lng', a.drop_lng,
      'order', jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'total', o.total, 'item_count', o.item_count,
        'payment_method', o.payment_method, 'delivery_instructions', o.delivery_instructions, 'address', o.address_snapshot, 'promised_at', o.promised_at, 'created_at', o.created_at),
      'store', jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone, 'address_line1', s.address_line1, 'area', s.area, 'lat', s.lat, 'lng', s.lng),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'pack_label', oi.pack_label)), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id)
    ) order by a.created_at desc), '[]'::jsonb)
    from public.delivery_assignments a join public.orders o on o.id = a.order_id join public.stores s on s.id = o.store_id
    where a.rider_id = dp.id and a.status::text = any(p_status));
end $$;
grant execute on function public.rider_assignments(text[]) to authenticated, service_role;
