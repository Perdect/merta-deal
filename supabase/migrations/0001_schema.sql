-- ============================================================================
-- MERTA DEAL — Core schema
-- Hyperlocal grocery marketplace for Merta City, Rajasthan (expandable to other cities)
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;
create extension if not exists "unaccent" with schema extensions;

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('customer','store_owner','store_staff','rider','admin','super_admin');
create type public.store_status as enum ('pending','active','suspended','closed');
create type public.store_staff_role as enum ('manager','staff');
create type public.document_status as enum ('pending','verified','rejected');
create type public.inventory_status as enum ('in_stock','low_stock','out_of_stock');
create type public.address_type as enum ('home','work','other');
create type public.cart_status as enum ('active','converted','abandoned');
create type public.order_status as enum (
  'placed','store_confirmed','preparing','ready_for_pickup','rider_assigned',
  'out_for_delivery','delivered','completed','cancelled','rejected'
);
create type public.delivery_type as enum ('express','standard','scheduled');
create type public.payment_method as enum ('cod','upi','card','netbanking','wallet','razorpay');
create type public.payment_status as enum ('pending','authorized','paid','failed','refunded','partially_refunded','cod_pending','cod_collected');
create type public.payment_provider as enum ('cod','razorpay','wallet');
create type public.coupon_type as enum ('percentage','fixed');
create type public.rider_status as enum ('pending','active','suspended');
create type public.vehicle_type as enum ('bicycle','bike','scooter','auto','van');
create type public.assignment_status as enum ('offered','accepted','rejected','expired','picked_up','delivered','cancelled');
create type public.review_target as enum ('product','store','delivery');
create type public.review_status as enum ('pending','approved','rejected');
create type public.notification_channel as enum ('in_app','push','whatsapp','sms','email');
create type public.ticket_status as enum ('open','in_progress','resolved','closed');
create type public.ticket_priority as enum ('low','medium','high','urgent');
create type public.payout_status as enum ('pending','processing','paid','failed');
create type public.banner_placement as enum ('home_hero','home_mid','category','checkout');
create type public.wallet_txn_type as enum ('credit','debit','refund','cashback');

-- ----------------------------------------------------------------------------
-- UTILITIES
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Haversine distance in kilometres
create or replace function public.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371.0 * 2 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    )
  );
$$;

create or replace function public.slugify(txt text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(extensions.unaccent(txt)), '[^a-z0-9]+', '-', 'g'));
$$;

-- ----------------------------------------------------------------------------
-- CITIES & DELIVERY ZONES (serviceability is data, not code)
-- ----------------------------------------------------------------------------
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  state text not null default 'Rajasthan',
  center_lat double precision not null,
  center_lng double precision not null,
  is_active boolean not null default false,
  launch_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  area text not null,
  pincode text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_km numeric(6,2) not null default 5,
  delivery_fee numeric(10,2) not null default 25,
  min_order_amount numeric(10,2) not null default 99,
  free_delivery_threshold numeric(10,2) not null default 499,
  eta_min_minutes int not null default 30,
  eta_max_minutes int not null default 60,
  express_supported boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_zones_pincode_check check (pincode ~ '^[1-9][0-9]{5}$')
);
create index delivery_zones_pincode_idx on public.delivery_zones(pincode) where is_active;
create index delivery_zones_city_idx on public.delivery_zones(city_id);

-- ----------------------------------------------------------------------------
-- PROFILES (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'customer',
  full_name text,
  phone text,
  email text,
  avatar_url text,
  city_id uuid references public.cities(id),
  wallet_balance numeric(12,2) not null default 0 check (wallet_balance >= 0),
  reward_points int not null default 0 check (reward_points >= 0),
  referral_code text unique,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role);
create index profiles_phone_idx on public.profiles(phone);

-- ----------------------------------------------------------------------------
-- STORES
-- ----------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  city_id uuid not null references public.cities(id),
  zone_id uuid references public.delivery_zones(id),
  name text not null,
  slug text not null unique,
  tagline text,
  description text,
  owner_name text not null,
  phone text not null,
  email text,
  address_line1 text not null,
  address_line2 text,
  area text not null,
  landmark text,
  pincode text not null,
  lat double precision not null,
  lng double precision not null,
  gstin text,
  pan text,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  upi_id text,
  logo_url text,
  cover_url text,
  photos text[] not null default '{}',
  delivery_radius_km numeric(6,2) not null default 5,
  min_order_amount numeric(10,2),
  commission_rate numeric(5,2),               -- null => platform default from settings
  status public.store_status not null default 'pending',
  is_open boolean not null default true,
  opening_time time not null default '07:00',
  closing_time time not null default '22:00',
  avg_prep_minutes int not null default 15,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  total_orders int not null default 0,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stores_owner_idx on public.stores(owner_id);
create index stores_city_status_idx on public.stores(city_id, status);
create index stores_geo_idx on public.stores(lat, lng);
create index stores_name_trgm_idx on public.stores using gin (name extensions.gin_trgm_ops);

create table public.store_staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.store_staff_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, user_id)
);
create index store_staff_user_idx on public.store_staff(user_id);

create table public.store_documents (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  doc_type text not null,                         -- gst_certificate, pan_card, fssai, shop_license, bank_proof, owner_id
  file_path text not null,                        -- Supabase Storage path (store-documents bucket)
  status public.document_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index store_documents_store_idx on public.store_documents(store_id);

create table public.store_commissions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  rate numeric(5,2) not null check (rate >= 0 and rate <= 100),
  effective_from date not null default current_date,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index store_commissions_store_idx on public.store_commissions(store_id, effective_from desc);

-- ----------------------------------------------------------------------------
-- CATALOG
-- ----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  icon text,                    -- lucide icon name
  image_url text,
  color text,                   -- accent hex for tiles
  sort_order int not null default 0,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_parent_idx on public.categories(parent_id);
create index categories_active_sort_idx on public.categories(is_active, sort_order);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  brand_id uuid references public.brands(id) on delete set null,
  category_id uuid not null references public.categories(id) on delete restrict,
  created_by_store_id uuid references public.stores(id) on delete set null, -- store-created SKUs
  description text,
  ingredients text,
  nutrition jsonb,              -- {"energy_kcal": 340, "protein_g": 12, ...}
  manufacturer text,
  country_of_origin text default 'India',
  weight_value numeric(10,3) not null,
  weight_unit text not null default 'g',   -- g, kg, ml, l, pcs, pack
  pack_label text,               -- "1 kg", "500 ml", "Pack of 6"
  mrp numeric(10,2) not null check (mrp >= 0),
  image_url text,
  images text[] not null default '{}',
  tags text[] not null default '{}',
  synonyms text[] not null default '{}',   -- hinglish / regional names: {"aata","flour"}
  is_local boolean not null default false, -- "Local Products" of Merta
  is_veg boolean not null default true,
  is_active boolean not null default true,
  is_approved boolean not null default true, -- admin approval for store-created SKUs
  popularity_score int not null default 0,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products(category_id) where is_active;
create index products_brand_idx on public.products(brand_id);
create index products_popularity_idx on public.products(popularity_score desc);
create index products_created_idx on public.products(created_at desc);
create index products_search_idx on public.products using gin (search_vector);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index products_local_idx on public.products(is_local) where is_local;

-- Search synonyms (admin-manageable): term -> canonical
create table public.search_synonyms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  canonical text not null,
  created_at timestamptz not null default now()
);
create index search_synonyms_canonical_idx on public.search_synonyms(canonical);

create or replace function public.products_search_vector_update()
returns trigger language plpgsql as $$
declare
  v_brand text;
  v_cat text;
begin
  select b.name into v_brand from public.brands b where b.id = new.brand_id;
  select c.name into v_cat from public.categories c where c.id = new.category_id;
  new.search_vector :=
    setweight(to_tsvector('simple', extensions.unaccent(coalesce(new.name,''))), 'A') ||
    setweight(to_tsvector('simple', extensions.unaccent(coalesce(array_to_string(new.synonyms,' '),''))), 'A') ||
    setweight(to_tsvector('simple', extensions.unaccent(coalesce(v_brand,''))), 'B') ||
    setweight(to_tsvector('simple', extensions.unaccent(coalesce(v_cat,''))), 'B') ||
    setweight(to_tsvector('simple', extensions.unaccent(coalesce(array_to_string(new.tags,' '),''))), 'C') ||
    setweight(to_tsvector('simple', extensions.unaccent(coalesce(new.description,''))), 'D');
  return new;
end $$;
create trigger products_search_vector_trg
before insert or update of name, synonyms, tags, description, brand_id, category_id on public.products
for each row execute function public.products_search_vector_update();

-- Per-store stock & price
create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  selling_price numeric(10,2) not null check (selling_price >= 0),
  mrp numeric(10,2) not null check (mrp >= 0),
  stock_qty int not null default 0 check (stock_qty >= 0),
  low_stock_threshold int not null default 5,
  max_order_qty int not null default 10,
  status public.inventory_status not null default 'in_stock',
  is_active boolean not null default true,
  sold_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, product_id),
  constraint inventory_price_lte_mrp check (selling_price <= mrp)
);
create index inventory_product_idx on public.inventory(product_id) where is_active;
create index inventory_store_status_idx on public.inventory(store_id, status);
create index inventory_price_idx on public.inventory(selling_price);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  delta int not null,
  reason text not null,          -- order, cancel_restock, manual_adjust, restock, damage
  reference_id uuid,             -- order id etc.
  actor_id uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);
create index inventory_movements_inv_idx on public.inventory_movements(inventory_id, created_at desc);

-- ----------------------------------------------------------------------------
-- CUSTOMER DATA
-- ----------------------------------------------------------------------------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.address_type not null default 'home',
  label text,
  full_name text not null,
  phone text not null,
  house text not null,
  street text not null,
  area text not null,
  landmark text,
  city text not null default 'Merta City',
  state text not null default 'Rajasthan',
  pincode text not null,
  lat double precision,
  lng double precision,
  zone_id uuid references public.delivery_zones(id),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addresses_pincode_check check (pincode ~ '^[1-9][0-9]{5}$'),
  constraint addresses_phone_check check (phone ~ '^[6-9][0-9]{9}$')
);
create index addresses_user_idx on public.addresses(user_id);

create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- ----------------------------------------------------------------------------
-- COUPONS
-- ----------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  type public.coupon_type not null,
  value numeric(10,2) not null check (value > 0),
  min_order_amount numeric(10,2) not null default 0,
  max_discount numeric(10,2),
  first_order_only boolean not null default false,
  store_id uuid references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  usage_limit int,                        -- total redemptions
  per_user_limit int not null default 1,
  used_count int not null default 0,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coupons_active_idx on public.coupons(is_active, expires_at);

-- ----------------------------------------------------------------------------
-- CARTS
-- ----------------------------------------------------------------------------
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  coupon_id uuid references public.coupons(id) on delete set null,
  status public.cart_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index carts_one_active_per_user on public.carts(user_id) where status = 'active';

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, inventory_id)
);
create index cart_items_cart_idx on public.cart_items(cart_id);

-- ----------------------------------------------------------------------------
-- ORDERS
-- ----------------------------------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  zone_id uuid references public.delivery_zones(id),
  status public.order_status not null default 'placed',
  delivery_type public.delivery_type not null default 'standard',
  scheduled_slot_start timestamptz,
  scheduled_slot_end timestamptz,
  address_snapshot jsonb not null,     -- immutable copy of delivery address
  delivery_lat double precision,
  delivery_lng double precision,
  delivery_instructions text,
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  subtotal numeric(10,2) not null default 0,
  item_discount numeric(10,2) not null default 0,   -- mrp - selling price savings
  coupon_id uuid references public.coupons(id),
  coupon_code text,
  coupon_discount numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  platform_fee numeric(10,2) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  commission_rate numeric(5,2) not null default 0,
  commission_amount numeric(10,2) not null default 0,
  store_payout_amount numeric(10,2) not null default 0,
  rider_earning numeric(10,2) not null default 0,
  item_count int not null default 0,
  eta_minutes int,
  promised_at timestamptz,
  store_confirmed_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancel_reason text,
  reject_reason text,
  customer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders(user_id, created_at desc);
create index orders_store_status_idx on public.orders(store_id, status, created_at desc);
create index orders_status_idx on public.orders(status) where status not in ('completed','cancelled','rejected');
create index orders_created_idx on public.orders(created_at desc);

-- Delivery OTP kept separate so it never leaks to store/rider via row reads
create table public.order_secrets (
  order_id uuid primary key references public.orders(id) on delete cascade,
  delivery_otp text not null,
  otp_attempts int not null default 0,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  inventory_id uuid references public.inventory(id) on delete set null,
  product_name text not null,
  brand_name text,
  pack_label text,
  image_url text,
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  unit_mrp numeric(10,2) not null,
  line_total numeric(10,2) not null,
  created_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_product_idx on public.order_items(product_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  actor_id uuid references public.profiles(id),
  actor_role public.user_role,
  note text,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history(order_id, created_at);

-- ----------------------------------------------------------------------------
-- PAYMENTS
-- ----------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  provider public.payment_provider not null,
  method public.payment_method not null,
  amount numeric(10,2) not null,
  currency text not null default 'INR',
  status public.payment_status not null default 'pending',
  provider_order_id text,        -- razorpay order_xxx
  provider_payment_id text,      -- razorpay pay_xxx
  provider_signature text,
  failure_reason text,
  refund_amount numeric(10,2) not null default 0,
  refund_required boolean not null default false,
  refund_id text,
  raw_response jsonb,
  collected_by uuid references public.profiles(id),   -- rider for COD
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments(order_id);
create index payments_provider_order_idx on public.payments(provider_order_id);

create table public.coupon_usage (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  discount_amount numeric(10,2) not null,
  created_at timestamptz not null default now(),
  unique (order_id)
);
create index coupon_usage_user_idx on public.coupon_usage(coupon_id, user_id);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.wallet_txn_type not null,
  amount numeric(12,2) not null check (amount > 0),
  balance_after numeric(12,2) not null,
  description text not null,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);
create index wallet_transactions_user_idx on public.wallet_transactions(user_id, created_at desc);

create table public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  points int not null,
  reason text not null,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);
create index reward_transactions_user_idx on public.reward_transactions(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- DELIVERY
-- ----------------------------------------------------------------------------
create table public.delivery_partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  city_id uuid references public.cities(id),
  vehicle_type public.vehicle_type not null default 'bike',
  vehicle_number text,
  license_number text,
  aadhaar_last4 text,
  status public.rider_status not null default 'pending',
  is_online boolean not null default false,
  current_lat double precision,
  current_lng double precision,
  last_location_at timestamptz,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  total_deliveries int not null default 0,
  total_earnings numeric(12,2) not null default 0,
  emergency_contact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index delivery_partners_online_idx on public.delivery_partners(is_online, status) where is_online and status = 'active';

create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  rider_id uuid not null references public.delivery_partners(id) on delete cascade,
  status public.assignment_status not null default 'offered',
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '3 minutes'),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  pickup_lat double precision,
  pickup_lng double precision,
  drop_lat double precision,
  drop_lng double precision,
  distance_km numeric(6,2),
  earning numeric(10,2) not null default 0,
  cod_amount numeric(10,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index delivery_assignments_order_idx on public.delivery_assignments(order_id);
create index delivery_assignments_rider_status_idx on public.delivery_assignments(rider_id, status);
create unique index delivery_assignments_one_live_per_order on public.delivery_assignments(order_id)
  where status in ('offered','accepted','picked_up');

create table public.delivery_locations (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references public.delivery_assignments(id) on delete cascade,
  rider_id uuid not null references public.delivery_partners(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  heading double precision,
  speed_mps double precision,
  recorded_at timestamptz not null default now()
);
create index delivery_locations_assignment_idx on public.delivery_locations(assignment_id, recorded_at desc);

-- ----------------------------------------------------------------------------
-- REVIEWS
-- ----------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  target public.review_target not null,
  product_id uuid references public.products(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  rider_id uuid references public.delivery_partners(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  title text,
  comment text,
  status public.review_status not null default 'pending',
  moderated_by uuid references public.profiles(id),
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_target_check check (
    (target = 'product' and product_id is not null) or
    (target = 'store' and store_id is not null) or
    (target = 'delivery' and rider_id is not null)
  )
);
create index reviews_product_idx on public.reviews(product_id, status);
create index reviews_store_idx on public.reviews(store_id, status);
create index reviews_status_idx on public.reviews(status);
create unique index reviews_one_per_order_target on public.reviews(order_id, target, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,                 -- order_placed, order_status, low_stock, new_order, delivery_offer, ...
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  channels public.notification_channel[] not null default '{in_app}',
  is_read boolean not null default false,
  sent_push boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, is_read, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- ----------------------------------------------------------------------------
-- MARKETING
-- ----------------------------------------------------------------------------
create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  cta_label text,
  link_url text,
  image_url text,
  bg_color text default '#0B6E4F',
  text_color text default '#FFFFFF',
  placement public.banner_placement not null default 'home_hero',
  sort_order int not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  city_id uuid references public.cities(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index banners_placement_idx on public.banners(placement, is_active, sort_order);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  promo_type text not null default 'collection',  -- collection, flash_sale, bogo
  product_ids uuid[] not null default '{}',
  category_id uuid references public.categories(id) on delete set null,
  discount_percent numeric(5,2),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PAYOUTS, SUPPORT, AUDIT, SETTINGS
-- ----------------------------------------------------------------------------
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_sales numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  adjustments numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0,
  order_count int not null default 0,
  status public.payout_status not null default 'pending',
  reference_no text,
  paid_at timestamptz,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payouts_store_idx on public.payouts(store_id, period_start desc);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  subject text not null,
  category text not null default 'general',   -- order, payment, delivery, refund, account, general
  status public.ticket_status not null default 'open',
  priority public.ticket_priority not null default 'medium',
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets(user_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets(status, priority);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  message text not null,
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages(ticket_id, created_at);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role public.user_role,
  action text not null,           -- insert/update/delete or domain action e.g. order.status_change
  entity text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity, entity_id);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create table public.settings (
  key text primary key,
  value jsonb not null,
  "group" text not null default 'general',
  label text not null,
  description text,
  is_public boolean not null default false,   -- readable by anon/customers (e.g. free delivery threshold)
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- WhatsApp ordering (inbound log + parsed intent). Integration is real (Meta Cloud API) but config-gated.
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text unique,
  from_phone text not null,
  profile_name text,
  body text,
  message_type text not null default 'text',
  direction text not null default 'inbound',   -- inbound / outbound
  parsed_items jsonb,
  matched_user_id uuid references public.profiles(id),
  cart_id uuid references public.carts(id),
  status text not null default 'received',     -- received, parsed, cart_created, replied, failed
  error text,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index whatsapp_messages_phone_idx on public.whatsapp_messages(from_phone, created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'cities','delivery_zones','profiles','stores','store_documents','categories','brands','products',
    'inventory','addresses','coupons','carts','cart_items','orders','payments','delivery_partners',
    'delivery_assignments','reviews','banners','promotions','payouts','support_tickets'
  ]) loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;
