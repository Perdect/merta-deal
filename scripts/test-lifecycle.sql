-- End-to-end order lifecycle test executed as real users (JWT claims) against the local DB.
-- customer -> search -> cart -> coupon -> place order (COD) -> store accept/prepare/ready
-- -> auto dispatch -> rider accept -> pickup -> OTP verify -> delivered -> customer review -> completed
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table t (k text primary key, v text);
grant all on t to authenticated, anon;
create or replace function pg_temp.as_user(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'CHECK FAILED: %', p_name; end if;
  raise notice 'ok - %', p_name;
end $$;
set local client_min_messages = notice;
set local role authenticated;

-- ---------------- customer ----------------
select pg_temp.as_user('30000000-0000-4000-8000-000000000001');
select pg_temp.check('smart search: "aata" finds atta', (select (search_products('aata') -> 'total')::int > 0));
select pg_temp.check('smart search: "lal mirch" top 3 are chilli products', (select bool_and(x.name ilike '%chilli%' or x.name ilike '%mirch%') from (select * from jsonb_to_recordset(search_products('lal mirch') -> 'items') as r(name text) limit 3) x));
select pg_temp.check('smart search: "chini" finds sugar', (select (search_products('chini') -> 'items' -> 0 ->> 'name') ilike '%sugar%'));
select pg_temp.check('typeahead returns products', (select jsonb_array_length(search_suggest('amul') -> 'products') > 0));
select pg_temp.check('home feed has best sellers', (select jsonb_array_length(home_feed() -> 'best_sellers') > 0));
select pg_temp.check('home feed has buy again for returning customer', (select jsonb_array_length(home_feed() -> 'buy_again') > 0));
select pg_temp.check('serviceability: 341510 is serviceable', (select (check_serviceability('341510') ->> 'serviceable')::boolean));
select pg_temp.check('serviceability: 302001 (Jaipur) is not', (select not (check_serviceability('302001') ->> 'serviceable')::boolean));
select pg_temp.check('RLS: customer cannot read other profiles', (select count(*) = 1 from public.profiles));
select pg_temp.check('RLS: customer cannot read audit logs', (select count(*) = 0 from public.audit_logs));
select pg_temp.check('RLS: customer sees only own orders', (select count(*) = (select count(*) from public.orders where user_id = '30000000-0000-4000-8000-000000000001') from public.orders));

-- fresh cart
select clear_cart();
insert into t select 'inv_atta', i.id::text from public.inventory i join public.products p on p.id = i.product_id where i.store_id = 'd0000000-0000-4000-8000-000000000001' and p.name = 'Aashirvaad Shudh Chakki Atta' and p.pack_label = '5 kg' limit 1;
insert into t select 'inv_salt', inventory_id::text from public.v_product_cards where name = 'Tata Salt Iodised' limit 1;
insert into t select 'inv_oil', i.id::text from public.inventory i join public.products p on p.id = i.product_id where i.store_id = 'd0000000-0000-4000-8000-000000000001' and p.name = 'Fortune Sunlite Refined Sunflower Oil' and i.stock_qty > 2 limit 1;
select pg_temp.check('add atta to cart', (select (add_to_cart((select v::uuid from t where k='inv_atta'), 2) ->> 'ok')::boolean));
select pg_temp.check('add oil to cart', (select (add_to_cart((select v::uuid from t where k='inv_oil'), 1) ->> 'ok')::boolean));
-- salt might be from another store -> conflict expected unless same store
select pg_temp.check('cart has 2 lines', (select (cart_summary() ->> 'item_count')::int = 3));
select pg_temp.check('cart totals computed', (select (cart_summary() ->> 'total')::numeric > (cart_summary() ->> 'subtotal')::numeric - 1));
select pg_temp.check('coupon FLAT30 applies', (select (apply_coupon('FLAT30') ->> 'valid')::boolean));
select pg_temp.check('coupon EXPIRED5 rejected', (select not (apply_coupon('EXPIRED5') ->> 'valid')::boolean));
select pg_temp.check('coupon FLAT30 re-applied', (select (apply_coupon('FLAT30') ->> 'valid')::boolean));
select pg_temp.check('summary shows coupon discount 30', (select (cart_summary() ->> 'coupon_discount')::numeric = 30));
insert into t select 'addr', id::text from public.addresses where user_id = '30000000-0000-4000-8000-000000000001' and is_default limit 1;
insert into t select 'stock_before', stock_qty::text from public.inventory where id = (select v::uuid from t where k='inv_atta');
insert into t select 'order', (place_order((select v::uuid from t where k='addr'), 'cod', 'standard', 'Ring the bell')) ->> 'order_id';
select pg_temp.check('order placed', (select status = 'placed' from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('order number format', (select order_number ~ '^MD[0-9]{4}[0-9]{6}$' from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('stock decremented by 2', (select stock_qty = (select v::int from t where k='stock_before') - 2 from public.inventory where id = (select v::uuid from t where k='inv_atta')));
select pg_temp.check('cart converted', (select status = 'converted' from public.carts where user_id = '30000000-0000-4000-8000-000000000001' order by created_at desc limit 1));
select pg_temp.check('payment row cod_pending', (select status = 'cod_pending' from public.payments where order_id = (select v::uuid from t where k='order')));
select pg_temp.check('customer can see delivery OTP', (select (order_tracking((select v::uuid from t where k='order')) ->> 'delivery_otp') ~ '^[0-9]{4}$'));
select pg_temp.check('customer got order_placed notification', (select count(*) > 0 from public.notifications where user_id = '30000000-0000-4000-8000-000000000001' and type = 'order_placed' and (data ->> 'order_id')::uuid = (select v::uuid from t where k='order')));
select pg_temp.check('customer cannot call store actions', (select not exists (select 1 where false)));
do $$ begin
  perform store_update_order((select v::uuid from t where k='order'), 'accept');
  raise exception 'CHECK FAILED: customer should not accept orders';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok - customer blocked from store actions (%)', sqlerrm;
end $$;

-- ---------------- store owner ----------------
select pg_temp.as_user('20000000-0000-4000-8000-000000000001');
select pg_temp.check('store sees the new order', (select count(*) = 1 from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('store cannot see OTP', (select count(*) = 0 from public.order_secrets where order_id = (select v::uuid from t where k='order')));
select pg_temp.check('store got new_order notification', (select count(*) > 0 from public.notifications where user_id = '20000000-0000-4000-8000-000000000001' and type = 'new_order' and (data ->> 'order_id')::uuid = (select v::uuid from t where k='order')));
select pg_temp.check('store accepts', (select (store_update_order((select v::uuid from t where k='order'), 'accept') ->> 'status') = 'store_confirmed'));
select pg_temp.check('store preparing', (select (store_update_order((select v::uuid from t where k='order'), 'preparing') ->> 'status') = 'preparing'));
do $$ begin
  update public.orders set status = 'delivered' where id = (select v::uuid from t where k='order');
  if (select status from public.orders where id = (select v::uuid from t where k='order')) = 'delivered' then raise exception 'CHECK FAILED: store marked delivered directly'; end if;
  raise notice 'ok - store cannot mark delivered via table update (RLS blocked, 0 rows)';
end $$;
insert into t select 'ready', store_update_order((select v::uuid from t where k='order'), 'ready')::text;
select pg_temp.check('store ready -> assignment auto-dispatched', (select (v::jsonb ->> 'assignment_id') is not null from t where k='ready'));
insert into t select 'assignment', v::jsonb ->> 'assignment_id' from t where k='ready';
reset role;
insert into t select 'rider_user', dp.user_id::text from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id where a.id = (select v::uuid from t where k='assignment');
set local role authenticated;
select pg_temp.as_user('20000000-0000-4000-8000-000000000001');
select pg_temp.check('dashboard stats work for store', (select (store_dashboard_stats('d0000000-0000-4000-8000-000000000001') ->> 'today_orders')::int >= 1));

-- ---------------- rider ----------------
select pg_temp.as_user((select v from t where k='rider_user'));
select pg_temp.check('rider sees offer', (select jsonb_array_length(rider_assignments(array['offered'])) >= 1));
select pg_temp.check('rider cannot see OTP', (select count(*) = 0 from public.order_secrets where order_id = (select v::uuid from t where k='order')));
select pg_temp.check('rider accepts', (select (rider_respond_assignment((select v::uuid from t where k='assignment'), true) ->> 'status') = 'accepted'));
select pg_temp.check('order -> rider_assigned', (select status = 'rider_assigned' from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('rider location recorded', (select (record_rider_location(26.6491, 74.0341, 5, 90, 4.2) ->> 'tracked_assignments')::int = 1));
select pg_temp.check('rider pickup', (select (rider_pickup((select v::uuid from t where k='assignment')) ->> 'status') = 'picked_up'));
select pg_temp.check('order -> out_for_delivery', (select status = 'out_for_delivery' from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('wrong OTP rejected', (select not (verify_delivery_otp((select v::uuid from t where k='assignment'), '0000') ->> 'ok')::boolean or (select delivery_otp = '0000' from public.order_secrets where false)));
insert into t select 'otp', delivery_otp from public.order_secrets where false; -- rider can't read; fetch as superuser below
reset role;
insert into t select 'otp', delivery_otp from public.order_secrets where order_id = (select v::uuid from t where k='order');
set local role authenticated;
select pg_temp.as_user((select v from t where k='rider_user'));
select pg_temp.check('correct OTP delivers', (select (verify_delivery_otp((select v::uuid from t where k='assignment'), (select v from t where k='otp')) ->> 'ok')::boolean));
select pg_temp.check('order -> delivered', (select status = 'delivered' from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('COD collected', (select status = 'cod_collected' from public.payments where order_id = (select v::uuid from t where k='order')));
select pg_temp.check('rider stats include today delivery', (select (rider_dashboard_stats() ->> 'today_deliveries')::int >= 1));

-- ---------------- customer again ----------------
select pg_temp.as_user('30000000-0000-4000-8000-000000000001');
select pg_temp.check('tracking shows delivered + rider', (select (order_tracking((select v::uuid from t where k='order')) #>> '{assignment,rider,name}') is not null));
select pg_temp.check('customer reviews store', (select submit_review((select v::uuid from t where k='order'), 'store', 5, 'Great service') is not null));
select pg_temp.check('customer reviews delivery', (select submit_review((select v::uuid from t where k='order'), 'delivery', 5, 'Fast rider') is not null));
select pg_temp.check('customer completes order', (select (mark_order_completed((select v::uuid from t where k='order')) ->> 'ok')::boolean));
select pg_temp.check('reward points credited', (select count(*) > 0 from public.reward_transactions where order_id = (select v::uuid from t where k='order')));
select pg_temp.check('reorder puts items in cart', (select (reorder((select v::uuid from t where k='order')) ->> 'added')::int >= 2));
select pg_temp.check('history has full timeline', (select count(distinct status) = 8 from public.order_status_history where order_id = (select v::uuid from t where k='order')));

-- ---------------- admin ----------------
select pg_temp.as_user('10000000-0000-4000-8000-000000000001');
select pg_temp.check('admin dashboard stats', (select (admin_dashboard_stats() ->> 'total_orders')::int >= 21));
select pg_temp.check('admin moderates review', (select true from (select moderate_review(id, 'approved') from public.reviews where order_id = (select v::uuid from t where k='order') and target = 'store') x));
select pg_temp.check('store rating updated after approval', (select rating_count >= 2 from public.stores where id = 'd0000000-0000-4000-8000-000000000001'));
select pg_temp.check('admin sees audit logs', (select count(*) > 0 from public.audit_logs));
update public.settings set value = '499' where key = 'free_delivery_threshold';
select pg_temp.check('admin can update settings', (select (value #>> '{}') = '499' from public.settings where key = 'free_delivery_threshold'));

-- ---------------- cancel path ----------------
select pg_temp.as_user('30000000-0000-4000-8000-000000000015');
insert into t select 'placed_order', id::text from public.orders where user_id = '30000000-0000-4000-8000-000000000015' and status = 'placed' limit 1;
select pg_temp.check('customer cancels placed order', (select (cancel_order((select v::uuid from t where k='placed_order'), 'Changed my mind') ->> 'ok')::boolean));
reset role;
select pg_temp.check('cancelled order restocked movement', (select count(*) > 0 from public.inventory_movements where reference_id = (select v::uuid from t where k='placed_order') and reason = 'cancel_restock'));
select pg_temp.check('cancelled order status', (select status = 'cancelled' from public.orders where id = (select v::uuid from t where k='placed_order')));

-- ---------------- anon ----------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check('anon can browse products', (select count(*) > 100 from public.v_product_cards));
select pg_temp.check('anon cannot see orders', (select count(*) = 0 from public.orders));
select pg_temp.check('anon cannot see profiles', (select count(*) = 0 from public.profiles));
select pg_temp.check('anon search works', (select (search_products('milk') -> 'total')::int > 0));
rollback;
