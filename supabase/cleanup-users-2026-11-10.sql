-- One-off clean-up requested 2026-11-10: keep only the mertadeal@gmail.com admin account.
-- Deletes every other auth user (profiles, addresses, carts, wallets, notifications cascade), the 4 test
-- orders and everything hanging off them, and the 2 test riders. Audit log rows are kept with the actor
-- blanked. Runs as one transaction: if anything fails nothing is changed.
begin;

create temp table del_users on commit drop as
  select u.id from auth.users u where u.email is distinct from 'mertadeal@gmail.com';
create temp table del_orders on commit drop as
  select o.id from public.orders o where o.user_id in (select id from del_users);

-- keep history rows, drop the reference to the deleted person
update public.audit_logs set actor_id = null where actor_id in (select id from del_users);
update public.local_businesses set created_by = null where created_by in (select id from del_users);
update public.local_businesses set updated_by = null where updated_by in (select id from del_users);
update public.business_listing_requests set reviewed_by = null where reviewed_by in (select id from del_users);
update public.orders set packed_by = null where packed_by in (select id from del_users);
update public.orders set accepted_by = null where accepted_by in (select id from del_users);
update public.service_requests set handled_by = null where handled_by in (select id from del_users);
update public.suppliers set created_by = null where created_by in (select id from del_users);
update public.price_history set changed_by = null where changed_by in (select id from del_users);
update public.scheduled_price_changes set created_by = null where created_by in (select id from del_users);
update public.rider_rate_cards set created_by = null where created_by in (select id from del_users);
update public.order_pack_events set actor_id = null where actor_id in (select id from del_users);
update public.delivery_assignments set handed_over_by = null where handed_over_by in (select id from del_users);

-- test orders and rider money rows
delete from public.service_requests where user_id in (select id from del_users);
delete from public.reviews where order_id in (select id from del_orders);
delete from public.reward_transactions where order_id in (select id from del_orders);
delete from public.support_tickets where order_id in (select id from del_orders) or user_id in (select id from del_users);
delete from public.wallet_transactions where order_id in (select id from del_orders) or user_id in (select id from del_users);
delete from public.cod_collections where assignment_id in (select id from public.delivery_assignments where order_id in (select id from del_orders)) or rider_id in (select id from public.delivery_partners where user_id in (select id from del_users));
delete from public.rider_earnings where order_id in (select id from del_orders) or rider_id in (select id from public.delivery_partners where user_id in (select id from del_users));
delete from public.rider_cash_remittances where rider_id in (select id from public.delivery_partners where user_id in (select id from del_users));
delete from public.rider_payouts where rider_id in (select id from public.delivery_partners where user_id in (select id from del_users));
delete from public.orders where id in (select id from del_orders);

-- the accounts themselves (profiles and own-row tables cascade)
delete from auth.users where id in (select id from del_users);

select (select count(*) from auth.users) as users_left, (select email from auth.users limit 1) as who,
       (select count(*) from public.orders) as orders_left, (select count(*) from public.delivery_partners) as riders_left;
commit;
