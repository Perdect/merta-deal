-- ============================================================================
-- MERTA DEAL — Self-serve onboarding: registering a store / rider upgrades a customer's role
-- ============================================================================
create or replace function public.stores_after_insert_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = 'store_owner' where id = new.owner_id and role = 'customer';
  perform public.notify_user(new.owner_id, 'store_registered', 'Store registration received',
    format('%s is under review. You can add products now; orders start once an admin approves the store.', new.name),
    jsonb_build_object('store_id', new.id));
  return new;
end $$;
drop trigger if exists stores_after_insert_role_trg on public.stores;
create trigger stores_after_insert_role_trg after insert on public.stores for each row execute function public.stores_after_insert_role();

create or replace function public.riders_after_insert_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = 'rider' where id = new.user_id and role = 'customer';
  return new;
end $$;
drop trigger if exists riders_after_insert_role_trg on public.delivery_partners;
create trigger riders_after_insert_role_trg after insert on public.delivery_partners for each row execute function public.riders_after_insert_role();
