-- ============================================================================
-- MERTA DEAL — Demo seed (realistic Indian kirana catalogue, Merta City geography)
-- Demo password for every seeded account: Merta@123
-- ============================================================================
set client_min_messages = warning;

-- ---------------------------------------------------------------- SETTINGS --
insert into public.settings (key, value, "group", label, description, is_public) values
('brand_name', '"Merta Deal"', 'general', 'Brand name', 'Displayed across the apps', true),
('brand_tagline', '"Merta Ki Shopping, Ab Online."', 'general', 'Tagline', null, true),
('support_phone', '"+91 98290 12345"', 'general', 'Support phone', null, true),
('support_email', '"help@mertadeal.in"', 'general', 'Support email', null, true),
('support_whatsapp', '"+919829012345"', 'general', 'Support WhatsApp number', null, true),
('platform_fee', '2', 'fees', 'Platform fee (₹ per order)', null, true),
('tax_rate_percent', '18', 'fees', 'GST on fees (%)', 'GST applied on delivery + platform fees (grocery MRP is tax-inclusive)', true),
('delivery_fee_base', '25', 'delivery', 'Base delivery fee (₹)', 'Fallback when a zone has no fee configured', true),
('delivery_included_km', '3', 'delivery', 'Distance included in base fee (km)', null, true),
('delivery_fee_per_extra_km', '8', 'delivery', 'Fee per extra km (₹)', null, true),
('free_delivery_threshold', '499', 'delivery', 'Free delivery above (₹)', 'Fallback when a zone has no threshold', true),
('min_order_amount', '99', 'delivery', 'Minimum order amount (₹)', 'Fallback when a zone has no minimum', true),
('delivery_eta_min_minutes', '30', 'delivery', 'Standard ETA min (minutes)', null, true),
('delivery_eta_max_minutes', '60', 'delivery', 'Standard ETA max (minutes)', null, true),
('express_delivery_fee', '20', 'delivery', 'Express surcharge (₹)', null, true),
('express_eta_min_minutes', '20', 'delivery', 'Express ETA min (minutes)', null, true),
('express_eta_max_minutes', '35', 'delivery', 'Express ETA max (minutes)', null, true),
('scheduled_slots', '["09:00-11:00","11:00-13:00","15:00-17:00","17:00-19:00","19:00-21:00"]', 'delivery', 'Scheduled delivery slots', null, true),
('dispatch_radius_km', '8', 'delivery', 'Auto-dispatch search radius (km)', null, false),
('dispatch_offer_timeout_seconds', '180', 'delivery', 'Rider offer timeout (seconds)', null, false),
('rider_base_earning', '20', 'delivery', 'Rider base earning per delivery (₹)', null, false),
('rider_per_km_earning', '5', 'delivery', 'Rider earning per km (₹)', null, false),
('otp_max_attempts', '5', 'orders', 'Max delivery OTP attempts', null, false),
('cod_enabled', 'true', 'payments', 'Cash on Delivery enabled', null, true),
('online_payments_enabled', 'true', 'payments', 'Online payments (Razorpay) enabled', 'Also requires Razorpay keys in environment', true),
('reward_points_per_100', '1', 'rewards', 'Reward points per ₹100', null, true),
('plus_membership_enabled', 'false', 'business', 'Merta Deal Plus subscription', 'Future: free delivery membership', true),
('plus_membership_price', '99', 'business', 'Plus monthly price (₹)', null, true),
('business_open', 'true', 'business', 'Accepting orders', 'Switch off to stop taking new orders (scheduled orders still queue up).', true),
('business_hours', '{"open":"06:00","close":"23:00"}', 'business', 'Business hours', 'Orders are accepted between these times (IST).', true),
('pickup_point', '{"name":"Merta Deal","phone":"8875020202","address_line1":"Gandhi Chowk","area":"Merta Central","pincode":"341510","lat":26.6478,"lng":74.0322,"city_id":"a0000000-0000-4000-8000-000000000001"}', 'business', 'Pickup point', 'Where riders collect orders: name, phone, address, area, pincode, lat, lng, city_id.', false)
on conflict (key) do update set value = excluded.value, "group" = excluded."group", label = excluded.label, description = excluded.description, is_public = excluded.is_public;

-- ------------------------------------------------------------------ CITIES --
insert into public.cities (id, name, slug, state, center_lat, center_lng, is_active, launch_note) values
('a0000000-0000-4000-8000-000000000001', 'Merta City', 'merta-city', 'Rajasthan', 26.6486, 74.0334, true, null),
('a0000000-0000-4000-8000-000000000002', 'Nagaur', 'nagaur', 'Rajasthan', 27.2020, 73.7339, false, 'Launching soon'),
('a0000000-0000-4000-8000-000000000003', 'Jodhpur', 'jodhpur', 'Rajasthan', 26.2389, 73.0243, false, 'Coming 2027'),
('a0000000-0000-4000-8000-000000000004', 'Ajmer', 'ajmer', 'Rajasthan', 26.4499, 74.6399, false, 'Coming 2027'),
('a0000000-0000-4000-8000-000000000005', 'Pali', 'pali', 'Rajasthan', 25.7711, 73.3234, false, 'Coming 2027'),
('a0000000-0000-4000-8000-000000000006', 'Jaipur', 'jaipur', 'Rajasthan', 26.9124, 75.7873, false, 'Coming 2027');

insert into public.delivery_zones (id, city_id, name, area, pincode, center_lat, center_lng, radius_km, delivery_fee, min_order_amount, free_delivery_threshold, eta_min_minutes, eta_max_minutes, express_supported) values
('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Merta Central', 'Sadar Bazaar, Gandhi Chowk, Ghanti Ghar', '341510', 26.6486, 74.0334, 3.0, 19, 99, 399, 25, 45, true),
('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Station Road', 'Station Road, Railway Colony, Bus Stand', '341510', 26.6420, 74.0250, 3.0, 25, 99, 499, 30, 55, true),
('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Nagaur Road', 'Nagaur Road, Housing Board, Indira Colony', '341510', 26.6600, 74.0300, 3.5, 25, 149, 499, 35, 60, true),
('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Jodhpur Road', 'Jodhpur Road, Kumhari Mohalla, Bhagat Singh Colony', '341510', 26.6400, 74.0420, 3.5, 29, 149, 599, 35, 60, false),
('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Merta Road (Phalodi Junction)', 'Merta Road, Dangawas Road, Ren Road', '341511', 26.6900, 74.0000, 5.0, 39, 199, 699, 45, 75, false);

-- ------------------------------------------------------------ SYNONYMS ------
insert into public.search_synonyms (term, canonical) values
('aata','atta'),('ata','atta'),('flour','atta'),('gehu','atta'),('wheat','atta'),('chakki','atta'),
('chini','sugar'),('shakkar','sugar'),('cheeni','sugar'),
('lalmirch','chilli'),('lal','chilli'),('mirch','chilli'),('mirchi','chilli'),('chili','chilli'),('chilly','chilli'),('redchilli','chilli'),
('haldi','turmeric'),('haldee','turmeric'),
('dhaniya','coriander'),('dhania','coriander'),
('jeera','cumin'),('zeera','cumin'),
('namak','salt'),
('tel','oil'),('tail','oil'),('ghee','ghee'),
('doodh','milk'),('dudh','milk'),
('dahi','curd'),('yogurt','curd'),('yoghurt','curd'),
('chawal','rice'),('chaval','rice'),('basmati','rice'),
('daal','dal'),('dhal','dal'),('pulses','dal'),('lentil','dal'),('lentils','dal'),
('moong','moong'),('mung','moong'),
('chana','chana'),('chole','chana'),('kabuli','chana'),
('rajma','rajma'),('kidney','rajma'),
('besan','besan'),('gram','besan'),
('makhan','butter'),('maska','butter'),
('paneer','paneer'),('cottage','paneer'),
('biscuit','biscuits'),('biskut','biscuits'),('cookies','biscuits'),
('chai','tea'),('patti','tea'),
('pani','water'),('paani','water'),('bottle','water'),
('sabun','soap'),('saabun','soap'),
('surf','detergent'),('washing','detergent'),('powder','detergent'),
('toothpaste','toothpaste'),('manjan','toothpaste'),
('shampoo','shampoo'),('shampu','shampoo'),
('bhujia','namkeen'),('mixture','namkeen'),('sev','namkeen'),
('kaju','cashew'),('badam','almond'),('kishmish','raisins'),
('nimbu','lemon'),('pyaz','onion'),('pyaaz','onion'),('aloo','potato'),('alu','potato'),('tamatar','tomato'),('tamater','tomato'),
('sabzi','vegetables'),('sabji','vegetables'),('veggies','vegetables'),
('phal','fruits'),('fal','fruits'),
('diaper','diapers'),('nappy','diapers'),
('papad','papad'),('papadum','papad'),
('masala','spices'),('masale','spices'),
('coke','coca-cola'),('pepsi','pepsi'),('thums','thums-up'),
('maggie','maggi'),('noodles','maggi');

-- --------------------------------------------------------------- CATEGORIES -
insert into public.categories (id, parent_id, name, slug, icon, color, sort_order, is_featured) values
('c0000000-0000-4000-8000-000000000001', null, 'Grocery', 'grocery', 'wheat', '#E8F3EC', 1, true),
('c0000000-0000-4000-8000-000000000002', null, 'Masala & Spices', 'masala-spices', 'flame', '#FDECE4', 2, true),
('c0000000-0000-4000-8000-000000000003', null, 'Dairy', 'dairy', 'milk', '#EAF2FB', 3, true),
('c0000000-0000-4000-8000-000000000004', null, 'Snacks', 'snacks', 'cookie', '#FFF4DB', 4, true),
('c0000000-0000-4000-8000-000000000005', null, 'Beverages', 'beverages', 'cup-soda', '#E6F4F6', 5, true),
('c0000000-0000-4000-8000-000000000006', null, 'Personal Care', 'personal-care', 'sparkles', '#F4E9F7', 6, false),
('c0000000-0000-4000-8000-000000000007', null, 'Household', 'household', 'spray-can', '#EAF0F7', 7, false),
('c0000000-0000-4000-8000-000000000008', null, 'Fruits & Vegetables', 'fruits-vegetables', 'leafy-green', '#E3F5E1', 8, true),
('c0000000-0000-4000-8000-000000000009', null, 'Baby Care', 'baby-care', 'baby', '#FBEAF0', 9, false),
('c0000000-0000-4000-8000-000000000010', null, 'Beauty & Lifestyle', 'beauty-lifestyle', 'heart', '#FCE9EE', 10, false),
('c0000000-0000-4000-8000-000000000011', null, 'Home & Kitchen', 'home-kitchen', 'cooking-pot', '#F0EDE6', 11, false),
('c0000000-0000-4000-8000-000000000012', null, 'Local Products', 'local-products', 'map-pin', '#FFF0DC', 12, true);

insert into public.categories (parent_id, name, slug, icon, sort_order) values
('c0000000-0000-4000-8000-000000000001', 'Atta', 'atta', 'wheat', 1),
('c0000000-0000-4000-8000-000000000001', 'Rice', 'rice', 'grip', 2),
('c0000000-0000-4000-8000-000000000001', 'Dal', 'dal', 'circle-dot', 3),
('c0000000-0000-4000-8000-000000000001', 'Pulses', 'pulses', 'bean', 4),
('c0000000-0000-4000-8000-000000000001', 'Sugar', 'sugar', 'candy', 5),
('c0000000-0000-4000-8000-000000000001', 'Salt', 'salt', 'shaker', 6),
('c0000000-0000-4000-8000-000000000001', 'Oil & Ghee', 'oil', 'droplet', 7),
('c0000000-0000-4000-8000-000000000001', 'Flour & Besan', 'flour', 'wheat', 8),
('c0000000-0000-4000-8000-000000000002', 'Turmeric', 'turmeric', 'flame', 1),
('c0000000-0000-4000-8000-000000000002', 'Red Chilli', 'red-chilli', 'flame', 2),
('c0000000-0000-4000-8000-000000000002', 'Coriander', 'coriander', 'leaf', 3),
('c0000000-0000-4000-8000-000000000002', 'Cumin', 'cumin', 'circle-dot', 4),
('c0000000-0000-4000-8000-000000000002', 'Garam Masala', 'garam-masala', 'flame', 5),
('c0000000-0000-4000-8000-000000000002', 'Whole Spices', 'whole-spices', 'sprout', 6),
('c0000000-0000-4000-8000-000000000003', 'Milk', 'milk', 'milk', 1),
('c0000000-0000-4000-8000-000000000003', 'Curd', 'curd', 'circle', 2),
('c0000000-0000-4000-8000-000000000003', 'Paneer', 'paneer', 'square', 3),
('c0000000-0000-4000-8000-000000000003', 'Butter', 'butter', 'square', 4),
('c0000000-0000-4000-8000-000000000003', 'Cheese', 'cheese', 'triangle', 5),
('c0000000-0000-4000-8000-000000000004', 'Biscuits', 'biscuits', 'cookie', 1),
('c0000000-0000-4000-8000-000000000004', 'Chips', 'chips', 'circle', 2),
('c0000000-0000-4000-8000-000000000004', 'Namkeen', 'namkeen', 'circle', 3),
('c0000000-0000-4000-8000-000000000004', 'Chocolates', 'chocolates', 'candy', 4),
('c0000000-0000-4000-8000-000000000004', 'Dry Fruits', 'dry-fruits', 'nut', 5),
('c0000000-0000-4000-8000-000000000005', 'Water', 'water', 'droplet', 1),
('c0000000-0000-4000-8000-000000000005', 'Tea', 'tea', 'coffee', 2),
('c0000000-0000-4000-8000-000000000005', 'Coffee', 'coffee', 'coffee', 3),
('c0000000-0000-4000-8000-000000000005', 'Juice', 'juice', 'glass-water', 4),
('c0000000-0000-4000-8000-000000000005', 'Soft Drinks', 'soft-drinks', 'cup-soda', 5),
('c0000000-0000-4000-8000-000000000006', 'Bath & Body', 'bath-body', 'bath', 1),
('c0000000-0000-4000-8000-000000000006', 'Oral Care', 'oral-care', 'smile', 2),
('c0000000-0000-4000-8000-000000000006', 'Hair Care', 'hair-care', 'scissors', 3),
('c0000000-0000-4000-8000-000000000007', 'Laundry', 'laundry', 'shirt', 1),
('c0000000-0000-4000-8000-000000000007', 'Cleaning', 'cleaning', 'spray-can', 2),
('c0000000-0000-4000-8000-000000000008', 'Vegetables', 'vegetables', 'carrot', 1),
('c0000000-0000-4000-8000-000000000008', 'Fruits', 'fruits', 'apple', 2),
('c0000000-0000-4000-8000-000000000009', 'Diapers & Wipes', 'diapers', 'baby', 1),
('c0000000-0000-4000-8000-000000000009', 'Baby Food', 'baby-food', 'baby', 2),
('c0000000-0000-4000-8000-000000000011', 'Kitchen Essentials', 'kitchen-essentials', 'utensils', 1),
('c0000000-0000-4000-8000-000000000012', 'Rajasthani Specials', 'rajasthani-specials', 'map-pin', 1);

-- ------------------------------------------------------------------ BRANDS --
insert into public.brands (name, slug) values
('Aashirvaad','aashirvaad'),('Fortune','fortune'),('Tata','tata'),('Amul','amul'),('Parle','parle'),('Britannia','britannia'),
('Haldiram''s','haldirams'),('MDH','mdh'),('Everest','everest'),('Catch','catch'),('Maggi','maggi'),('Saffola','saffola'),
('Daawat','daawat'),('India Gate','india-gate'),('Red Label','red-label'),('Taj Mahal','taj-mahal'),('Nescafé','nescafe'),('Bru','bru'),
('Real','real'),('Frooti','frooti'),('Bisleri','bisleri'),('Kinley','kinley'),('Lay''s','lays'),('Kurkure','kurkure'),
('Cadbury','cadbury'),('Colgate','colgate'),('Dove','dove'),('Lifebuoy','lifebuoy'),('Surf Excel','surf-excel'),('Vim','vim'),
('Harpic','harpic'),('Pampers','pampers'),('Himalaya','himalaya'),('Dabur','dabur'),('Patanjali','patanjali'),('Bikaji','bikaji'),
('Bikano','bikano'),('Sunfeast','sunfeast'),('Coca-Cola','coca-cola'),('Thums Up','thums-up'),('Sprite','sprite'),('Pepsi','pepsi'),
('Nestlé','nestle'),('Mother Dairy','mother-dairy'),('Saras','saras'),('Rajdhani','rajdhani'),('Tata Sampann','tata-sampann'),
('Dhara','dhara'),('Gemini','gemini'),('Godrej','godrej'),('Nirma','nirma'),('Ghadi','ghadi'),('Clinic Plus','clinic-plus'),
('Pantene','pantene'),('Dettol','dettol'),('Santoor','santoor'),('Pears','pears'),('Closeup','closeup'),('Cerelac','cerelac'),
('Johnson''s','johnsons'),('MamyPoko','mamypoko'),('Uncle Chipps','uncle-chipps'),('Good Day','good-day'),('Oreo','oreo'),
('Merta Local','merta-local'),('Happilo','happilo'),('Mathania','mathania'),('Nagauri','nagauri'),('Fresh Farm','fresh-farm'),('Goodknight','goodknight'),
('Prestige','prestige'),('Milton','milton'),('Lakmé','lakme'),('Nivea','nivea'),('Gillette','gillette'),('Whisper','whisper');

-- ------------------------------------------------------------------ USERS ---
-- Deterministic ids: 1xx admins, 3xx customers, 4xx riders
drop table if exists seed_users; create temp table seed_users (id uuid, email text, phone text, full_name text, role text);
insert into seed_users values
('10000000-0000-4000-8000-000000000001', 'admin@mertadeal.in', '9829000001', 'Sameer Khan', 'super_admin'),
('10000000-0000-4000-8000-000000000002', 'ops@mertadeal.in', '9829000002', 'Priya Sharma', 'admin'),
('30000000-0000-4000-8000-000000000001', 'customer@mertadeal.in', '9876500001', 'Rahul Bishnoi', 'customer'),
('30000000-0000-4000-8000-000000000002', 'pooja.sharma@example.com', '9876500002', 'Pooja Sharma', 'customer'),
('30000000-0000-4000-8000-000000000003', 'amit.jangid@example.com', '9876500003', 'Amit Jangid', 'customer'),
('30000000-0000-4000-8000-000000000004', 'sunita.devi@example.com', '9876500004', 'Sunita Devi', 'customer'),
('30000000-0000-4000-8000-000000000005', 'mohit.parihar@example.com', '9876500005', 'Mohit Parihar', 'customer'),
('30000000-0000-4000-8000-000000000006', 'kavita.rathore@example.com', '9876500006', 'Kavita Rathore', 'customer'),
('30000000-0000-4000-8000-000000000007', 'dinesh.saini@example.com', '9876500007', 'Dinesh Saini', 'customer'),
('30000000-0000-4000-8000-000000000008', 'neha.jain@example.com', '9876500008', 'Neha Jain', 'customer'),
('30000000-0000-4000-8000-000000000009', 'irfan.khan@example.com', '9876500009', 'Irfan Khan', 'customer'),
('30000000-0000-4000-8000-000000000010', 'geeta.meena@example.com', '9876500010', 'Geeta Meena', 'customer'),
('30000000-0000-4000-8000-000000000011', 'vikram.singh@example.com', '9876500011', 'Vikram Singh', 'customer'),
('30000000-0000-4000-8000-000000000012', 'anjali.vyas@example.com', '9876500012', 'Anjali Vyas', 'customer'),
('30000000-0000-4000-8000-000000000013', 'ramesh.prajapat@example.com', '9876500013', 'Ramesh Prajapat', 'customer'),
('30000000-0000-4000-8000-000000000014', 'seema.kumawat@example.com', '9876500014', 'Seema Kumawat', 'customer'),
('30000000-0000-4000-8000-000000000015', 'lokesh.gehlot@example.com', '9876500015', 'Lokesh Gehlot', 'customer'),
('30000000-0000-4000-8000-000000000016', 'mamta.soni@example.com', '9876500016', 'Mamta Soni', 'customer'),
('30000000-0000-4000-8000-000000000017', 'sanjay.bhati@example.com', '9876500017', 'Sanjay Bhati', 'customer'),
('30000000-0000-4000-8000-000000000018', 'rekha.choudhary@example.com', '9876500018', 'Rekha Choudhary', 'customer'),
('30000000-0000-4000-8000-000000000019', 'arjun.dewasi@example.com', '9876500019', 'Arjun Dewasi', 'customer'),
('30000000-0000-4000-8000-000000000020', 'farida.bano@example.com', '9876500020', 'Farida Bano', 'customer'),
('40000000-0000-4000-8000-000000000001', 'rider@mertadeal.in', '9001100001', 'Suresh Kumar', 'rider'),
('40000000-0000-4000-8000-000000000002', 'rider2@mertadeal.in', '9001100002', 'Mukesh Gurjar', 'rider'),
('40000000-0000-4000-8000-000000000003', 'rider3@mertadeal.in', '9001100003', 'Salim Sheikh', 'rider'),
('40000000-0000-4000-8000-000000000004', 'rider4@mertadeal.in', '9001100004', 'Ravi Jat', 'rider'),
('40000000-0000-4000-8000-000000000005', 'rider5@mertadeal.in', '9001100005', 'Prakash Nayak', 'rider'),
('40000000-0000-4000-8000-000000000006', 'rider6@mertadeal.in', '9001100006', 'Om Prakash Bhil', 'rider'),
('40000000-0000-4000-8000-000000000007', 'rider7@mertadeal.in', '9001100007', 'Yusuf Qureshi', 'rider'),
('40000000-0000-4000-8000-000000000008', 'rider8@mertadeal.in', '9001100008', 'Bablu Meghwal', 'rider'),
('40000000-0000-4000-8000-000000000009', 'rider9@mertadeal.in', '9001100009', 'Kishan Lal', 'rider'),
('40000000-0000-4000-8000-000000000010', 'rider10@mertadeal.in', '9001100010', 'Deva Ram', 'rider');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
       extensions.crypt('Merta@123', extensions.gen_salt('bf')), now(), '91' || phone, now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', full_name, 'phone', phone, 'role', case when role = 'rider' then role else 'customer' end),
       now() - interval '90 days', now(), '', '', '', '', ''
from seed_users;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true, 'phone_verified', true), 'email', now(), now(), now()
from seed_users;

-- Admin roles are never self-assignable; set them here explicitly.
update public.profiles p set role = su.role::public.user_role, phone = su.phone, full_name = su.full_name
from seed_users su where su.id = p.id;

-- ---------------------------------------------------------------- PRODUCTS --
create or replace function pg_temp.add_product(
  p_name text, p_brand text, p_cat text, p_wv numeric, p_wu text, p_pack text, p_mrp numeric,
  p_syn text[] default '{}', p_tags text[] default '{}', p_local boolean default false, p_veg boolean default true,
  p_desc text default null, p_ingr text default null, p_manu text default null, p_nutri jsonb default null, p_pop int default 0
) returns void language plpgsql as $$
begin
  insert into public.products (name, slug, brand_id, category_id, weight_value, weight_unit, pack_label, mrp, synonyms, tags, is_local, is_veg, description, ingredients, manufacturer, nutrition, popularity_score)
  values (p_name, public.slugify(p_name || ' ' || coalesce(p_pack,'')), (select id from public.brands where name = p_brand), (select id from public.categories where slug = p_cat),
          p_wv, p_wu, p_pack, p_mrp, p_syn, p_tags, p_local, p_veg, p_desc, p_ingr, p_manu, p_nutri, p_pop);
end $$;

-- Grocery: Atta
do $seed$ begin
  perform pg_temp.add_product('Aashirvaad Shudh Chakki Atta','Aashirvaad','atta',5,'kg','5 kg',285,'{atta,aata,flour,wheat}','{staple,monthly}',false,true,'100% whole wheat atta made from the choicest grains, ground in a chakki for soft rotis.','Whole wheat','ITC Limited','{"energy_kcal":341,"protein_g":12,"carbs_g":72,"fat_g":1.7,"fibre_g":11}',95);
  perform pg_temp.add_product('Aashirvaad Shudh Chakki Atta','Aashirvaad','atta',10,'kg','10 kg',545,'{atta,aata,flour,wheat}','{staple,monthly,bulk}',false,true,'Family pack whole wheat atta.','Whole wheat','ITC Limited',null,70);
  perform pg_temp.add_product('Fortune Chakki Fresh Atta','Fortune','atta',5,'kg','5 kg',270,'{atta,aata,flour}','{staple}',false,true,'Fresh chakki atta for soft, fluffy rotis.','Whole wheat','Adani Wilmar',null,60);
  perform pg_temp.add_product('Rajdhani Chakki Atta','Rajdhani','atta',5,'kg','5 kg',255,'{atta,aata,flour}','{staple,value}',false,true,'Value chakki atta.','Whole wheat','Victoria Foods',null,40);
  perform pg_temp.add_product('Merta Local Chakki Atta (Sharbati)','Merta Local','atta',5,'kg','5 kg',240,'{atta,aata,flour,sharbati}','{staple,local}',true,true,'Sharbati wheat ground fresh at local chakki in Merta. No preservatives.','Sharbati whole wheat','Local Chakki, Merta',null,55);
end $seed$;
-- Rice
do $seed$ begin
  perform pg_temp.add_product('India Gate Basmati Rice Classic','India Gate','rice',5,'kg','5 kg',799,'{rice,chawal,basmati}','{staple,premium}',false,true,'Aged extra-long grain basmati.','Basmati rice','KRBL Ltd','{"energy_kcal":350,"protein_g":7,"carbs_g":78}',65);
  perform pg_temp.add_product('Daawat Rozana Super Basmati','Daawat','rice',5,'kg','5 kg',445,'{rice,chawal,basmati}','{staple}',false,true,'Everyday basmati rice for daily meals.','Basmati rice','LT Foods',null,58);
  perform pg_temp.add_product('Fortune Everyday Basmati Rice','Fortune','rice',1,'kg','1 kg',95,'{rice,chawal,basmati}','{staple}',false,true,'Long grain basmati, 1 kg pack.','Basmati rice','Adani Wilmar',null,50);
  perform pg_temp.add_product('Sona Masoori Rice (Loose)','Merta Local','rice',5,'kg','5 kg',290,'{rice,chawal,sona,masoori}','{staple,value}',true,true,'Light, aromatic Sona Masoori rice.','Rice','Local, Merta',null,30);
end $seed$;
-- Dal & Pulses
do $seed$ begin
  perform pg_temp.add_product('Tata Sampann Toor Dal (Arhar)','Tata Sampann','dal',1,'kg','1 kg',185,'{dal,daal,toor,arhar,tuvar}','{staple,protein}',false,true,'Unpolished toor dal with natural protein.','Toor dal','Tata Consumer','{"energy_kcal":335,"protein_g":22}',80);
  perform pg_temp.add_product('Tata Sampann Moong Dal','Tata Sampann','dal',1,'kg','1 kg',165,'{dal,daal,moong,mung}','{staple,protein}',false,true,'Unpolished yellow moong dal.','Moong dal','Tata Consumer',null,62);
  perform pg_temp.add_product('Chana Dal (Loose)','Merta Local','dal',1,'kg','1 kg',95,'{dal,daal,chana}','{staple,value}',true,true,'Cleaned chana dal, loose pack.','Chana dal','Local, Merta',null,45);
  perform pg_temp.add_product('Masoor Dal (Loose)','Merta Local','dal',1,'kg','1 kg',105,'{dal,daal,masoor}','{staple}',true,true,'Red lentils, cleaned.','Masoor dal','Local, Merta',null,40);
  perform pg_temp.add_product('Urad Dal Whole','Rajdhani','dal',1,'kg','1 kg',150,'{dal,daal,urad,udad}','{staple}',false,true,'Whole black urad dal.','Urad dal','Victoria Foods',null,25);
  perform pg_temp.add_product('Kabuli Chana','Rajdhani','pulses',1,'kg','1 kg',140,'{chana,chole,kabuli}','{staple,protein}',false,true,'Large white chickpeas.','Chickpeas','Victoria Foods',null,48);
  perform pg_temp.add_product('Rajma Chitra','Rajdhani','pulses',1,'kg','1 kg',175,'{rajma,kidney}','{staple,protein}',false,true,'Chitra rajma, speckled kidney beans.','Kidney beans','Victoria Foods',null,35);
  perform pg_temp.add_product('Moth Dal (Rajasthani)','Merta Local','pulses',1,'kg','1 kg',120,'{moth,matki,dal}','{staple,local}',true,true,'Rajasthani moth beans, perfect for moth dal and kachori.','Moth beans','Local, Merta',null,28);
  perform pg_temp.add_product('Green Moong Whole','Rajdhani','pulses',1,'kg','1 kg',145,'{moong,mung,sabut}','{staple}',false,true,'Whole green moong for sprouts and dal.','Green gram','Victoria Foods',null,30);
end $seed$;
-- Sugar / Salt
do $seed$ begin
  perform pg_temp.add_product('Sugar (Sulphurless)','Merta Local','sugar',1,'kg','1 kg',46,'{sugar,chini,shakkar}','{staple}',true,true,'Refined sulphurless sugar.','Sugar','Local, Merta',null,88);
  perform pg_temp.add_product('Sugar (Sulphurless)','Merta Local','sugar',5,'kg','5 kg',225,'{sugar,chini,shakkar}','{staple,bulk}',true,true,'5 kg refined sugar.','Sugar','Local, Merta',null,50);
  perform pg_temp.add_product('Patanjali Jaggery (Gud)','Patanjali','sugar',1,'kg','1 kg',85,'{gud,gur,jaggery}','{staple}',false,true,'Natural jaggery without chemicals.','Sugarcane','Patanjali',null,32);
  perform pg_temp.add_product('Tata Salt Iodised','Tata','salt',1,'kg','1 kg',28,'{salt,namak}','{staple}',false,true,'Desh ka namak. Vacuum evaporated iodised salt.','Iodised salt','Tata Consumer',null,92);
  perform pg_temp.add_product('Tata Rock Salt (Sendha Namak)','Tata','salt',1,'kg','1 kg',60,'{salt,namak,sendha,rock}','{fasting}',false,true,'Pure rock salt for vrat.','Rock salt','Tata Consumer',null,20);
end $seed$;
-- Oil & Ghee
do $seed$ begin
  perform pg_temp.add_product('Fortune Sunlite Refined Sunflower Oil','Fortune','oil',1,'l','1 L',165,'{oil,tel,sunflower,refined}','{staple}',false,true,'Light, healthy refined sunflower oil.','Sunflower oil','Adani Wilmar',null,85);
  perform pg_temp.add_product('Fortune Kachi Ghani Mustard Oil','Fortune','oil',1,'l','1 L',175,'{oil,tel,sarso,sarson,mustard}','{staple}',false,true,'Pungent kachi ghani mustard oil.','Mustard oil','Adani Wilmar',null,70);
  perform pg_temp.add_product('Saffola Gold Oil','Saffola','oil',1,'l','1 L',215,'{oil,tel,saffola}','{healthy}',false,true,'Blended oil for a healthy heart.','Rice bran + safflower oil','Marico',null,45);
  perform pg_temp.add_product('Dhara Groundnut Oil','Dhara','oil',1,'l','1 L',210,'{oil,tel,moongfali,groundnut,peanut}','{staple}',false,true,'Filtered groundnut oil.','Groundnut oil','Mother Dairy',null,38);
  perform pg_temp.add_product('Gemini Refined Soyabean Oil','Gemini','oil',1,'l','1 L',140,'{oil,tel,soya}','{value}',false,true,'Refined soyabean oil, 1 L pouch.','Soyabean oil','Cargill',null,42);
  perform pg_temp.add_product('Amul Pure Ghee','Amul','oil',1,'l','1 L',640,'{ghee,ghi}','{staple,premium}',false,true,'Pure cow ghee with rich aroma.','Milk fat','Amul','{"energy_kcal":900,"fat_g":99.7}',75);
  perform pg_temp.add_product('Saras Desi Ghee','Saras','oil',500,'ml','500 ml',335,'{ghee,ghi,desi}','{staple,local}',true,true,'Rajasthan''s own Saras desi ghee.','Milk fat','RCDF',null,58);
  perform pg_temp.add_product('Merta Dairy Desi Ghee (Bilona)','Merta Local','oil',500,'g','500 g',420,'{ghee,ghi,desi,bilona}','{premium,local}',true,true,'Hand-churned bilona ghee from local desi cows.','Cow milk fat','Merta Dairy Farmers',null,33);
end $seed$;
-- Flour & besan
do $seed$ begin
  perform pg_temp.add_product('Rajdhani Besan','Rajdhani','flour',1,'kg','1 kg',110,'{besan,gram,chickpea}','{staple}',false,true,'Fine chana besan for pakoras and laddoo.','Chana dal','Victoria Foods',null,52);
  perform pg_temp.add_product('Maida (All Purpose Flour)','Rajdhani','flour',1,'kg','1 kg',48,'{maida,flour,refined}','{baking}',false,true,'Refined wheat flour.','Wheat','Victoria Foods',null,30);
  perform pg_temp.add_product('Suji (Rava)','Rajdhani','flour',1,'kg','1 kg',52,'{suji,sooji,rava,semolina}','{staple}',false,true,'Fine semolina.','Wheat','Victoria Foods',null,35);
  perform pg_temp.add_product('Bajra Atta (Pearl Millet)','Merta Local','flour',1,'kg','1 kg',55,'{bajra,millet,atta,flour}','{local,winter}',true,true,'Fresh-ground bajra for Rajasthani bajre ki roti.','Pearl millet','Local Chakki, Merta',null,40);
end $seed$;
-- Spices
do $seed$ begin
  perform pg_temp.add_product('Everest Turmeric Powder','Everest','turmeric',200,'g','200 g',68,'{haldi,turmeric}','{spice}',false,true,'Pure turmeric powder with high curcumin.','Turmeric','Everest Spices',null,72);
  perform pg_temp.add_product('Catch Haldi Powder','Catch','turmeric',100,'g','100 g',38,'{haldi,turmeric}','{spice}',false,true,'Low temperature ground turmeric.','Turmeric','DS Group',null,40);
  perform pg_temp.add_product('Mathania Red Chilli Powder','Mathania','red-chilli',250,'g','250 g',145,'{chilli,lalmirch,mirch,mathania}','{spice,local,hot}',true,true,'Authentic Mathania mirch from Jodhpur region — deep red, medium heat.','Red chilli','Sharma Masala Bhandar',null,68);
  perform pg_temp.add_product('Everest Tikhalal Red Chilli Powder','Everest','red-chilli',200,'g','200 g',86,'{chilli,lalmirch,mirch,tikhalal}','{spice,hot}',false,true,'Extra hot red chilli powder.','Red chilli','Everest Spices',null,60);
  perform pg_temp.add_product('MDH Deggi Mirch','MDH','red-chilli',100,'g','100 g',72,'{chilli,lalmirch,deggi,kashmiri}','{spice,colour}',false,true,'Bright red mild chilli for colour.','Kashmiri chilli, capsicum','MDH',null,44);
  perform pg_temp.add_product('Everest Coriander Powder','Everest','coriander',200,'g','200 g',62,'{dhaniya,dhania,coriander}','{spice}',false,true,'Fresh-ground coriander.','Coriander seeds','Everest Spices',null,55);
  perform pg_temp.add_product('Catch Cumin Seeds (Jeera)','Catch','cumin',200,'g','200 g',98,'{jeera,zeera,cumin}','{spice}',false,true,'Whole cumin seeds.','Cumin','DS Group',null,58);
  perform pg_temp.add_product('Everest Cumin Powder','Everest','cumin',100,'g','100 g',58,'{jeera,zeera,cumin}','{spice}',false,true,'Roasted cumin powder.','Cumin','Everest Spices',null,36);
  perform pg_temp.add_product('MDH Garam Masala','MDH','garam-masala',100,'g','100 g',95,'{garam,masala}','{spice}',false,true,'Classic MDH blend of 12 spices.','Coriander, cumin, black pepper, cardamom, cinnamon, cloves','MDH',null,66);
  perform pg_temp.add_product('Everest Garam Masala','Everest','garam-masala',100,'g','100 g',88,'{garam,masala}','{spice}',false,true,'Aromatic garam masala.','Blend of spices','Everest Spices',null,50);
  perform pg_temp.add_product('MDH Kitchen King Masala','MDH','garam-masala',100,'g','100 g',92,'{masala,kitchen,king}','{spice}',false,true,'All-purpose vegetable masala.','Blend of spices','MDH',null,42);
  perform pg_temp.add_product('Everest Chhole Masala','Everest','garam-masala',100,'g','100 g',75,'{chole,chana,masala}','{spice}',false,true,'For restaurant-style chhole.','Blend of spices','Everest Spices',null,38);
  perform pg_temp.add_product('Whole Black Pepper (Kali Mirch)','Catch','whole-spices',100,'g','100 g',135,'{kalimirch,pepper,black}','{spice}',false,true,'Malabar black peppercorns.','Black pepper','DS Group',null,30);
  perform pg_temp.add_product('Green Cardamom (Elaichi)','Catch','whole-spices',50,'g','50 g',185,'{elaichi,cardamom,ilaichi}','{spice,premium}',false,true,'Bold green cardamom.','Cardamom','DS Group',null,28);
  perform pg_temp.add_product('Cloves (Laung)','Catch','whole-spices',50,'g','50 g',95,'{laung,clove,cloves}','{spice}',false,true,'Whole cloves.','Cloves','DS Group',null,22);
  perform pg_temp.add_product('Mustard Seeds (Rai)','Merta Local','whole-spices',200,'g','200 g',32,'{rai,sarson,mustard}','{spice}',true,true,'Small black mustard seeds for tadka.','Mustard seeds','Local, Merta',null,35);
  perform pg_temp.add_product('Nagauri Methi Dana','Nagauri','whole-spices',200,'g','200 g',45,'{methi,fenugreek,nagauri}','{spice,local}',true,true,'Famous Nagaur fenugreek seeds.','Fenugreek','Nagaur Farmers',null,30);
end $seed$;
-- Dairy
do $seed$ begin
  perform pg_temp.add_product('Amul Taaza Toned Milk','Amul','milk',500,'ml','500 ml',29,'{milk,doodh,dudh,taaza}','{daily,fresh}',false,true,'Pasteurised toned milk pouch.','Toned milk','Amul','{"energy_kcal":58,"protein_g":3,"fat_g":3}',98);
  perform pg_temp.add_product('Amul Gold Full Cream Milk','Amul','milk',500,'ml','500 ml',34,'{milk,doodh,dudh,gold,cream}','{daily,fresh}',false,true,'Full cream milk, 6% fat.','Full cream milk','Amul',null,80);
  perform pg_temp.add_product('Saras Gold Milk','Saras','milk',500,'ml','500 ml',33,'{milk,doodh,dudh,saras}','{daily,fresh,local}',true,true,'Rajasthan''s Saras full cream milk.','Milk','RCDF',null,85);
  perform pg_temp.add_product('Saras Taaza Toned Milk','Saras','milk',1,'l','1 L',56,'{milk,doodh,dudh,saras}','{daily,fresh,local}',true,true,'Saras toned milk 1 L.','Toned milk','RCDF',null,70);
  perform pg_temp.add_product('Amul Masti Dahi','Amul','curd',400,'g','400 g',38,'{curd,dahi,yogurt}','{daily,fresh}',false,true,'Thick, creamy curd.','Milk, culture','Amul',null,74);
  perform pg_temp.add_product('Saras Dahi','Saras','curd',500,'g','500 g',42,'{curd,dahi,yogurt}','{daily,fresh,local}',true,true,'Fresh set curd.','Milk, culture','RCDF',null,52);
  perform pg_temp.add_product('Amul Fresh Paneer','Amul','paneer',200,'g','200 g',92,'{paneer,cottage}','{fresh,protein}',false,true,'Soft, fresh malai paneer.','Milk','Amul','{"energy_kcal":293,"protein_g":18,"fat_g":22}',68);
  perform pg_temp.add_product('Mother Dairy Paneer','Mother Dairy','paneer',200,'g','200 g',88,'{paneer,cottage}','{fresh,protein}',false,true,'Fresh paneer block.','Milk','Mother Dairy',null,40);
  perform pg_temp.add_product('Amul Butter (Pasteurised)','Amul','butter',500,'g','500 g',290,'{butter,makhan,maska}','{daily}',false,true,'Utterly butterly delicious.','Cream, salt','Amul',null,76);
  perform pg_temp.add_product('Amul Butter (Pasteurised)','Amul','butter',100,'g','100 g',60,'{butter,makhan,maska}','{daily}',false,true,'Amul butter 100 g.','Cream, salt','Amul',null,60);
  perform pg_temp.add_product('Amul Cheese Slices','Amul','cheese',200,'g','10 slices',145,'{cheese,slice}','{kids}',false,true,'Processed cheese slices.','Cheese, emulsifiers','Amul',null,45);
  perform pg_temp.add_product('Amul Cheese Cubes','Amul','cheese',200,'g','200 g',135,'{cheese,cube}','{kids}',false,true,'Processed cheese cubes.','Cheese','Amul',null,30);
end $seed$;
-- Snacks
do $seed$ begin
  perform pg_temp.add_product('Parle-G Gold Biscuits','Parle','biscuits',1,'kg','1 kg',140,'{biscuits,biskut,parle,glucose}','{tea-time,kids}',false,true,'India''s favourite glucose biscuit, family pack.','Wheat flour, sugar, edible oil','Parle Products','{"energy_kcal":450,"protein_g":7,"carbs_g":77}',90);
  perform pg_temp.add_product('Parle-G Original','Parle','biscuits',250,'g','250 g',30,'{biscuits,biskut,parle,glucose}','{tea-time,kids}',false,true,'Parle-G 250 g pack.','Wheat flour, sugar','Parle Products',null,82);
  perform pg_temp.add_product('Britannia Good Day Cashew Cookies','Good Day','biscuits',600,'g','600 g',120,'{biscuits,cookies,goodday}','{tea-time}',false,true,'Buttery cashew cookies.','Wheat flour, sugar, butter, cashew','Britannia',null,65);
  perform pg_temp.add_product('Britannia Marie Gold','Britannia','biscuits',600,'g','600 g',85,'{biscuits,marie,gold}','{tea-time,light}',false,true,'Light, crisp tea biscuits.','Wheat flour, sugar','Britannia',null,55);
  perform pg_temp.add_product('Sunfeast Dark Fantasy Choco Fills','Sunfeast','biscuits',300,'g','300 g',120,'{biscuits,cookies,chocofills,fantasy}','{indulgence}',false,true,'Cookies with molten choco centre.','Wheat flour, cocoa','ITC',null,48);
  perform pg_temp.add_product('Oreo Vanilla Creme','Oreo','biscuits',120,'g','120 g',35,'{biscuits,oreo,cookies}','{kids}',false,true,'Chocolate sandwich biscuits.','Wheat flour, sugar, cocoa','Mondelez',null,50);
  perform pg_temp.add_product('Lay''s Magic Masala','Lay''s','chips',73,'g','73 g',30,'{chips,lays,masala}','{snack,party}',false,true,'India''s magic masala flavour.','Potato, oil, seasoning','PepsiCo',null,78);
  perform pg_temp.add_product('Lay''s Classic Salted','Lay''s','chips',73,'g','73 g',30,'{chips,lays,salted}','{snack}',false,true,'Classic salted potato chips.','Potato, oil, salt','PepsiCo',null,55);
  perform pg_temp.add_product('Kurkure Masala Munch','Kurkure','chips',90,'g','90 g',20,'{kurkure,chips,masala}','{snack,kids}',false,true,'Crunchy masala corn puffs.','Rice meal, corn meal, spices','PepsiCo',null,70);
  perform pg_temp.add_product('Uncle Chipps Spicy Treat','Uncle Chipps','chips',55,'g','55 g',20,'{chips,uncle,spicy}','{snack}',false,true,'Spicy potato chips.','Potato, oil','PepsiCo',null,35);
  perform pg_temp.add_product('Haldiram''s Aloo Bhujia','Haldiram''s','namkeen',400,'g','400 g',105,'{bhujia,namkeen,aloo,sev}','{snack,tea-time}',false,true,'Crispy potato-gram flour bhujia.','Potato, gram flour, spices','Haldiram''s',null,85);
  perform pg_temp.add_product('Bikaji Bikaneri Bhujia','Bikaji','namkeen',400,'g','400 g',110,'{bhujia,namkeen,bikaneri,sev}','{snack,tea-time,rajasthan}',false,true,'Original Bikaneri bhujia.','Moth flour, gram flour, spices','Bikaji Foods',null,80);
  perform pg_temp.add_product('Haldiram''s Navrattan Mixture','Haldiram''s','namkeen',400,'g','400 g',110,'{mixture,namkeen,navrattan}','{snack}',false,true,'Nine-ingredient spicy mixture.','Gram flour, peanuts, spices','Haldiram''s',null,50);
  perform pg_temp.add_product('Bikano Moong Dal Namkeen','Bikano','namkeen',400,'g','400 g',95,'{moong,dal,namkeen}','{snack}',false,true,'Crunchy fried moong dal.','Moong dal, oil, salt','Bikano',null,42);
  perform pg_temp.add_product('Merta Special Papad (Moong)','Merta Local','namkeen',200,'g','200 g',85,'{papad,papadum,moong}','{local,rajasthan}',true,true,'Hand-rolled moong papad from Merta home makers.','Moong dal, spices, salt','Merta Mahila Udyog',null,48);
  perform pg_temp.add_product('Cadbury Dairy Milk Silk','Cadbury','chocolates',60,'g','60 g',80,'{chocolate,dairy,milk,silk}','{gift,indulgence}',false,true,'Smooth milk chocolate.','Sugar, milk solids, cocoa','Mondelez',null,72);
  perform pg_temp.add_product('Cadbury Dairy Milk','Cadbury','chocolates',23,'g','23 g',20,'{chocolate,dairy,milk}','{kids}',false,true,'Classic Dairy Milk bar.','Sugar, milk solids, cocoa','Mondelez',null,68);
  perform pg_temp.add_product('Nestlé KitKat 4 Finger','Nestlé','chocolates',38.5,'g','38.5 g',35,'{chocolate,kitkat,wafer}','{kids}',false,true,'Crispy wafer in milk chocolate.','Sugar, wheat flour, cocoa','Nestlé',null,55);
  perform pg_temp.add_product('Happilo Premium Almonds','Happilo','dry-fruits',250,'g','250 g',245,'{badam,almond,almonds,dryfruit}','{healthy,gift}',false,true,'California almonds, 250 g.','Almonds','Happilo',null,40);
  perform pg_temp.add_product('Cashew W320','Merta Local','dry-fruits',250,'g','250 g',265,'{kaju,cashew,dryfruit}','{healthy,gift}',false,true,'Whole cashews W320 grade.','Cashew','Local, Merta',null,38);
  perform pg_temp.add_product('Raisins (Kishmish)','Merta Local','dry-fruits',250,'g','250 g',95,'{kishmish,raisins,dryfruit}','{healthy}',false,true,'Golden raisins.','Raisins','Local, Merta',null,30);
end $seed$;
-- Beverages
do $seed$ begin
  perform pg_temp.add_product('Bisleri Mineral Water','Bisleri','water',1,'l','1 L',20,'{water,pani,paani,bottle}','{daily}',false,true,'Packaged drinking water.','Water','Bisleri',null,88);
  perform pg_temp.add_product('Bisleri Mineral Water','Bisleri','water',20,'l','20 L jar',90,'{water,pani,paani,jar,can}','{daily,bulk}',false,true,'20 litre jar, returnable.','Water','Bisleri',null,45);
  perform pg_temp.add_product('Kinley Water','Kinley','water',1,'l','1 L',20,'{water,pani,paani,bottle}','{daily}',false,true,'Packaged drinking water.','Water','Coca-Cola',null,40);
  perform pg_temp.add_product('Red Label Tea','Red Label','tea',500,'g','500 g',290,'{tea,chai,patti,redlabel}','{daily}',false,true,'Strong, flavourful CTC tea.','Black tea','Hindustan Unilever',null,84);
  perform pg_temp.add_product('Taj Mahal Tea','Taj Mahal','tea',250,'g','250 g',175,'{tea,chai,patti,taj}','{premium}',false,true,'Rich Assam tea.','Black tea','Hindustan Unilever',null,50);
  perform pg_temp.add_product('Tata Tea Gold','Tata','tea',500,'g','500 g',285,'{tea,chai,patti,gold}','{daily}',false,true,'Assam CTC with long leaf.','Black tea','Tata Consumer',null,66);
  perform pg_temp.add_product('Nescafé Classic Coffee','Nescafé','coffee',50,'g','50 g',165,'{coffee,nescafe,instant}','{morning}',false,true,'100% pure instant coffee.','Coffee','Nestlé',null,58);
  perform pg_temp.add_product('Bru Instant Coffee','Bru','coffee',100,'g','100 g',235,'{coffee,bru,instant}','{morning}',false,true,'Coffee-chicory blend.','Coffee, chicory','Hindustan Unilever',null,42);
  perform pg_temp.add_product('Real Mixed Fruit Juice','Real','juice',1,'l','1 L',120,'{juice,real,fruit}','{kids,healthy}',false,true,'Mixed fruit juice, no added preservatives.','Fruit concentrates','Dabur',null,52);
  perform pg_temp.add_product('Frooti Mango Drink','Frooti','juice',600,'ml','600 ml',35,'{frooti,mango,aam,juice}','{kids,summer}',false,true,'Fresh n juicy mango drink.','Mango pulp, water, sugar','Parle Agro',null,66);
  perform pg_temp.add_product('Coca-Cola','Coca-Cola','soft-drinks',750,'ml','750 ml',45,'{coke,cola,colddrink}','{party}',false,true,'Classic Coca-Cola.','Carbonated water, sugar','Coca-Cola',null,72);
  perform pg_temp.add_product('Thums Up','Thums Up','soft-drinks',750,'ml','750 ml',45,'{thums,thumsup,cola,colddrink}','{party}',false,true,'Strong cola taste.','Carbonated water, sugar','Coca-Cola',null,74);
  perform pg_temp.add_product('Sprite','Sprite','soft-drinks',750,'ml','750 ml',45,'{sprite,lemon,colddrink}','{party}',false,true,'Lemon-lime soda.','Carbonated water, sugar','Coca-Cola',null,60);
  perform pg_temp.add_product('Pepsi','Pepsi','soft-drinks',750,'ml','750 ml',45,'{pepsi,cola,colddrink}','{party}',false,true,'Pepsi cola.','Carbonated water, sugar','PepsiCo',null,50);
end $seed$;
-- Personal care
do $seed$ begin
  perform pg_temp.add_product('Dove Cream Beauty Bathing Bar','Dove','bath-body',100,'g','Pack of 3',195,'{soap,sabun,dove}','{daily}',false,true,'1/4 moisturising cream.','Sodium lauroyl isethionate','Hindustan Unilever',null,55);
  perform pg_temp.add_product('Lifebuoy Total 10 Soap','Lifebuoy','bath-body',125,'g','Pack of 4',120,'{soap,sabun,lifebuoy}','{daily,value}',false,true,'Germ protection soap.','Soap noodles','Hindustan Unilever',null,70);
  perform pg_temp.add_product('Santoor Sandal & Turmeric Soap','Santoor','bath-body',125,'g','Pack of 4',130,'{soap,sabun,santoor}','{daily}',false,true,'Sandal and turmeric soap.','Soap noodles, sandal oil','Wipro',null,48);
  perform pg_temp.add_product('Dettol Original Soap','Dettol','bath-body',125,'g','Pack of 4',150,'{soap,sabun,dettol}','{daily}',false,true,'Trusted antibacterial soap.','Soap noodles, chloroxylenol','Reckitt',null,52);
  perform pg_temp.add_product('Colgate Strong Teeth Toothpaste','Colgate','oral-care',200,'g','200 g',115,'{toothpaste,manjan,colgate}','{daily}',false,true,'Calcium boost for strong teeth.','Calcium carbonate, fluoride','Colgate-Palmolive',null,78);
  perform pg_temp.add_product('Closeup Ever Fresh Red Hot','Closeup','oral-care',150,'g','150 g',95,'{toothpaste,manjan,closeup}','{daily}',false,true,'Gel toothpaste for fresh breath.','Sorbitol, fluoride','Hindustan Unilever',null,40);
  perform pg_temp.add_product('Colgate ZigZag Toothbrush','Colgate','oral-care',1,'pcs','Pack of 4',110,'{toothbrush,brush}','{daily}',false,true,'Medium bristles.','Nylon','Colgate-Palmolive',null,35);
  perform pg_temp.add_product('Clinic Plus Strong & Long Shampoo','Clinic Plus','hair-care',340,'ml','340 ml',210,'{shampoo,shampu,clinic}','{daily}',false,true,'Milk protein shampoo.','Water, SLES','Hindustan Unilever',null,58);
  perform pg_temp.add_product('Dabur Amla Hair Oil','Dabur','hair-care',275,'ml','275 ml',125,'{oil,tel,amla,hair}','{daily}',false,true,'Nourishing amla hair oil.','Mineral oil, amla','Dabur',null,50);
  perform pg_temp.add_product('Pantene Hair Fall Control Shampoo','Pantene','hair-care',340,'ml','340 ml',255,'{shampoo,shampu,pantene}','{daily}',false,true,'Pro-V formula.','Water, SLES','P&G',null,36);
end $seed$;
-- Household
do $seed$ begin
  perform pg_temp.add_product('Surf Excel Easy Wash Detergent Powder','Surf Excel','laundry',1,'kg','1 kg',140,'{detergent,surf,washing,powder}','{daily}',false,true,'Tough stain removal.','Surfactants, builders','Hindustan Unilever',null,74);
  perform pg_temp.add_product('Ghadi Detergent Powder','Ghadi','laundry',1,'kg','1 kg',75,'{detergent,ghadi,washing,powder}','{daily,value}',false,true,'Pehle istemal karein, phir vishwas karein.','Surfactants','RSPL',null,68);
  perform pg_temp.add_product('Nirma Washing Powder','Nirma','laundry',1,'kg','1 kg',60,'{detergent,nirma,washing,powder}','{value}',false,true,'Classic value detergent.','Surfactants','Nirma',null,40);
  perform pg_temp.add_product('Vim Dishwash Bar','Vim','cleaning',300,'g','Pack of 3',65,'{vim,dishwash,bar,bartan}','{daily}',false,true,'Lemon power dishwash bar.','Surfactants, lemon','Hindustan Unilever',null,72);
  perform pg_temp.add_product('Vim Dishwash Gel','Vim','cleaning',500,'ml','500 ml',115,'{vim,dishwash,gel,bartan}','{daily}',false,true,'Concentrated dishwash gel.','Surfactants','Hindustan Unilever',null,44);
  perform pg_temp.add_product('Harpic Power Plus Toilet Cleaner','Harpic','cleaning',1,'l','1 L',195,'{harpic,toilet,cleaner}','{daily}',false,true,'10x cleaning power.','Hydrochloric acid','Reckitt',null,58);
  perform pg_temp.add_product('Lizol Disinfectant Floor Cleaner','Dettol','cleaning',975,'ml','975 ml',215,'{lizol,floor,cleaner,phenyl}','{daily}',false,true,'Kills 99.9% germs.','Benzalkonium chloride','Reckitt',null,45);
  perform pg_temp.add_product('Goodknight Gold Flash Refill','Goodknight','cleaning',45,'ml','45 ml',88,'{goodknight,mosquito,machar,refill}','{daily}',false,true,'Liquid vaporizer refill.','Transfluthrin','Godrej',null,50);
end $seed$;
-- Fruits & Vegetables
do $seed$ begin
  perform pg_temp.add_product('Onion (Pyaz)','Fresh Farm','vegetables',1,'kg','1 kg',35,'{onion,pyaz,pyaaz,kanda}','{fresh,daily}',true,true,'Fresh red onions from Merta mandi.',null,'Merta Mandi',null,90);
  perform pg_temp.add_product('Potato (Aloo)','Fresh Farm','vegetables',1,'kg','1 kg',28,'{potato,aloo,alu,batata}','{fresh,daily}',true,true,'Fresh potatoes.',null,'Merta Mandi',null,88);
  perform pg_temp.add_product('Tomato (Tamatar)','Fresh Farm','vegetables',1,'kg','1 kg',40,'{tomato,tamatar,tamater}','{fresh,daily}',true,true,'Farm-fresh tomatoes.',null,'Merta Mandi',null,86);
  perform pg_temp.add_product('Green Chilli (Hari Mirch)','Fresh Farm','vegetables',100,'g','100 g',10,'{chilli,harimirch,mirch,green}','{fresh}',true,true,'Fresh green chillies.',null,'Merta Mandi',null,60);
  perform pg_temp.add_product('Coriander Leaves (Dhaniya Patta)','Fresh Farm','vegetables',100,'g','100 g',10,'{dhaniya,coriander,patta,hara}','{fresh}',true,true,'Fresh coriander bunch.',null,'Merta Mandi',null,62);
  perform pg_temp.add_product('Ginger (Adrak)','Fresh Farm','vegetables',250,'g','250 g',25,'{ginger,adrak}','{fresh}',true,true,'Fresh ginger.',null,'Merta Mandi',null,50);
  perform pg_temp.add_product('Lemon (Nimbu)','Fresh Farm','vegetables',250,'g','4 pcs',20,'{lemon,nimbu,lime}','{fresh}',true,true,'Juicy lemons.',null,'Merta Mandi',null,55);
  perform pg_temp.add_product('Cauliflower (Gobhi)','Fresh Farm','vegetables',1,'pcs','1 pc',30,'{cauliflower,gobhi,gobi,phool}','{fresh}',true,true,'Fresh cauliflower.',null,'Merta Mandi',null,40);
  perform pg_temp.add_product('Spinach (Palak)','Fresh Farm','vegetables',250,'g','250 g',15,'{spinach,palak}','{fresh}',true,true,'Fresh palak bunch.',null,'Merta Mandi',null,38);
  perform pg_temp.add_product('Banana (Kela)','Fresh Farm','fruits',1,'dozen','1 dozen',50,'{banana,kela}','{fresh,daily}',true,true,'Ripe bananas.',null,'Merta Mandi',null,75);
  perform pg_temp.add_product('Apple Shimla','Fresh Farm','fruits',1,'kg','1 kg',160,'{apple,seb}','{fresh}',true,true,'Crisp Shimla apples.',null,'Merta Mandi',null,58);
  perform pg_temp.add_product('Pomegranate (Anar)','Fresh Farm','fruits',500,'g','500 g',90,'{pomegranate,anar}','{fresh}',true,true,'Sweet Bhagwa anar.',null,'Merta Mandi',null,45);
  perform pg_temp.add_product('Papaya','Fresh Farm','fruits',1,'pcs','1 pc (approx 1 kg)',45,'{papaya,papita}','{fresh}',true,true,'Ripe papaya.',null,'Merta Mandi',null,35);
end $seed$;
-- Baby care
do $seed$ begin
  perform pg_temp.add_product('Pampers All Round Protection Pants M','Pampers','diapers',1,'pack','56 pants',899,'{diapers,diaper,nappy,pampers}','{baby}',false,true,'Medium size, 7-12 kg.','Non-woven, SAP','P&G',null,42);
  perform pg_temp.add_product('MamyPoko Pants Extra Absorb L','MamyPoko','diapers',1,'pack','44 pants',749,'{diapers,diaper,nappy,mamypoko}','{baby}',false,true,'Large size, 9-14 kg.','Non-woven, SAP','Unicharm',null,36);
  perform pg_temp.add_product('Johnson''s Baby Wipes','Johnson''s','diapers',1,'pack','72 wipes',199,'{wipes,baby}','{baby}',false,true,'Gentle cleansing wipes.','Water, glycerin','Kenvue',null,30);
  perform pg_temp.add_product('Nestlé Cerelac Wheat Apple','Cerelac','baby-food',300,'g','300 g',255,'{cerelac,baby,food}','{baby}',false,true,'Infant cereal, 6+ months.','Wheat flour, milk solids, apple','Nestlé',null,40);
  perform pg_temp.add_product('Himalaya Baby Powder','Himalaya','diapers',200,'g','200 g',125,'{powder,baby,himalaya}','{baby}',false,true,'Herbal baby powder.','Khus grass, olive oil','Himalaya',null,28);
end $seed$;
-- Beauty & lifestyle
do $seed$ begin
  perform pg_temp.add_product('Nivea Soft Moisturising Cream','Nivea','beauty-lifestyle',200,'ml','200 ml',249,'{cream,nivea,moisturiser}','{beauty}',false,true,'Light moisturiser with jojoba oil.','Water, glycerin, jojoba','Beiersdorf',null,38);
  perform pg_temp.add_product('Lakmé 9to5 Compact','Lakmé','beauty-lifestyle',9,'g','9 g',325,'{compact,lakme,makeup}','{beauty}',false,true,'Weightless matte compact.','Talc, silica','Hindustan Unilever',null,22);
  perform pg_temp.add_product('Gillette Mach3 Razor','Gillette','beauty-lifestyle',1,'pcs','1 razor',249,'{razor,gillette,shaving}','{grooming}',false,true,'3-blade razor.','Steel, plastic','P&G',null,30);
  perform pg_temp.add_product('Whisper Ultra Clean XL','Whisper','beauty-lifestyle',1,'pack','30 pads',299,'{whisper,pads,sanitary}','{hygiene}',false,true,'Ultra clean XL pads.','Cellulose, SAP','P&G',null,44);
end $seed$;
-- Home & kitchen
do $seed$ begin
  perform pg_temp.add_product('Prestige Non-Stick Tawa 28 cm','Prestige','kitchen-essentials',1,'pcs','1 pc',745,'{tawa,tava,nonstick,prestige}','{kitchen}',false,true,'Omega deluxe non-stick tawa.','Aluminium','TTK Prestige',null,18);
  perform pg_temp.add_product('Milton Thermosteel Flask 1 L','Milton','kitchen-essentials',1,'l','1 L',899,'{flask,thermos,milton,bottle}','{kitchen}',false,true,'24-hour hot & cold.','Stainless steel','Milton',null,20);
  perform pg_temp.add_product('Aluminium Foil 9 m','Merta Local','kitchen-essentials',9,'m','9 m',85,'{foil,aluminium}','{kitchen}',false,true,'Food-grade aluminium foil.','Aluminium','Local',null,25);
  perform pg_temp.add_product('Garbage Bags Medium','Merta Local','kitchen-essentials',1,'pack','30 bags',99,'{garbage,dustbin,bags}','{kitchen}',false,true,'Oxo-biodegradable garbage bags.','Plastic','Local',null,32);
end $seed$;
-- Local / Rajasthani specials
do $seed$ begin
  perform pg_temp.add_product('Ker Sangri (Dried)','Merta Local','rajasthani-specials',250,'g','250 g',320,'{ker,sangri,rajasthani}','{local,rajasthan,special}',true,true,'Desert delicacy — dried ker berries and sangri beans, ready to cook.','Ker, sangri','Merta Mahila Udyog',null,42);
  perform pg_temp.add_product('Rajasthani Mirchi Achar (Pickle)','Merta Local','rajasthani-specials',500,'g','500 g',165,'{achar,pickle,mirch,mirchi}','{local,rajasthan}',true,true,'Stuffed green chilli pickle, homemade style.','Green chilli, mustard oil, spices','Sharma Masala Bhandar',null,50);
  perform pg_temp.add_product('Nagauri Pan Methi','Nagauri','rajasthani-specials',100,'g','100 g',75,'{methi,nagauri,pan}','{local,rajasthan}',true,true,'Famous Nagauri pan methi leaves for methi bajra puri.','Fenugreek leaves','Nagaur Farmers',null,26);
  perform pg_temp.add_product('Merta Special Kheech (Wheat Daliya)','Merta Local','rajasthani-specials',500,'g','500 g',60,'{kheech,daliya,dalia,porridge}','{local,rajasthan}',true,true,'Coarse wheat for traditional Rajasthani kheech.','Wheat','Local Chakki, Merta',null,24);
  perform pg_temp.add_product('Rabodi (Sun-dried Corn Papad)','Merta Local','rajasthani-specials',200,'g','200 g',110,'{rabodi,corn,papad}','{local,rajasthan,special}',true,true,'Traditional sun-dried makki rabodi.','Corn, buttermilk, spices','Merta Mahila Udyog',null,20);
  perform pg_temp.add_product('Desi Gud Chikki (Peanut)','Merta Local','rajasthani-specials',250,'g','250 g',95,'{chikki,gajak,peanut,moongfali}','{local,sweet,winter}',true,true,'Jaggery peanut chikki, winter special.','Peanut, jaggery','Local, Merta',null,30);
  perform pg_temp.add_product('Maggi 2-Minute Masala Noodles','Maggi','snacks',560,'g','Pack of 8',112,'{maggi,maggie,noodles}','{kids,instant}',false,true,'8-pack family Maggi.','Wheat flour, spices','Nestlé',null,92);
  perform pg_temp.add_product('Maggi 2-Minute Masala Noodles','Maggi','snacks',70,'g','70 g',14,'{maggi,maggie,noodles}','{kids,instant}',false,true,'Single Maggi pack.','Wheat flour, spices','Nestlé',null,80);
  perform pg_temp.add_product('Patanjali Honey','Patanjali','grocery',500,'g','500 g',185,'{honey,shahad}','{healthy}',false,true,'Pure honey.','Honey','Patanjali',null,30);
  perform pg_temp.add_product('Dabur Chyawanprash','Dabur','grocery',500,'g','500 g',215,'{chyawanprash,dabur,immunity}','{healthy,winter}',false,true,'Immunity booster.','Amla, herbs, sugar','Dabur',null,28);
end $seed$;

-- --------------------------------------------------------------- INVENTORY --
-- One listing per product at 0-15% off MRP; a few products start low or out of stock.
insert into public.inventory (product_id, selling_price, mrp, stock_qty, low_stock_threshold, max_order_qty, sold_count)
select p.id,
  round(p.mrp * (1 - (h % 16) / 100.0), 0) as selling_price,
  p.mrp,
  case when (h / 16) % 23 = 0 then 0 when (h / 16) % 11 = 0 then 3 else 12 + (h / 16) % 60 end as stock_qty,
  5, case when p.mrp > 500 then 3 else 5 end,
  (h / 100) % 90
from public.products p
cross join lateral (select abs(('x' || substr(md5(p.id::text), 1, 8))::bit(32)::int) as h) hh;

-- ---------------------------------------------------------------- ADDRESSES -
insert into public.addresses (user_id, type, full_name, phone, house, street, area, landmark, city, pincode, lat, lng, zone_id, is_default)
select su.id, (array['home','work','other'])[1 + (n % 3)]::public.address_type, su.full_name, su.phone,
  (array['H.No. 12','Flat 3B, Shanti Apartments','Plot 45','House 7','Ward 5, House 23','Gali No. 4, H.No. 9','Shop 2 (upstairs)','Near Well, House 14','B-11','Plot 89'])[1 + (n % 10)],
  (array['Sadar Bazaar Road','Station Road','Nagaur Road','Jodhpur Road','Gandhi Chowk Lane','Housing Board Colony','Indira Colony','Bhagat Singh Colony','Railway Colony','Kumhari Mohalla'])[1 + (n % 10)],
  (array['Sadar Bazaar','Station Road','Nagaur Road','Jodhpur Road','Gandhi Chowk','Housing Board','Indira Colony','Bhagat Singh Colony','Railway Colony','Kumhari Mohalla'])[1 + (n % 10)],
  (array['Near Ghanti Ghar','Near Bus Stand','Near Housing Board Park','Near Petrol Pump','Opp. Balaji Mandir','Behind Govt School','Near Sabzi Mandi','Near Water Tank','Near Railway Crossing','Near Jain Mandir'])[1 + (n % 10)],
  'Merta City', '341510',
  26.6486 + ((n * 37) % 100 - 50) * 0.00025, 74.0334 + ((n * 53) % 100 - 50) * 0.00030,
  (array['b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000004'])[1 + (n % 4)]::uuid,
  true
from (select id, full_name, phone, row_number() over (order by id) as n from seed_users where role = 'customer') su;

-- second address for the demo customer
insert into public.addresses (user_id, type, label, full_name, phone, house, street, area, landmark, city, pincode, lat, lng, zone_id, is_default) values
('30000000-0000-4000-8000-000000000001', 'work', 'Office', 'Rahul Bishnoi', '9876500001', 'Office 4, 1st Floor', 'Station Road', 'Station Road', 'Above Punjab National Bank', 'Merta City', '341510', 26.6430, 74.0262, 'b0000000-0000-4000-8000-000000000002', false);

-- ------------------------------------------------------------------ RIDERS --
-- Sign-up never creates riders (0023); approved riders are provisioned here like an admin would.
insert into public.delivery_partners (user_id, city_id, vehicle_type, status)
select id, 'a0000000-0000-4000-8000-000000000001', 'bike', 'active' from seed_users where role = 'rider'
on conflict (user_id) do nothing;
update public.delivery_partners dp set
  status = 'active', is_online = (n <= 6),
  vehicle_type = (array['bike','scooter','bike','bicycle','bike','scooter','bike','bike','scooter','bike'])[n]::public.vehicle_type,
  vehicle_number = 'RJ21' || (array['SA','SB','SC','SD','SE','SF','SG','SH','SJ','SK'])[n] || lpad((1000 + n * 137)::text, 4, '0'),
  license_number = 'RJ21 ' || (2015 + n) || lpad((n * 8231)::text, 7, '0'),
  aadhaar_last4 = lpad((n * 1234 % 10000)::text, 4, '0'),
  current_lat = 26.6486 + ((n * 41) % 60 - 30) * 0.0003, current_lng = 74.0334 + ((n * 67) % 60 - 30) * 0.0003,
  last_location_at = now() - (n || ' minutes')::interval,
  emergency_contact = '98290' || lpad((n * 111)::text, 5, '0')
from (select id, row_number() over (order by id) as n from seed_users where role = 'rider') su
where dp.user_id = su.id;

-- ------------------------------------------------------------------ COUPONS -
insert into public.coupons (code, title, description, type, value, min_order_amount, max_discount, first_order_only, usage_limit, per_user_limit, expires_at, category_id) values
('WELCOME50', 'Flat ₹50 off your first order', 'New to Merta Deal? Get ₹50 off on orders above ₹299.', 'fixed', 50, 299, null, true, 1000, 1, now() + interval '180 days', null),
('MERTA10', '10% off up to ₹75', 'Save 10% on every order above ₹399.', 'percentage', 10, 399, 75, false, null, 5, now() + interval '90 days', null),
('FRESH20', '20% off fruits & vegetables', 'Fresh from Merta mandi.', 'percentage', 20, 149, 60, false, 500, 3, now() + interval '30 days', 'c0000000-0000-4000-8000-000000000008'),
('FLAT30', 'Flat ₹30 off', 'On orders above ₹249.', 'fixed', 30, 249, null, false, 2000, 3, now() + interval '45 days', null),
('EXPIRED5', 'Old campaign', 'Expired coupon (for testing).', 'fixed', 5, 0, null, false, null, 1, now() - interval '1 day', null);

-- ------------------------------------------------------------------ BANNERS -
insert into public.banners (title, subtitle, cta_label, link_url, bg_color, text_color, placement, sort_order) values
('Merta Ki Shopping, Ab Online.', 'Kirana essentials delivered in 30–60 minutes across Merta City.', 'Shop now', '/c/grocery', '#0B6E4F', '#FFFFFF', 'home_hero', 1),
('Flat ₹50 off your first order', 'Use code WELCOME50 on orders above ₹299.', 'Claim offer', '/c/grocery?coupon=WELCOME50', '#F2A93B', '#1B1B1B', 'home_hero', 2),
('Asli Rajasthani masale', 'Mathania mirch, Nagauri methi & more — chakki-fresh.', 'Explore', '/c/masala-spices', '#B23A2E', '#FFFFFF', 'home_hero', 3),
('Free delivery above ₹499', 'Stock up on monthly ration and save on delivery.', 'Shop atta & dal', '/c/grocery', '#1F3A5F', '#FFFFFF', 'home_mid', 1);

insert into public.promotions (title, description, promo_type, category_id, discount_percent, sort_order) values
('Monthly Ration Bachat', 'Atta, dal, oil and sugar at wholesale-style prices.', 'collection', 'c0000000-0000-4000-8000-000000000001', null, 1),
('Rajasthan Local Picks', 'Ker sangri, papad, Mathania mirch — support Merta home makers.', 'collection', 'c0000000-0000-4000-8000-000000000012', null, 2);

-- -------------------------------------------------------------------- ORDERS
-- Helper to create a fully consistent historical order with items, payment, history, assignment.
create or replace function pg_temp.seed_order(
  p_customer uuid, p_items text[], p_qtys int[], p_status public.order_status, p_hours_ago numeric,
  p_pay public.payment_method, p_rider_n int default null, p_coupon text default null
) returns uuid language plpgsql as $$
declare
  v_addr public.addresses; v_oid uuid; v_no text; v_sub numeric := 0; v_mrp numeric := 0; v_cnt int := 0;
  v_pid uuid; v_inv public.inventory; i int; v_delivery numeric; v_platform numeric := 2; v_tax numeric; v_total numeric;
  v_created timestamptz := now() - (p_hours_ago * interval '1 hour'); v_rider uuid; v_aid uuid; v_dist numeric;
  v_coupon public.coupons; v_cdisc numeric := 0; v_zone public.delivery_zones; v_otp text; v_pstatus public.payment_status; v_earn numeric;
  v_plat double precision := (public.pickup_point() ->> 'lat')::double precision; v_plng double precision := (public.pickup_point() ->> 'lng')::double precision;
begin
  select * into v_addr from public.addresses where user_id = p_customer order by is_default desc limit 1;
  v_zone := public.find_zone(v_addr.pincode, v_addr.lat, v_addr.lng);
  v_no := public.generate_order_number();
  v_otp := lpad(((abs(('x' || substr(md5(v_no),1,8))::bit(32)::int)) % 10000)::text, 4, '0');
  v_dist := public.haversine_km(v_plat, v_plng, v_addr.lat, v_addr.lng);
  v_earn := 20 + ceil(v_dist) * 5;

  -- compute totals first
  for i in 1..array_length(p_items,1) loop
    select p.id into v_pid from public.products p where p.name = p_items[i] limit 1;
    select * into v_inv from public.inventory where product_id = v_pid;
    if v_inv.id is null then
      insert into public.inventory (product_id, selling_price, mrp, stock_qty) select v_pid, mrp, mrp, 25 from public.products where id = v_pid returning * into v_inv;
    end if;
    v_sub := v_sub + v_inv.selling_price * p_qtys[i]; v_mrp := v_mrp + v_inv.mrp * p_qtys[i]; v_cnt := v_cnt + p_qtys[i];
  end loop;
  if p_coupon is not null then
    select * into v_coupon from public.coupons where code = p_coupon;
    v_cdisc := least(case when v_coupon.type = 'percentage' then round(v_sub * v_coupon.value / 100, 2) else v_coupon.value end, coalesce(v_coupon.max_discount, 999999));
  end if;
  v_delivery := case when v_sub >= coalesce(v_zone.free_delivery_threshold, 499) then 0 else coalesce(v_zone.delivery_fee, 25) end;
  v_tax := round((v_delivery + v_platform) * 0.18, 2);
  v_total := v_sub - v_cdisc + v_delivery + v_platform + v_tax;
  v_pstatus := (case
    when p_status in ('cancelled','rejected') then (case when p_pay = 'cod' then 'cod_pending' else 'refunded' end)
    when p_pay = 'cod' then (case when p_status in ('delivered','completed') then 'cod_collected' else 'cod_pending' end)
    else 'paid' end)::public.payment_status;

  insert into public.orders (order_number, user_id, zone_id, status, delivery_type, address_snapshot, delivery_lat, delivery_lng, payment_method, payment_status,
    subtotal, item_discount, coupon_id, coupon_code, coupon_discount, delivery_fee, platform_fee, tax_amount, total, rider_earning, item_count, eta_minutes, promised_at,
    confirmed_at, ready_at, picked_up_at, delivered_at, completed_at, cancelled_at, created_at, updated_at, delivery_instructions)
  values (v_no, p_customer, v_zone.id, p_status, 'standard', to_jsonb(v_addr) - 'user_id', v_addr.lat, v_addr.lng, p_pay, v_pstatus,
    v_sub, v_mrp - v_sub, v_coupon.id, v_coupon.code, v_cdisc, v_delivery, v_platform, v_tax, v_total, v_earn, v_cnt, 45, v_created + interval '45 minutes',
    case when p_status not in ('placed','cancelled','rejected') then v_created + interval '3 minutes' end,
    case when p_status in ('ready_for_pickup','rider_assigned','out_for_delivery','delivered','completed') then v_created + interval '14 minutes' end,
    case when p_status in ('out_for_delivery','delivered','completed') then v_created + interval '22 minutes' end,
    case when p_status in ('delivered','completed') then v_created + interval '38 minutes' end,
    case when p_status = 'completed' then v_created + interval '2 hours' end,
    case when p_status in ('cancelled','rejected') then v_created + interval '6 minutes' end,
    v_created, v_created,
    (array['Ring the bell twice','Leave at the door','Call on arrival',null,'Gate is on the left'])[1 + (v_cnt % 5)])
  returning id into v_oid;

  insert into public.order_secrets (order_id, delivery_otp) values (v_oid, v_otp);

  for i in 1..array_length(p_items,1) loop
    select p.id into v_pid from public.products p where p.name = p_items[i] limit 1;
    select * into v_inv from public.inventory where product_id = v_pid;
    insert into public.order_items (order_id, product_id, inventory_id, product_name, brand_name, pack_label, image_url, quantity, unit_price, unit_mrp, line_total)
    select v_oid, p.id, v_inv.id, p.name, b.name, p.pack_label, p.image_url, p_qtys[i], v_inv.selling_price, v_inv.mrp, v_inv.selling_price * p_qtys[i]
    from public.products p left join public.brands b on b.id = p.brand_id where p.id = v_pid;
  end loop;

  insert into public.payments (order_id, user_id, provider, method, amount, status, provider_order_id, provider_payment_id, collected_by, collected_at, created_at)
  values (v_oid, p_customer, (case when p_pay = 'cod' then 'cod' when p_pay = 'wallet' then 'wallet' else 'razorpay' end)::public.payment_provider, p_pay, v_total, v_pstatus,
    case when p_pay <> 'cod' then 'order_seed_' || substr(v_oid::text,1,8) end, case when p_pay <> 'cod' and v_pstatus in ('paid','refunded') then 'pay_seed_' || substr(v_oid::text,1,8) end,
    case when p_pay = 'cod' and p_status in ('delivered','completed') then (select user_id from public.delivery_partners order by id offset coalesce(p_rider_n,1)-1 limit 1) end,
    case when p_pay = 'cod' and p_status in ('delivered','completed') then v_created + interval '38 minutes' end, v_created);

  -- history
  insert into public.order_status_history (order_id, status, actor_role, created_at) values (v_oid, 'placed', 'customer', v_created);
  if p_status = 'rejected' then insert into public.order_status_history (order_id, status, actor_role, note, created_at) values (v_oid, 'rejected', 'admin', 'Out of stock', v_created + interval '6 minutes'); end if;
  if p_status = 'cancelled' then insert into public.order_status_history (order_id, status, actor_role, note, created_at) values (v_oid, 'cancelled', 'customer', 'Ordered by mistake', v_created + interval '6 minutes'); end if;
  if p_status not in ('placed','cancelled','rejected') then insert into public.order_status_history (order_id, status, note, created_at) values (v_oid, 'confirmed', 'Confirmed automatically', v_created + interval '3 minutes'); end if;
  if p_status in ('preparing','ready_for_pickup','rider_assigned','out_for_delivery','delivered','completed') then insert into public.order_status_history (order_id, status, actor_role, created_at) values (v_oid, 'preparing', 'admin', v_created + interval '5 minutes'); end if;
  if p_status in ('ready_for_pickup','rider_assigned','out_for_delivery','delivered','completed') then insert into public.order_status_history (order_id, status, actor_role, created_at) values (v_oid, 'ready_for_pickup', 'admin', v_created + interval '14 minutes'); end if;
  if p_status in ('rider_assigned','out_for_delivery','delivered','completed') then insert into public.order_status_history (order_id, status, actor_role, created_at) values (v_oid, 'rider_assigned', 'rider', v_created + interval '15 minutes'); end if;
  if p_status in ('out_for_delivery','delivered','completed') then insert into public.order_status_history (order_id, status, actor_role, created_at) values (v_oid, 'out_for_delivery', 'rider', v_created + interval '22 minutes'); end if;
  if p_status in ('delivered','completed') then insert into public.order_status_history (order_id, status, actor_role, created_at) values (v_oid, 'delivered', 'rider', v_created + interval '38 minutes'); end if;
  if p_status = 'completed' then insert into public.order_status_history (order_id, status, actor_role, created_at) values (v_oid, 'completed', 'customer', v_created + interval '2 hours'); end if;

  -- assignment
  if p_rider_n is not null and p_status in ('ready_for_pickup','rider_assigned','out_for_delivery','delivered','completed') then
    select id into v_rider from public.delivery_partners order by id offset p_rider_n - 1 limit 1;
    insert into public.delivery_assignments (order_id, rider_id, status, offered_at, responded_at, expires_at, picked_up_at, delivered_at, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, earning, cod_amount, created_at)
    values (v_oid, v_rider,
      (case p_status when 'ready_for_pickup' then 'offered' when 'rider_assigned' then 'accepted' when 'out_for_delivery' then 'picked_up' else 'delivered' end)::public.assignment_status,
      v_created + interval '14 minutes',
      case when p_status <> 'ready_for_pickup' then v_created + interval '15 minutes' end,
      case when p_status = 'ready_for_pickup' then now() + interval '3 minutes' else v_created + interval '17 minutes' end,
      case when p_status in ('out_for_delivery','delivered','completed') then v_created + interval '22 minutes' end,
      case when p_status in ('delivered','completed') then v_created + interval '38 minutes' end,
      v_plat, v_plng, v_addr.lat, v_addr.lng, round(v_dist::numeric,2), v_earn, case when p_pay = 'cod' then v_total else 0 end, v_created + interval '14 minutes')
    returning id into v_aid;
    if p_status in ('delivered','completed') then
      update public.delivery_partners set total_deliveries = total_deliveries + 1, total_earnings = total_earnings + v_earn where id = v_rider;
    end if;
    -- GPS breadcrumbs for the live one (recorded by the rider's device in production)
    if p_status = 'out_for_delivery' then
      insert into public.delivery_locations (assignment_id, rider_id, lat, lng, accuracy_m, speed_mps, recorded_at)
      select v_aid, v_rider, v_plat + (v_addr.lat - v_plat) * k / 10.0, v_plng + (v_addr.lng - v_plng) * k / 10.0, 8, 6.5, v_created + interval '22 minutes' + (k * 40 || ' seconds')::interval
      from generate_series(0, 6) k;
    end if;
  end if;
  if p_status in ('delivered','completed') then
    update public.profiles set reward_points = reward_points + floor(v_sub/100) where id = p_customer;
    insert into public.reward_transactions (user_id, points, reason, order_id, created_at) values (p_customer, floor(v_sub/100), 'Order ' || v_no, v_oid, v_created + interval '38 minutes');
  end if;
  return v_oid;
end $$;

-- 20 orders across statuses (rider_n indexes delivery_partners ordered by id)
do $seed$ begin
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000001', array['Aashirvaad Shudh Chakki Atta','Tata Salt Iodised','Fortune Sunlite Refined Sunflower Oil','Sugar (Sulphurless)'], array[1,1,2,2], 'completed', 240, 'cod', 1, 'WELCOME50');
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000001', array['Mathania Red Chilli Powder','MDH Garam Masala','Catch Cumin Seeds (Jeera)','Merta Special Papad (Moong)'], array[1,1,1,2], 'completed', 120, 'upi', 2, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000001', array['Amul Taaza Toned Milk','Amul Masti Dahi','Amul Fresh Paneer'], array[2,1,1], 'delivered', 26, 'cod', 3, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000001', array['Red Label Tea','Parle-G Gold Biscuits','Haldiram''s Aloo Bhujia','Bisleri Mineral Water'], array[1,1,1,4], 'out_for_delivery', 0.6, 'cod', 1, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000002', array['Surf Excel Easy Wash Detergent Powder','Vim Dishwash Bar','Colgate Strong Teeth Toothpaste','Lifebuoy Total 10 Soap'], array[1,1,1,1], 'completed', 200, 'upi', 4, 'MERTA10');
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000003', array['Onion (Pyaz)','Potato (Aloo)','Tomato (Tamatar)','Coriander Leaves (Dhaniya Patta)','Green Chilli (Hari Mirch)'], array[2,2,1,1,1], 'delivered', 30, 'cod', 5, 'FRESH20');
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000004', array['Tata Sampann Toor Dal (Arhar)','Rajdhani Besan','India Gate Basmati Rice Classic'], array[2,1,1], 'completed', 300, 'cod', 2, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000005', array['Maggi 2-Minute Masala Noodles','Kurkure Masala Munch','Thums Up','Lay''s Magic Masala'], array[1,3,2,2], 'delivered', 50, 'card', 6, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000006', array['Pampers All Round Protection Pants M','Johnson''s Baby Wipes','Nestlé Cerelac Wheat Apple'], array[1,2,1], 'completed', 400, 'upi', 3, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000007', array['Ghadi Detergent Powder','Nirma Washing Powder','Harpic Power Plus Toilet Cleaner'], array[2,1,1], 'cancelled', 72, 'cod', null, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000008', array['Fortune Kachi Ghani Mustard Oil','Everest Turmeric Powder','Everest Coriander Powder','Tata Salt Iodised'], array[2,1,1,1], 'completed', 500, 'cod', 7, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000009', array['Aashirvaad Shudh Chakki Atta','Amul Pure Ghee'], array[1,1], 'rejected', 90, 'upi', null, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000010', array['Saras Gold Milk','Saras Dahi','Saras Desi Ghee'], array[4,2,1], 'delivered', 20, 'cod', 4, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000011', array['Dove Cream Beauty Bathing Bar','Clinic Plus Strong & Long Shampoo','Dabur Amla Hair Oil'], array[1,1,1], 'completed', 600, 'netbanking', 8, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000012', array['Ker Sangri (Dried)','Rajasthani Mirchi Achar (Pickle)','Nagauri Methi Dana'], array[1,1,2], 'completed', 150, 'upi', 1, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000013', array['Daawat Rozana Super Basmati','Tata Sampann Moong Dal','Kabuli Chana','Rajma Chitra'], array[1,1,1,1], 'preparing', 0.3, 'cod', null, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000014', array['Cadbury Dairy Milk Silk','Britannia Good Day Cashew Cookies','Real Mixed Fruit Juice'], array[2,1,1], 'confirmed', 0.2, 'upi', null, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000015', array['Fortune Chakki Fresh Atta','Chana Dal (Loose)','Gemini Refined Soyabean Oil','Sugar (Sulphurless)'], array[1,1,1,1], 'placed', 0.1, 'cod', null, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000016', array['Banana (Kela)','Apple Shimla','Pomegranate (Anar)','Lemon (Nimbu)'], array[1,1,1,1], 'ready_for_pickup', 0.4, 'cod', 6, null);
  perform pg_temp.seed_order('30000000-0000-4000-8000-000000000017', array['Tata Tea Gold','Parle-G Original','Britannia Marie Gold','Bru Instant Coffee'], array[1,2,1,1], 'rider_assigned', 0.5, 'upi', 2, null);
end $seed$;

-- ------------------------------------------------------------------ REVIEWS -
insert into public.reviews (user_id, order_id, target, product_id, rider_id, rating, title, comment, status, created_at)
select o.user_id, o.id, 'product', oi.product_id, null, 5, 'Best atta', 'Rotis come out really soft. Same as market price with home delivery.', 'approved', o.delivered_at + interval '1 hour'
from public.orders o join public.order_items oi on oi.order_id = o.id and oi.product_name = 'Aashirvaad Shudh Chakki Atta'
where o.user_id = '30000000-0000-4000-8000-000000000001' and o.status = 'completed' limit 1;
insert into public.reviews (user_id, order_id, target, product_id, rider_id, rating, title, comment, status, created_at)
select o.user_id, o.id, 'delivery', null, a.rider_id, 5, 'Polite rider', 'Rider called before arriving and handled the milk carefully.', 'approved', o.delivered_at + interval '2 hours'
from public.orders o join public.delivery_assignments a on a.order_id = o.id where o.user_id = '30000000-0000-4000-8000-000000000001' and o.status = 'completed' limit 1;
insert into public.reviews (user_id, order_id, target, product_id, rider_id, rating, title, comment, status, created_at)
select o.user_id, o.id, 'product', oi.product_id, null, 4, 'Asli Mathania taste', 'Colour and heat are exactly like the one we bring from Jodhpur.', 'approved', o.delivered_at + interval '3 hours'
from public.orders o join public.order_items oi on oi.order_id = o.id and oi.product_name = 'Mathania Red Chilli Powder' where o.status = 'completed' limit 1;
insert into public.reviews (user_id, order_id, target, product_id, rider_id, rating, title, comment, status, created_at)
select o.user_id, o.id, 'delivery', null, a.rider_id, 4, 'Quick delivery', 'Sabzi was fresh and came in 30 minutes. Tomatoes slightly soft but overall good.', 'pending', o.delivered_at + interval '1 hour'
from public.orders o join public.delivery_assignments a on a.order_id = o.id and a.status = 'delivered' where o.user_id = '30000000-0000-4000-8000-000000000003' and o.status = 'delivered' limit 1;
insert into public.reviews (user_id, order_id, target, product_id, rider_id, rating, title, comment, status, created_at)
select o.user_id, o.id, 'product', oi.product_id, null, 2, 'Packet was dented', 'Tea packet came slightly dented. Taste fine though.', 'pending', o.delivered_at + interval '1 hour'
from public.orders o join public.order_items oi on oi.order_id = o.id and oi.product_name = 'Red Label Tea' where o.status in ('delivered','completed') limit 1;

-- ------------------------------------------------------------- NOTIFICATIONS
insert into public.notifications (user_id, type, title, body, data, is_read, created_at)
select o.user_id, 'order_status', 'Out for delivery', format('Order %s is on its way. Share the OTP with the rider at delivery.', o.order_number), jsonb_build_object('order_id', o.id, 'status', o.status), false, o.picked_up_at
from public.orders o where o.status = 'out_for_delivery';
insert into public.notifications (user_id, type, title, body, data, is_read, created_at)
select o.user_id, 'order_status', 'Order delivered', format('Order %s was delivered. Please rate your experience.', o.order_number), jsonb_build_object('order_id', o.id, 'status', o.status), true, o.delivered_at
from public.orders o where o.status in ('delivered','completed');
insert into public.notifications (user_id, type, title, body, data, is_read, created_at) values
('30000000-0000-4000-8000-000000000001', 'promo', 'Flat ₹30 off this weekend', 'Use FLAT30 on orders above ₹249. Valid till Sunday.', '{"coupon":"FLAT30"}', false, now() - interval '5 hours');
insert into public.notifications (user_id, type, title, body, data, is_read, created_at)
select pr.id, 'new_order', 'New order ' || o.order_number, format('%s items · ₹%s · %s', o.item_count, o.total, upper(o.payment_method::text)), jsonb_build_object('order_id', o.id), false, o.created_at
from public.orders o cross join public.profiles pr where pr.role in ('admin','super_admin') and o.status in ('placed','confirmed','preparing');
insert into public.notifications (user_id, type, title, body, data, is_read, created_at)
select dp.user_id, 'delivery_offer', 'New delivery request', format('Pickup from %s · Earn ₹%s', public.pickup_point() ->> 'name', a.earning), jsonb_build_object('assignment_id', a.id, 'order_id', o.id), false, a.offered_at
from public.delivery_assignments a join public.orders o on o.id = a.order_id join public.delivery_partners dp on dp.id = a.rider_id where a.status = 'offered';

-- ------------------------------------------------------------------ SUPPORT -
insert into public.support_tickets (user_id, order_id, subject, category, status, priority)
select '30000000-0000-4000-8000-000000000007', o.id, 'Cancelled order still showing COD due', 'order', 'open', 'medium' from public.orders o where o.user_id = '30000000-0000-4000-8000-000000000007' limit 1;
insert into public.support_messages (ticket_id, sender_id, message, is_staff)
select t.id, t.user_id, 'I cancelled my order but the app still shows amount due. Please check.', false from public.support_tickets t limit 1;
insert into public.support_tickets (user_id, subject, category, status, priority) values
('30000000-0000-4000-8000-000000000009', 'My order was rejected — when will the refund come?', 'refund', 'in_progress', 'high');
insert into public.support_messages (ticket_id, sender_id, message, is_staff)
select t.id, '10000000-0000-4000-8000-000000000002', 'Hi Irfan, the refund for your UPI payment has been initiated and will reflect in 5-7 working days.', true
from public.support_tickets t where t.user_id = '30000000-0000-4000-8000-000000000009';

-- Wallet demo balance for the demo customer
update public.profiles set wallet_balance = 150 where id = '30000000-0000-4000-8000-000000000001';
insert into public.wallet_transactions (user_id, type, amount, balance_after, description) values
('30000000-0000-4000-8000-000000000001', 'cashback', 150, 150, 'Welcome cashback');

-- Wishlist for demo customer
insert into public.wishlists (user_id, product_id) select '30000000-0000-4000-8000-000000000001', id from public.products where name in ('Amul Pure Ghee','Ker Sangri (Dried)','Happilo Premium Almonds');

-- Rebuild search vectors (brand/category joins) & keep popularity in sync with sales
update public.products set updated_at = now();
drop table if exists seed_users;

-- BEGIN GENERATED PRODUCT IMAGES (scripts/product-images/4-publish.ts) — do not edit by hand
-- Product photos live in public/products/ (see manifest.json for source + licence). Keyed by product slug.
-- Products absent from this list have no photo we would put in front of a customer; their cards show the neutral tile.
update public.products set image_url = null where image_url like '/products/%' and slug not in ('aashirvaad-shudh-chakki-atta-10-kg', 'amul-butter-pasteurised-100-g', 'amul-masti-dahi-400-g', 'amul-fresh-paneer-200-g', 'aashirvaad-shudh-chakki-atta-5-kg', 'amul-gold-full-cream-milk-500-ml', 'amul-pure-ghee-1-l', 'bisleri-mineral-water-1-l', 'bikaji-bikaneri-bhujia-400-g', 'britannia-good-day-cashew-cookies-600-g', 'britannia-marie-gold-600-g', 'cadbury-dairy-milk-silk-60-g', 'coca-cola-750-ml', 'dabur-amla-hair-oil-275-ml', 'everest-garam-masala-100-g', 'everest-chhole-masala-100-g', 'fortune-sunlite-refined-sunflower-oil-1-l', 'frooti-mango-drink-600-ml', 'parle-g-original-250-g', 'parle-g-gold-biscuits-1-kg', 'patanjali-honey-500-g', 'sunfeast-dark-fantasy-choco-fills-300-g', 'tata-rock-salt-sendha-namak-1-kg', 'tata-sampann-moong-dal-1-kg', 'amul-cheese-slices-10-slices', 'amul-butter-pasteurised-500-g', 'amul-cheese-cubes-200-g', 'kurkure-masala-munch-90-g', 'lay-s-classic-salted-73-g', 'lay-s-magic-masala-73-g', 'maggi-2-minute-masala-noodles-70-g', 'mdh-kitchen-king-masala-100-g', 'saffola-gold-oil-1-l', 'saras-dahi-500-g', 'tata-sampann-toor-dal-arhar-1-kg', 'tata-tea-gold-500-g', 'thums-up-750-ml', 'apple-shimla-1-kg', 'banana-kela-1-dozen', 'cashew-w320-250-g', 'coriander-leaves-dhaniya-patta-100-g', 'desi-gud-chikki-peanut-250-g', 'garbage-bags-medium-30-bags', 'ginger-adrak-250-g', 'ker-sangri-dried-250-g', 'masoor-dal-loose-1-kg', 'mathania-red-chilli-powder-250-g', 'merta-dairy-desi-ghee-bilona-500-g', 'mustard-seeds-rai-200-g', 'nagauri-methi-dana-200-g', 'onion-pyaz-1-kg', 'pomegranate-anar-500-g', 'rajasthani-mirchi-achar-pickle-500-g', 'spinach-palak-250-g', 'tomato-tamatar-1-kg', 'sugar-sulphurless-5-kg', 'sugar-sulphurless-1-kg', 'oreo-vanilla-creme-120-g', 'cauliflower-gobhi-1-pc', 'nescafe-classic-coffee-50-g', 'maida-all-purpose-flour-1-kg', 'tata-salt-iodised-1-kg', 'colgate-strong-teeth-toothpaste-200-g', 'surf-excel-easy-wash-detergent-powder-1-kg', 'vim-dishwash-bar-pack-of-3', 'aluminium-foil-9-m-9-m', 'amul-taaza-toned-milk-500-ml', 'bikano-moong-dal-namkeen-400-g', 'bru-instant-coffee-100-g', 'cadbury-dairy-milk-23-g', 'chana-dal-loose-1-kg', 'clinic-plus-strong-long-shampoo-340-ml', 'closeup-ever-fresh-red-hot-150-g', 'cloves-laung-50-g', 'colgate-zigzag-toothbrush-pack-of-4', 'dabur-chyawanprash-500-g', 'dettol-original-soap-pack-of-4', 'dhara-groundnut-oil-1-l', 'everest-coriander-powder-200-g', 'everest-cumin-powder-100-g', 'everest-tikhalal-red-chilli-powder-200-g', 'everest-turmeric-powder-200-g', 'fortune-chakki-fresh-atta-5-kg', 'fortune-everyday-basmati-rice-1-kg', 'gemini-refined-soyabean-oil-1-l', 'ghadi-detergent-powder-1-kg', 'gillette-mach3-razor-1-razor', 'green-cardamom-elaichi-50-g', 'green-chilli-hari-mirch-100-g', 'green-moong-whole-1-kg', 'haldiram-s-aloo-bhujia-400-g', 'haldiram-s-navrattan-mixture-400-g', 'happilo-premium-almonds-250-g', 'harpic-power-plus-toilet-cleaner-1-l', 'himalaya-baby-powder-200-g', 'india-gate-basmati-rice-classic-5-kg', 'johnson-s-baby-wipes-72-wipes', 'kinley-water-1-l', 'lakme-9to5-compact-9-g', 'lifebuoy-total-10-soap-pack-of-4', 'mamypoko-pants-extra-absorb-l-44-pants', 'mdh-deggi-mirch-100-g', 'merta-local-chakki-atta-sharbati-5-kg', 'milton-thermosteel-flask-1-l-1-l', 'nestle-cerelac-wheat-apple-300-g', 'nestle-kitkat-4-finger-38-5-g', 'nirma-washing-powder-1-kg', 'nivea-soft-moisturising-cream-200-ml', 'pantene-hair-fall-control-shampoo-340-ml', 'papaya-1-pc-approx-1-kg', 'patanjali-jaggery-gud-1-kg', 'pepsi-750-ml', 'potato-aloo-1-kg', 'rajdhani-besan-1-kg', 'rajma-chitra-1-kg', 'santoor-sandal-turmeric-soap-pack-of-4', 'saras-desi-ghee-500-ml', 'saras-gold-milk-500-ml', 'saras-taaza-toned-milk-1-l', 'sprite-750-ml', 'suji-rava-1-kg', 'taj-mahal-tea-250-g', 'uncle-chipps-spicy-treat-55-g', 'whisper-ultra-clean-xl-30-pads', 'whole-black-pepper-kali-mirch-100-g');
update public.products set image_url = '/products/aashirvaad-shudh-chakki-atta-10-kg.b9d665f6.webp' where slug = 'aashirvaad-shudh-chakki-atta-10-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/amul-butter-pasteurised-100-g.9c65c4e9.webp' where slug = 'amul-butter-pasteurised-100-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/amul-masti-dahi-400-g.5c3474c1.webp' where slug = 'amul-masti-dahi-400-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/amul-fresh-paneer-200-g.ab519b5d.webp' where slug = 'amul-fresh-paneer-200-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/aashirvaad-shudh-chakki-atta-5-kg.b9d665f6.webp' where slug = 'aashirvaad-shudh-chakki-atta-5-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/amul-gold-full-cream-milk-500-ml.8c31ff5d.webp' where slug = 'amul-gold-full-cream-milk-500-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/amul-pure-ghee-1-l.caeecdd6.webp' where slug = 'amul-pure-ghee-1-l' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/bisleri-mineral-water-1-l.dcfe6a3d.webp' where slug = 'bisleri-mineral-water-1-l' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/bikaji-bikaneri-bhujia-400-g.0f547ffe.webp' where slug = 'bikaji-bikaneri-bhujia-400-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/britannia-good-day-cashew-cookies-600-g.33c80c7e.webp' where slug = 'britannia-good-day-cashew-cookies-600-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/britannia-marie-gold-600-g.195cfcde.webp' where slug = 'britannia-marie-gold-600-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/cadbury-dairy-milk-silk-60-g.3ce2f066.webp' where slug = 'cadbury-dairy-milk-silk-60-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/coca-cola-750-ml.365733e1.webp' where slug = 'coca-cola-750-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/dabur-amla-hair-oil-275-ml.e8865223.webp' where slug = 'dabur-amla-hair-oil-275-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/everest-garam-masala-100-g.3867be61.webp' where slug = 'everest-garam-masala-100-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/everest-chhole-masala-100-g.0f266a2f.webp' where slug = 'everest-chhole-masala-100-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/fortune-sunlite-refined-sunflower-oil-1-l.473cd174.webp' where slug = 'fortune-sunlite-refined-sunflower-oil-1-l' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/frooti-mango-drink-600-ml.a7779904.webp' where slug = 'frooti-mango-drink-600-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/parle-g-original-250-g.5ec48581.webp' where slug = 'parle-g-original-250-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/parle-g-gold-biscuits-1-kg.46eeee23.webp' where slug = 'parle-g-gold-biscuits-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/patanjali-honey-500-g.f7b342b7.webp' where slug = 'patanjali-honey-500-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/sunfeast-dark-fantasy-choco-fills-300-g.f5a73ebc.webp' where slug = 'sunfeast-dark-fantasy-choco-fills-300-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/tata-rock-salt-sendha-namak-1-kg.47b2837e.webp' where slug = 'tata-rock-salt-sendha-namak-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/tata-sampann-moong-dal-1-kg.191e8168.webp' where slug = 'tata-sampann-moong-dal-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/amul-cheese-slices-10-slices.feacc5ec.webp' where slug = 'amul-cheese-slices-10-slices' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/amul-butter-pasteurised-500-g.d721eed8.webp' where slug = 'amul-butter-pasteurised-500-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/amul-cheese-cubes-200-g.6c0a1dd1.webp' where slug = 'amul-cheese-cubes-200-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/kurkure-masala-munch-90-g.dd0de618.webp' where slug = 'kurkure-masala-munch-90-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/lay-s-classic-salted-73-g.bc7f1a07.webp' where slug = 'lay-s-classic-salted-73-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/lay-s-magic-masala-73-g.1b0899d9.webp' where slug = 'lay-s-magic-masala-73-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/maggi-2-minute-masala-noodles-70-g.7d0dc7ba.webp' where slug = 'maggi-2-minute-masala-noodles-70-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/mdh-kitchen-king-masala-100-g.91957c8e.webp' where slug = 'mdh-kitchen-king-masala-100-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/saffola-gold-oil-1-l.46c12c4d.webp' where slug = 'saffola-gold-oil-1-l' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/saras-dahi-500-g.79476eae.webp' where slug = 'saras-dahi-500-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/tata-sampann-toor-dal-arhar-1-kg.213103f1.webp' where slug = 'tata-sampann-toor-dal-arhar-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/tata-tea-gold-500-g.911a2291.webp' where slug = 'tata-tea-gold-500-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/thums-up-750-ml.57829d5c.webp' where slug = 'thums-up-750-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/apple-shimla-1-kg.62cc538a.webp' where slug = 'apple-shimla-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/banana-kela-1-dozen.204dcb06.webp' where slug = 'banana-kela-1-dozen' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/cashew-w320-250-g.9a985a15.webp' where slug = 'cashew-w320-250-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/coriander-leaves-dhaniya-patta-100-g.6ddf7e2c.webp' where slug = 'coriander-leaves-dhaniya-patta-100-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/desi-gud-chikki-peanut-250-g.a096ce92.webp' where slug = 'desi-gud-chikki-peanut-250-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/garbage-bags-medium-30-bags.d55d01b1.webp' where slug = 'garbage-bags-medium-30-bags' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/ginger-adrak-250-g.cc84a42e.webp' where slug = 'ginger-adrak-250-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/ker-sangri-dried-250-g.0e174958.webp' where slug = 'ker-sangri-dried-250-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/masoor-dal-loose-1-kg.494f4d9a.webp' where slug = 'masoor-dal-loose-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/mathania-red-chilli-powder-250-g.baa4cceb.webp' where slug = 'mathania-red-chilli-powder-250-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/merta-dairy-desi-ghee-bilona-500-g.4688d4d8.webp' where slug = 'merta-dairy-desi-ghee-bilona-500-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/mustard-seeds-rai-200-g.ee1d0ee4.webp' where slug = 'mustard-seeds-rai-200-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/nagauri-methi-dana-200-g.f4676f15.webp' where slug = 'nagauri-methi-dana-200-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/onion-pyaz-1-kg.bdfd329d.webp' where slug = 'onion-pyaz-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/pomegranate-anar-500-g.04c5df83.webp' where slug = 'pomegranate-anar-500-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/rajasthani-mirchi-achar-pickle-500-g.ac7f86d5.webp' where slug = 'rajasthani-mirchi-achar-pickle-500-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/spinach-palak-250-g.fa304a64.webp' where slug = 'spinach-palak-250-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/tomato-tamatar-1-kg.d6b22046.webp' where slug = 'tomato-tamatar-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/sugar-sulphurless-5-kg.a66bb55f.webp' where slug = 'sugar-sulphurless-5-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/sugar-sulphurless-1-kg.f5330755.webp' where slug = 'sugar-sulphurless-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/oreo-vanilla-creme-120-g.fabce42e.webp' where slug = 'oreo-vanilla-creme-120-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/cauliflower-gobhi-1-pc.28d03c9f.webp' where slug = 'cauliflower-gobhi-1-pc' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/nescafe-classic-coffee-50-g.e5d0389c.webp' where slug = 'nescafe-classic-coffee-50-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/maida-all-purpose-flour-1-kg.737ca857.webp' where slug = 'maida-all-purpose-flour-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/tata-salt-iodised-1-kg.48cb64f9.webp' where slug = 'tata-salt-iodised-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/colgate-strong-teeth-toothpaste-200-g.10ce87f9.webp' where slug = 'colgate-strong-teeth-toothpaste-200-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/surf-excel-easy-wash-detergent-powder-1-kg.da8f31a1.webp' where slug = 'surf-excel-easy-wash-detergent-powder-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/vim-dishwash-bar-pack-of-3.1f07b11d.webp' where slug = 'vim-dishwash-bar-pack-of-3' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/aluminium-foil-9-m-9-m.299fd767.webp' where slug = 'aluminium-foil-9-m-9-m' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/amul-taaza-toned-milk-500-ml.5e1ef830.webp' where slug = 'amul-taaza-toned-milk-500-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/bikano-moong-dal-namkeen-400-g.9269fd68.webp' where slug = 'bikano-moong-dal-namkeen-400-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/bru-instant-coffee-100-g.b90198dc.webp' where slug = 'bru-instant-coffee-100-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/cadbury-dairy-milk-23-g.0b462e28.webp' where slug = 'cadbury-dairy-milk-23-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/chana-dal-loose-1-kg.d919c20a.webp' where slug = 'chana-dal-loose-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/clinic-plus-strong-long-shampoo-340-ml.ff93534f.webp' where slug = 'clinic-plus-strong-long-shampoo-340-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/closeup-ever-fresh-red-hot-150-g.f0691d80.webp' where slug = 'closeup-ever-fresh-red-hot-150-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/cloves-laung-50-g.2107d09b.webp' where slug = 'cloves-laung-50-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/colgate-zigzag-toothbrush-pack-of-4.76933a2b.webp' where slug = 'colgate-zigzag-toothbrush-pack-of-4' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/dabur-chyawanprash-500-g.f675aeb3.webp' where slug = 'dabur-chyawanprash-500-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/dettol-original-soap-pack-of-4.52199942.webp' where slug = 'dettol-original-soap-pack-of-4' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/dhara-groundnut-oil-1-l.1e55006f.webp' where slug = 'dhara-groundnut-oil-1-l' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/everest-coriander-powder-200-g.adcc10bf.webp' where slug = 'everest-coriander-powder-200-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/everest-cumin-powder-100-g.ae3a0dff.webp' where slug = 'everest-cumin-powder-100-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/everest-tikhalal-red-chilli-powder-200-g.8c535594.webp' where slug = 'everest-tikhalal-red-chilli-powder-200-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/everest-turmeric-powder-200-g.e18bb00b.webp' where slug = 'everest-turmeric-powder-200-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/fortune-chakki-fresh-atta-5-kg.466e15ff.webp' where slug = 'fortune-chakki-fresh-atta-5-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/fortune-everyday-basmati-rice-1-kg.a36e856f.webp' where slug = 'fortune-everyday-basmati-rice-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/gemini-refined-soyabean-oil-1-l.be966503.webp' where slug = 'gemini-refined-soyabean-oil-1-l' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/ghadi-detergent-powder-1-kg.99806a32.webp' where slug = 'ghadi-detergent-powder-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/gillette-mach3-razor-1-razor.efb7daa8.webp' where slug = 'gillette-mach3-razor-1-razor' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/green-cardamom-elaichi-50-g.6877b920.webp' where slug = 'green-cardamom-elaichi-50-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/green-chilli-hari-mirch-100-g.6e8a6ba7.webp' where slug = 'green-chilli-hari-mirch-100-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/green-moong-whole-1-kg.3bf74006.webp' where slug = 'green-moong-whole-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/haldiram-s-aloo-bhujia-400-g.0ae55997.webp' where slug = 'haldiram-s-aloo-bhujia-400-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/haldiram-s-navrattan-mixture-400-g.0ceba7e5.webp' where slug = 'haldiram-s-navrattan-mixture-400-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/happilo-premium-almonds-250-g.fdda67b3.webp' where slug = 'happilo-premium-almonds-250-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/harpic-power-plus-toilet-cleaner-1-l.76224e07.webp' where slug = 'harpic-power-plus-toilet-cleaner-1-l' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/himalaya-baby-powder-200-g.e4aade5f.webp' where slug = 'himalaya-baby-powder-200-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/india-gate-basmati-rice-classic-5-kg.94ee8ce1.webp' where slug = 'india-gate-basmati-rice-classic-5-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/johnson-s-baby-wipes-72-wipes.03b9feef.webp' where slug = 'johnson-s-baby-wipes-72-wipes' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/kinley-water-1-l.26cbd772.webp' where slug = 'kinley-water-1-l' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/lakme-9to5-compact-9-g.8b716d33.webp' where slug = 'lakme-9to5-compact-9-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/lifebuoy-total-10-soap-pack-of-4.bf8819e1.webp' where slug = 'lifebuoy-total-10-soap-pack-of-4' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/mamypoko-pants-extra-absorb-l-44-pants.6d1fbe75.webp' where slug = 'mamypoko-pants-extra-absorb-l-44-pants' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/mdh-deggi-mirch-100-g.8ecf980a.webp' where slug = 'mdh-deggi-mirch-100-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/merta-local-chakki-atta-sharbati-5-kg.93133d06.webp' where slug = 'merta-local-chakki-atta-sharbati-5-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/milton-thermosteel-flask-1-l-1-l.773473da.webp' where slug = 'milton-thermosteel-flask-1-l-1-l' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/nestle-cerelac-wheat-apple-300-g.153547fe.webp' where slug = 'nestle-cerelac-wheat-apple-300-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/nestle-kitkat-4-finger-38-5-g.1cadd477.webp' where slug = 'nestle-kitkat-4-finger-38-5-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/nirma-washing-powder-1-kg.e08c19cb.webp' where slug = 'nirma-washing-powder-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/nivea-soft-moisturising-cream-200-ml.4215ab4d.webp' where slug = 'nivea-soft-moisturising-cream-200-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/pantene-hair-fall-control-shampoo-340-ml.483015f8.webp' where slug = 'pantene-hair-fall-control-shampoo-340-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/papaya-1-pc-approx-1-kg.9259c6e2.webp' where slug = 'papaya-1-pc-approx-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/patanjali-jaggery-gud-1-kg.b12b848a.webp' where slug = 'patanjali-jaggery-gud-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/pepsi-750-ml.702d84e1.webp' where slug = 'pepsi-750-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/potato-aloo-1-kg.52bda7a7.webp' where slug = 'potato-aloo-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/rajdhani-besan-1-kg.9490ec2c.webp' where slug = 'rajdhani-besan-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/rajma-chitra-1-kg.cdf3c3da.webp' where slug = 'rajma-chitra-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/santoor-sandal-turmeric-soap-pack-of-4.d16b0d86.webp' where slug = 'santoor-sandal-turmeric-soap-pack-of-4' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/saras-desi-ghee-500-ml.8a5eed92.webp' where slug = 'saras-desi-ghee-500-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/saras-gold-milk-500-ml.a9ac7862.webp' where slug = 'saras-gold-milk-500-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/saras-taaza-toned-milk-1-l.04638638.webp' where slug = 'saras-taaza-toned-milk-1-l' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/sprite-750-ml.74104ac8.webp' where slug = 'sprite-750-ml' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/suji-rava-1-kg.c6cf486c.webp' where slug = 'suji-rava-1-kg' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/taj-mahal-tea-250-g.dd4aa953.webp' where slug = 'taj-mahal-tea-250-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/uncle-chipps-spicy-treat-55-g.68b7f6d4.webp' where slug = 'uncle-chipps-spicy-treat-55-g' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/whisper-ultra-clean-xl-30-pads.385844bf.webp' where slug = 'whisper-ultra-clean-xl-30-pads' and (image_url is null or image_url like '/products/%');
update public.products set image_url = '/products/whole-black-pepper-kali-mirch-100-g.04a81b02.webp' where slug = 'whole-black-pepper-kali-mirch-100-g' and (image_url is null or image_url like '/products/%');
update public.order_items oi set image_url = p.image_url from public.products p where p.id = oi.product_id and oi.image_url is null;
-- END GENERATED PRODUCT IMAGES
