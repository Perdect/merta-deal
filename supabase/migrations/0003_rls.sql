-- ============================================================================
-- MERTA DEAL — Row Level Security
-- Roles: customer, store_owner, store_staff, rider, admin, super_admin
-- ============================================================================

-- Service-role / migration / seed contexts have no auth.uid(); anon cannot write these tables under RLS,
-- so a null uid here always means a trusted server context.
create or replace function public.is_admin_or_service()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or public.is_admin();
$$;

-- Protective triggers: columns only admins may change ------------------------
create or replace function public.profiles_protect_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_service() then
    new.role := old.role;
    new.wallet_balance := old.wallet_balance;
    new.reward_points := old.reward_points;
    new.is_active := old.is_active;
    new.referral_code := old.referral_code;
  elsif auth.uid() is not null and new.role in ('admin','super_admin') and old.role not in ('admin','super_admin') and not public.is_super_admin() then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;
  return new;
end $$;
create trigger profiles_protect_columns_trg before update on public.profiles for each row execute function public.profiles_protect_columns();

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
  end if;
  return new;
end $$;
create trigger stores_protect_columns_trg before update on public.stores for each row execute function public.stores_protect_columns();

create or replace function public.stores_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_service() then
    new.owner_id := auth.uid();
    new.status := 'pending';
    new.commission_rate := null;
    new.is_featured := false;
  end if;
  if new.slug is null or new.slug = '' then new.slug := public.slugify(new.name); end if;
  if exists (select 1 from public.stores where slug = new.slug) then new.slug := new.slug || '-' || substr(gen_random_uuid()::text,1,4); end if;
  if new.city_id is null then new.city_id := (select id from public.cities where slug = 'merta-city'); end if;
  return new;
end $$;
create trigger stores_before_insert_trg before insert on public.stores for each row execute function public.stores_before_insert();

create or replace function public.delivery_partners_protect_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_service() then
    new.status := old.status;
    new.user_id := old.user_id;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.total_deliveries := old.total_deliveries;
    new.total_earnings := old.total_earnings;
  end if;
  return new;
end $$;
create trigger delivery_partners_protect_columns_trg before update on public.delivery_partners for each row execute function public.delivery_partners_protect_columns();

create or replace function public.products_protect_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_service() then
    if tg_op = 'INSERT' then
      if new.created_by_store_id is null or not public.is_store_member(new.created_by_store_id) then raise exception 'FORBIDDEN'; end if;
      new.is_approved := not public.get_setting_bool('require_product_approval', false);
      new.popularity_score := 0; new.rating_avg := 0; new.rating_count := 0;
    else
      new.is_approved := old.is_approved; new.popularity_score := old.popularity_score;
      new.rating_avg := old.rating_avg; new.rating_count := old.rating_count; new.created_by_store_id := old.created_by_store_id;
    end if;
  end if;
  if new.slug is null or new.slug = '' then new.slug := public.slugify(new.name || ' ' || coalesce(new.pack_label,'')); end if;
  return new;
end $$;
create trigger products_protect_columns_trg before insert or update on public.products for each row execute function public.products_protect_columns();

-- Cross-table visibility helpers (SECURITY DEFINER => no RLS recursion between orders/assignments)
create or replace function public.is_assigned_rider(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id
    where a.order_id = p_order_id and dp.user_id = auth.uid() and a.status in ('offered','accepted','picked_up','delivered'));
$$;
create or replace function public.can_view_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and (o.user_id = auth.uid() or public.is_store_member(o.store_id) or public.is_admin() or public.is_assigned_rider(o.id)));
$$;
create or replace function public.can_view_assignment(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id
    where a.id = p_assignment_id and (dp.user_id = auth.uid() or public.is_admin() or public.can_view_order(a.order_id)));
$$;
create or replace function public.can_view_rider(p_rider_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.delivery_partners dp where dp.id = p_rider_id and dp.user_id = auth.uid())
      or public.is_admin()
      or exists (
        select 1 from public.delivery_assignments a join public.orders o on o.id = a.order_id
        where a.rider_id = p_rider_id and a.status in ('accepted','picked_up','delivered')
          and (o.user_id = auth.uid() or public.is_store_member(o.store_id)));
$$;

-- Enable RLS everywhere -------------------------------------------------------
do $$
declare t text;
begin
  for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- cities / zones
create policy cities_read on public.cities for select using (true);
create policy cities_admin on public.cities for all using (public.is_admin()) with check (public.is_admin());
create policy zones_read on public.delivery_zones for select using (true);
create policy zones_admin on public.delivery_zones for all using (public.is_admin()) with check (public.is_admin());

-- profiles
create policy profiles_select_own on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy profiles_insert_self on public.profiles for insert with check (id = auth.uid());

-- stores
create policy stores_public_read on public.stores for select using (status = 'active' or public.is_store_member(id) or public.is_admin());
create policy stores_insert on public.stores for insert with check (auth.uid() is not null);
create policy stores_update on public.stores for update using (owner_id = auth.uid() or public.is_store_member(id) or public.is_admin()) with check (owner_id = auth.uid() or public.is_store_member(id) or public.is_admin());
create policy stores_delete_admin on public.stores for delete using (public.is_admin());

create policy store_staff_read on public.store_staff for select using (user_id = auth.uid() or public.is_store_member(store_id) or public.is_admin());
create policy store_staff_write on public.store_staff for all using (exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid()) or public.is_admin())
  with check (exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid()) or public.is_admin());

create policy store_documents_read on public.store_documents for select using (public.is_store_member(store_id) or public.is_admin());
create policy store_documents_insert on public.store_documents for insert with check (public.is_store_member(store_id) or public.is_admin());
create policy store_documents_update on public.store_documents for update using (public.is_admin() or (public.is_store_member(store_id) and status = 'pending'));
create policy store_documents_delete on public.store_documents for delete using (public.is_admin() or (public.is_store_member(store_id) and status = 'pending'));

create policy store_commissions_read on public.store_commissions for select using (public.is_store_member(store_id) or public.is_admin());
create policy store_commissions_admin on public.store_commissions for all using (public.is_admin()) with check (public.is_admin());

-- catalog
create policy categories_read on public.categories for select using (is_active or public.is_admin() or public.current_user_role() in ('store_owner','store_staff'));
create policy categories_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy brands_read on public.brands for select using (true);
create policy brands_admin on public.brands for all using (public.is_admin()) with check (public.is_admin());
create policy brands_store_insert on public.brands for insert with check (public.current_user_role() in ('store_owner','store_staff'));

create policy products_read on public.products for select using ((is_active and is_approved) or public.is_admin() or (created_by_store_id is not null and public.is_store_member(created_by_store_id)));
create policy products_admin on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy products_store_insert on public.products for insert with check (created_by_store_id is not null and public.is_store_member(created_by_store_id));
create policy products_store_update on public.products for update using (created_by_store_id is not null and public.is_store_member(created_by_store_id));

create policy synonyms_read on public.search_synonyms for select using (true);
create policy synonyms_admin on public.search_synonyms for all using (public.is_admin()) with check (public.is_admin());

create policy inventory_read on public.inventory for select using (is_active or public.is_store_member(store_id) or public.is_admin());
create policy inventory_store_write on public.inventory for all using (public.is_store_member(store_id) or public.is_admin()) with check (public.is_store_member(store_id) or public.is_admin());

create policy inventory_movements_read on public.inventory_movements for select using (public.is_admin() or exists (select 1 from public.inventory i where i.id = inventory_id and public.is_store_member(i.store_id)));

-- customer data
create policy addresses_own on public.addresses for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy wishlists_own on public.wishlists for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- coupons
create policy coupons_read on public.coupons for select using ((is_active and (expires_at is null or expires_at > now())) or public.is_admin() or (store_id is not null and public.is_store_member(store_id)));
create policy coupons_admin on public.coupons for all using (public.is_admin()) with check (public.is_admin());
create policy coupon_usage_read on public.coupon_usage for select using (user_id = auth.uid() or public.is_admin());

-- carts
create policy carts_own on public.carts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cart_items_own on public.cart_items for all using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

-- orders (mutations happen through SECURITY DEFINER functions only)
create policy orders_read on public.orders for select using (
  user_id = auth.uid() or public.is_store_member(store_id) or public.is_admin() or public.is_assigned_rider(id)
);
create policy orders_admin_update on public.orders for update using (public.is_admin()) with check (public.is_admin());

create policy order_secrets_read on public.order_secrets for select using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()) or public.is_admin());

create policy order_items_read on public.order_items for select using (public.can_view_order(order_id));

create policy order_status_history_read on public.order_status_history for select using (public.can_view_order(order_id));

-- payments
create policy payments_read on public.payments for select using (user_id = auth.uid() or public.is_admin() or public.can_view_order(order_id));
create policy payments_admin on public.payments for update using (public.is_admin()) with check (public.is_admin());

create policy wallet_txn_read on public.wallet_transactions for select using (user_id = auth.uid() or public.is_admin());
create policy wallet_txn_admin on public.wallet_transactions for insert with check (public.is_admin());
create policy reward_txn_read on public.reward_transactions for select using (user_id = auth.uid() or public.is_admin());

-- delivery
create policy riders_read on public.delivery_partners for select using (public.can_view_rider(id));
create policy riders_update_own on public.delivery_partners for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy riders_insert_own on public.delivery_partners for insert with check (user_id = auth.uid() or public.is_admin());
create policy riders_admin_delete on public.delivery_partners for delete using (public.is_admin());

create policy assignments_read on public.delivery_assignments for select using (public.can_view_assignment(id));

create policy locations_read on public.delivery_locations for select using (public.can_view_assignment(assignment_id));

-- reviews
create policy reviews_read on public.reviews for select using (status = 'approved' or user_id = auth.uid() or public.is_admin() or (store_id is not null and public.is_store_member(store_id)));
create policy reviews_admin on public.reviews for all using (public.is_admin()) with check (public.is_admin());
create policy reviews_delete_own on public.reviews for delete using (user_id = auth.uid());

-- notifications
create policy notifications_own_read on public.notifications for select using (user_id = auth.uid() or public.is_admin());
create policy notifications_own_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on public.notifications for delete using (user_id = auth.uid());
create policy notifications_admin_insert on public.notifications for insert with check (public.is_admin());
create policy push_subs_own on public.push_subscriptions for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

-- marketing
create policy banners_read on public.banners for select using ((is_active and starts_at <= now() and (ends_at is null or ends_at > now())) or public.is_admin());
create policy banners_admin on public.banners for all using (public.is_admin()) with check (public.is_admin());
create policy promotions_read on public.promotions for select using (is_active or public.is_admin());
create policy promotions_admin on public.promotions for all using (public.is_admin()) with check (public.is_admin());

-- payouts / support / audit / settings
create policy payouts_read on public.payouts for select using (public.is_store_member(store_id) or public.is_admin());
create policy payouts_admin on public.payouts for all using (public.is_admin()) with check (public.is_admin());

create policy tickets_own on public.support_tickets for select using (user_id = auth.uid() or public.is_admin());
create policy tickets_insert on public.support_tickets for insert with check (user_id = auth.uid());
create policy tickets_admin_update on public.support_tickets for update using (public.is_admin()) with check (public.is_admin());
create policy ticket_messages_read on public.support_messages for select using (public.is_admin() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
create policy ticket_messages_insert on public.support_messages for insert with check (sender_id = auth.uid() and (public.is_admin() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())));

create policy audit_logs_admin on public.audit_logs for select using (public.is_admin());

create policy settings_read on public.settings for select using (is_public or public.is_admin());
create policy settings_admin on public.settings for all using (public.is_admin()) with check (public.is_admin());

create policy whatsapp_admin on public.whatsapp_messages for all using (public.is_admin()) with check (public.is_admin());

-- Table grants (Supabase grants these by default for new tables via default privileges; explicit for clarity)
grant select on all tables in schema public to anon;
grant all on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke all on public.order_secrets from anon;
revoke all on public.audit_logs from anon;
revoke all on public.whatsapp_messages from anon;
