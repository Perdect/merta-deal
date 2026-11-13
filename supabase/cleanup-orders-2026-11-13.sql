-- One-off clean-up requested 2026-11-13: fresh start. Removes every order and delivery, the three inquiries
-- (service request, rider application, listing request) and all notifications. Keeps customers, riders,
-- products, prices, settings and the approved business listing. Stock held by open orders goes back to the
-- shelf through _order_release_stock (which writes the passbook rows). The stock passbook keeps its history;
-- only its pointer to a deleted order is cleared, which its immutability trigger must allow once.
-- Runs as one transaction: if anything fails, nothing is changed. Paste into the Supabase SQL editor and Run.
begin;
select count(*) as released from (select public._order_release_stock(id, 'Fresh start: order history cleared on 13 Nov 2026') from public.orders where stock_state = 'reserved') r;
delete from public.rider_earnings;
delete from public.cod_collections;
delete from public.rider_cash_remittances;
delete from public.rider_payouts;
delete from public.reviews where order_id is not null;
delete from public.wallet_transactions;
delete from public.reward_transactions;
delete from public.support_tickets;
delete from public.delivery_assignments;
alter table public.inventory_passbook disable trigger user;
delete from public.orders;
alter table public.inventory_passbook enable trigger user;
delete from public.service_requests;
delete from public.rider_applications;
delete from public.business_listing_requests;
delete from public.notifications;
update public.inventory set reserved_qty = 0 where reserved_qty <> 0;
commit;
-- Check: every count below should be 0 except passbook_rows, customers, riders, businesses and products.
select (select count(*) from public.orders) orders, (select count(*) from public.delivery_assignments) assignments, (select count(*) from public.delivery_locations) gps_points,
       (select count(*) from public.payments) payments, (select count(*) from public.notifications) notifications,
       (select count(*) from public.service_requests) inquiries, (select count(*) from public.rider_applications) rider_apps, (select count(*) from public.business_listing_requests) listing_requests,
       (select coalesce(sum(reserved_qty),0) from public.inventory) reserved, (select count(*) from public.inventory_passbook) passbook_rows,
       (select count(*) from public.profiles where role = 'customer') customers, (select count(*) from public.delivery_partners) riders,
       (select count(*) from public.local_businesses) businesses, (select count(*) from public.products) products;
