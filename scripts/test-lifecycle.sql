-- End-to-end order lifecycle test executed as real users (JWT claims) against the local DB.
-- customer -> search -> cart -> coupon -> place order (COD) -> auto-confirmed -> packed by admin
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
-- 0031: listing payloads carry card fields only; the product page is one round trip.
select pg_temp.check('search items omit tags/created_at and carry at most one image', (select bool_and(not (e ? 'tags') and not (e ? 'created_at') and jsonb_array_length(e -> 'images') <= 1 and (e ? 'selling_price') and (e ? 'inventory_id')) from jsonb_array_elements(search_products(p_category_slug => 'grocery') -> 'items') e));
select pg_temp.check('search paging: pages 1 and 2 never overlap', (select not exists (select 1 from jsonb_array_elements(search_products(p_category_slug => 'grocery', p_page => 1, p_page_size => 5) -> 'items') a join jsonb_array_elements(search_products(p_category_slug => 'grocery', p_page => 2, p_page_size => 5) -> 'items' ) b on a ->> 'id' = b ->> 'id')));
select pg_temp.check('product_detail carries more_from_brand and seller fields', (select (d ? 'more_from_brand') and (d ? 'shelf_life') and (d ? 'seller_name') and jsonb_typeof(d -> 'more_from_brand') = 'array' from (select product_detail((select slug from public.products where is_active and brand_id is not null limit 1)) d) x));
select pg_temp.check('product_detail more_from_brand is same brand, in stock, not itself', (select bool_and((e ->> 'brand_id') = (d ->> 'brand_id') and (e ->> 'id') <> (d ->> 'id') and (e ->> 'stock_status') <> 'out_of_stock') from (select product_detail((select slug from public.products where is_active and brand_id is not null limit 1)) d) x, jsonb_array_elements(x.d -> 'more_from_brand') e));
select pg_temp.check('home feed has best sellers', (select jsonb_array_length(home_feed() -> 'best_sellers') > 0));
select pg_temp.check('home feed has buy again for returning customer', (select jsonb_array_length(home_feed() -> 'buy_again') > 0));
select pg_temp.check('serviceability: 341510 is serviceable', (select (check_serviceability('341510') ->> 'serviceable')::boolean));
select pg_temp.check('serviceability: 302001 (Jaipur) is not', (select not (check_serviceability('302001') ->> 'serviceable')::boolean));
select pg_temp.check('RLS: customer cannot read other profiles', (select count(*) = 1 from public.profiles));
select pg_temp.check('RLS: customer cannot read audit logs', (select count(*) = 0 from public.audit_logs));
select pg_temp.check('RLS: customer sees only own orders', (select count(*) = (select count(*) from public.orders where user_id = '30000000-0000-4000-8000-000000000001') from public.orders));

-- fresh cart
select clear_cart();
insert into t select 'inv_atta', i.id::text from public.inventory i join public.products p on p.id = i.product_id where p.name = 'Aashirvaad Shudh Chakki Atta' and p.pack_label = '5 kg' limit 1;
insert into t select 'inv_salt', inventory_id::text from public.v_product_cards where name = 'Tata Salt Iodised' limit 1;
insert into t select 'inv_oil', i.id::text from public.inventory i join public.products p on p.id = i.product_id where p.name = 'Fortune Sunlite Refined Sunflower Oil' and i.stock_qty > 2 limit 1;
select pg_temp.check('add atta to cart', (select (add_to_cart((select v::uuid from t where k='inv_atta'), 2) ->> 'ok')::boolean));
select pg_temp.check('add oil to cart', (select (add_to_cart((select v::uuid from t where k='inv_oil'), 1) ->> 'ok')::boolean));
select pg_temp.check('cart has 2 lines', (select (cart_summary() ->> 'item_count')::int = 3));
select pg_temp.check('cart totals computed', (select (cart_summary() ->> 'total')::numeric > (cart_summary() ->> 'subtotal')::numeric - 1));
select pg_temp.check('coupon FLAT30 applies', (select (apply_coupon('FLAT30') ->> 'valid')::boolean));
select pg_temp.check('coupon EXPIRED5 rejected', (select not (apply_coupon('EXPIRED5') ->> 'valid')::boolean));
select pg_temp.check('coupon FLAT30 re-applied', (select (apply_coupon('FLAT30') ->> 'valid')::boolean));
select pg_temp.check('summary shows coupon discount 30', (select (cart_summary() ->> 'coupon_discount')::numeric = 30));
insert into t select 'addr', id::text from public.addresses where user_id = '30000000-0000-4000-8000-000000000001' and is_default limit 1;
insert into t select 'stock_before', stock_qty::text from public.inventory where id = (select v::uuid from t where k='inv_atta');
insert into t select 'order', (place_order((select v::uuid from t where k='addr'), 'cod', 'standard', 'Ring the bell')) ->> 'order_id';
select pg_temp.check('COD order confirmed automatically (quick commerce)', (select status = 'confirmed' and confirmed_at is not null from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('history: placed then auto-confirmed', (select array_agg(status::text order by created_at, status) = array['placed','confirmed'] from public.order_status_history where order_id = (select v::uuid from t where k='order')));
select pg_temp.check('ETA is the zone window shown at checkout', (select o.eta_minutes = z.eta_max_minutes from public.orders o join public.delivery_zones z on z.id = o.zone_id where o.id = (select v::uuid from t where k='order')));
select pg_temp.check('order number format', (select order_number ~ '^MD[0-9]{4}[0-9]{6}$' from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('stock decremented by 2', (select stock_qty = (select v::int from t where k='stock_before') - 2 from public.inventory where id = (select v::uuid from t where k='inv_atta')));
select pg_temp.check('cart converted', (select status = 'converted' from public.carts where user_id = '30000000-0000-4000-8000-000000000001' order by created_at desc limit 1));
select pg_temp.check('payment row cod_pending', (select status = 'cod_pending' from public.payments where order_id = (select v::uuid from t where k='order')));
select pg_temp.check('OTP hidden until out for delivery', (select (order_tracking((select v::uuid from t where k='order')) ->> 'delivery_otp') is null));
select pg_temp.check('order_placed notification carries no OTP', (select bool_and(body not like '%Delivery OTP:%') from public.notifications where user_id = '30000000-0000-4000-8000-000000000001' and type = 'order_placed'));
select pg_temp.check('customer got order_placed notification', (select count(*) > 0 from public.notifications where user_id = '30000000-0000-4000-8000-000000000001' and type = 'order_placed' and (data ->> 'order_id')::uuid = (select v::uuid from t where k='order')));
do $$ begin
  perform fulfil_order((select v::uuid from t where k='order'), 'ready');
  raise exception 'CHECK FAILED: customer should not pack orders';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok - customer blocked from packing actions (%)', sqlerrm;
end $$;
do $$ begin
  update public.orders set status = 'delivered' where id = (select v::uuid from t where k='order');
  if (select status from public.orders where id = (select v::uuid from t where k='order')) = 'delivered' then raise exception 'CHECK FAILED: customer marked delivered directly'; end if;
  raise notice 'ok - customer cannot mark delivered via table update (RLS blocked, 0 rows)';
end $$;

-- ---------------- packing (admin) ----------------
select pg_temp.as_user('10000000-0000-4000-8000-000000000001');
select pg_temp.check('admin sees the new order', (select count(*) = 1 from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('admin got new_order notification', (select count(*) > 0 from public.notifications where user_id = '10000000-0000-4000-8000-000000000001' and type = 'new_order' and (data ->> 'order_id')::uuid = (select v::uuid from t where k='order')));
select pg_temp.check('notification asks to pack, not accept', (select bool_and(body like '%Pack it and tap%') from public.notifications where user_id = '10000000-0000-4000-8000-000000000001' and type = 'new_order' and (data ->> 'order_id')::uuid = (select v::uuid from t where k='order')));
select pg_temp.check('admin marks packing', (select (fulfil_order((select v::uuid from t where k='order'), 'preparing') ->> 'status') = 'preparing'));
insert into t select 'ready', fulfil_order((select v::uuid from t where k='order'), 'ready')::text;
select pg_temp.check('packed -> rider requested automatically', (select (v::jsonb ->> 'assignment_id') is not null from t where k='ready'));
insert into t select 'assignment', v::jsonb ->> 'assignment_id' from t where k='ready';
reset role;
insert into t select 'rider_user', dp.user_id::text from public.delivery_assignments a join public.delivery_partners dp on dp.id = a.rider_id where a.id = (select v::uuid from t where k='assignment');
set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-8000-000000000001');
select pg_temp.check('admin dashboard counts today''s order', (select (admin_dashboard_stats() ->> 'today_orders')::int >= 1));

-- ---------------- rider ----------------
select pg_temp.as_user((select v from t where k='rider_user'));
select pg_temp.check('rider sees offer', (select jsonb_array_length(rider_assignments(array['offered'])) >= 1));
select pg_temp.check('rider cannot see OTP', (select not has_table_privilege('authenticated', 'public.order_secrets', 'select')));
select pg_temp.check('rider accepts', (select (rider_respond_assignment((select v::uuid from t where k='assignment'), true) ->> 'status') = 'accepted'));
select pg_temp.check('order -> rider_assigned', (select status = 'rider_assigned' from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('rider location recorded', (select (record_rider_location(26.6491, 74.0341, 5, 90, 4.2) ->> 'tracked_assignments')::int = 1));
select pg_temp.check('rider pickup', (select (rider_pickup((select v::uuid from t where k='assignment')) ->> 'status') = 'picked_up'));
select pg_temp.check('order -> out_for_delivery', (select status = 'out_for_delivery' from public.orders where id = (select v::uuid from t where k='order')));
-- 0059: no code is stored in plain text; the customer opens one on their own order screen.
select pg_temp.as_user('30000000-0000-4000-8000-000000000001');
insert into t select 'otp', customer_delivery_code((select v::uuid from t where k='order'), true) ->> 'code';
insert into t select 'wrong_otp', lpad(((v::int + 1) % 10000)::text, 4, '0') from t where k = 'otp';
select pg_temp.check('customer gets a delivery code on their own order screen, not with the tracking read', (select (select v from t where k='otp') ~ '^[0-9]{4}$' and (order_tracking((select v::uuid from t where k='order')) ->> 'delivery_otp') is null));
select pg_temp.as_user('10000000-0000-4000-8000-000000000001');
select pg_temp.check('admin does not receive the OTP', (select (order_tracking((select v::uuid from t where k='order')) ->> 'delivery_otp') is null));
select pg_temp.as_user((select v from t where k='rider_user'));
select pg_temp.check('COD needs cash confirmation first', (select (verify_delivery_otp((select v::uuid from t where k='assignment'), (select v from t where k='otp'), false) ->> 'needs_cash')::boolean));
select pg_temp.check('wrong OTP rejected, 4 attempts left (cash check used none)', (select (verify_delivery_otp((select v::uuid from t where k='assignment'), (select v from t where k='wrong_otp'), true) ->> 'attempts_left')::int = 4));
select pg_temp.check('order not delivered after wrong OTP', (select status = 'out_for_delivery' from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('correct OTP delivers', (select (verify_delivery_otp((select v::uuid from t where k='assignment'), (select v from t where k='otp'), true) ->> 'ok')::boolean));
select pg_temp.check('retry after delivery is idempotent', (select (verify_delivery_otp((select v::uuid from t where k='assignment'), (select v from t where k='otp'), true) ->> 'already')::boolean));
select pg_temp.check('earning recorded once, pending payout', (select count(*) = 1 and bool_and(status = 'pending') from public.rider_earnings where assignment_id = (select v::uuid from t where k='assignment')));
do $$ begin
  perform admin_create_rider_payout((select rider_id from public.delivery_assignments where id = (select v::uuid from t where k='assignment')));
  raise exception 'CHECK FAILED: rider should not create payouts';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok - rider blocked from payouts (%)', sqlerrm;
end $$;
select pg_temp.check('order -> delivered', (select status = 'delivered' from public.orders where id = (select v::uuid from t where k='order')));
select pg_temp.check('COD collected', (select status = 'cod_collected' from public.payments where order_id = (select v::uuid from t where k='order')));
select pg_temp.check('rider stats include today delivery', (select (rider_dashboard_stats() ->> 'today_deliveries')::int >= 1));

-- ---------------- customer again ----------------
select pg_temp.as_user('30000000-0000-4000-8000-000000000001');
select pg_temp.check('tracking shows delivered + rider', (select (order_tracking((select v::uuid from t where k='order')) #>> '{assignment,rider,name}') is not null));
select pg_temp.check('customer reviews a product', (select submit_review((select v::uuid from t where k='order'), 'product', 5, 'Great atta', (select product_id from public.order_items where order_id = (select v::uuid from t where k='order') limit 1)) is not null));
select pg_temp.check('customer reviews delivery', (select submit_review((select v::uuid from t where k='order'), 'delivery', 5, 'Fast rider') is not null));
select pg_temp.check('customer completes order', (select (mark_order_completed((select v::uuid from t where k='order')) ->> 'ok')::boolean));
select pg_temp.check('reward points credited', (select count(*) > 0 from public.reward_transactions where order_id = (select v::uuid from t where k='order')));
select pg_temp.check('reorder puts items in cart', (select (reorder((select v::uuid from t where k='order')) ->> 'added')::int >= 2));
select pg_temp.check('history has full timeline', (select count(distinct status) = 8 from public.order_status_history where order_id = (select v::uuid from t where k='order')));

-- ---------------- admin ----------------
select pg_temp.as_user('10000000-0000-4000-8000-000000000001');
select pg_temp.check('admin dashboard stats', (select (admin_dashboard_stats() ->> 'total_orders')::int >= 21));
select pg_temp.check('admin moderates review', (select true from (select moderate_review(id, 'approved') from public.reviews where order_id = (select v::uuid from t where k='order') and target = 'delivery') x));
select pg_temp.check('rider rating updated after approval', (select rating_count >= 1 from public.delivery_partners where id = (select rider_id from public.delivery_assignments where id = (select v::uuid from t where k='assignment'))));
select pg_temp.check('admin sees audit logs', (select count(*) > 0 from public.audit_logs));
insert into t select 'rider_id', rider_id::text from public.delivery_assignments where id = (select v::uuid from t where k='assignment');
select pg_temp.check('admin sees rider balance', (select bool_or((r ->> 'payable')::numeric > 0) from jsonb_array_elements(admin_rider_balances()) r where r ->> 'rider_id' = (select v from t where k='rider_id')));
insert into t select 'payout1', (admin_create_rider_payout((select v::uuid from t where k='rider_id'), 'weekly') ->> 'payout_id');
select pg_temp.check('payout processing, earning processing', (select p.status = 'processing' and e.status = 'processing' from public.rider_payouts p join public.rider_earnings e on e.payout_id = p.id where p.id = (select v::uuid from t where k='payout1') limit 1));
do $$ begin
  perform admin_create_rider_payout((select v::uuid from t where k='rider_id'));
  raise exception 'CHECK FAILED: second payout must find nothing to pay';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok - no double payout (%)', sqlerrm;
end $$;
select pg_temp.check('payout marked failed', (select (admin_settle_rider_payout((select v::uuid from t where k='payout1'), 'failed', null, 'UPI ID rejected') ->> 'status') = 'failed'));
select pg_temp.check('failed earning payable again', (select bool_and(status = 'failed' and payout_id is null) from public.rider_earnings where assignment_id = (select v::uuid from t where k='assignment')));
insert into t select 'payout2', (admin_create_rider_payout((select v::uuid from t where k='rider_id')) ->> 'payout_id');
do $$ begin
  perform admin_settle_rider_payout((select v::uuid from t where k='payout2'), 'paid', null);
  raise exception 'CHECK FAILED: paid needs a reference';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok - reference required (%)', sqlerrm;
end $$;
select pg_temp.check('retried payout paid', (select (admin_settle_rider_payout((select v::uuid from t where k='payout2'), 'paid', 'UTR4455667788') ->> 'status') = 'paid'));
select pg_temp.check('earning paid', (select bool_and(status = 'paid') from public.rider_earnings where assignment_id = (select v::uuid from t where k='assignment')));
select pg_temp.check('settling paid twice is a no-op', (select (admin_settle_rider_payout((select v::uuid from t where k='payout2'), 'paid', 'UTR4455667788') ->> 'already')::boolean));
do $$ begin
  perform admin_settle_rider_payout((select v::uuid from t where k='payout2'), 'failed', null, 'oops');
  raise exception 'CHECK FAILED: a paid payout must not change';
exception when others then
  if sqlerrm like 'CHECK FAILED%' then raise; end if;
  raise notice 'ok - paid payout locked (%)', sqlerrm;
end $$;
select pg_temp.check('payout actions audited', (select count(*) >= 4 from public.audit_logs where action like 'rider_payout.%'));
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
