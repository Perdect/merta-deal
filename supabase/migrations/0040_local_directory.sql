-- ============================================================================
-- MERTA DEAL — Local directory: hotels, restaurants and bakeries in Merta City.
-- Nothing is seeded: every profile comes from a real business and an admin decision.
-- Rules the database enforces, whatever the admin screen does:
--  * only complete, contact-verified, non-duplicate profiles can be published (trigger);
--  * only hotels can offer rooms; delivering businesses must state coverage, charge and time;
--  * visitors see published profiles only; owner contact details in requests are admin-only.
-- Independent of 0036-0039. Idempotent.
-- ============================================================================
create table if not exists public.local_businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category text not null check (category in ('hotel', 'restaurant', 'bakery')),
  name text not null,
  description text,
  logo_url text,
  photos text[] not null default '{}',
  address_line text,
  area text,
  pincode text,
  lat double precision,
  lng double precision,
  phone text,
  whatsapp text,
  -- {"mon":{"open":"09:00","close":"22:00"},...}; a missing day means closed.
  opening_hours jsonb,
  hours_verified boolean not null default false,
  facilities text[] not null default '{}',
  cuisines text[] not null default '{}',
  veg_type text not null default 'not_stated' check (veg_type in ('pure_veg', 'veg_options', 'not_stated')),
  offers_rooms boolean not null default false,
  accepts_delivery boolean not null default false,
  delivery_coverage text,
  delivery_charge text,
  delivery_eta text,
  order_confirmation text not null default 'business_approval' check (order_confirmation in ('immediate', 'business_approval')),
  is_paid_placement boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  duplicate_of uuid references public.local_businesses (id) on delete set null,
  contact_verified_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint local_businesses_rooms_only_hotels check (category = 'hotel' or not offers_rooms),
  constraint local_businesses_not_self_duplicate check (duplicate_of is null or duplicate_of <> id)
);
create index if not exists local_businesses_listing_idx on public.local_businesses (category, status, is_paid_placement desc, name);

create table if not exists public.business_menu_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.local_businesses (id) on delete cascade,
  section text,
  name text not null,
  description text,
  price numeric(10, 2) check (price is null or price >= 0),
  is_veg boolean,
  is_available boolean not null default true,
  -- A catalogue product makes the item orderable through the normal cart and checkout.
  product_id uuid references public.products (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists business_menu_items_business_idx on public.business_menu_items (business_id, sort_order);

create table if not exists public.business_listing_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'new' check (kind in ('new', 'update')),
  business_id uuid references public.local_businesses (id) on delete set null,
  business_name text not null,
  category text not null check (category in ('hotel', 'restaurant', 'bakery')),
  owner_name text not null,
  owner_phone text not null,
  whatsapp text,
  address text not null,
  details text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists business_listing_requests_status_idx on public.business_listing_requests (status, created_at desc);
create index if not exists business_listing_requests_phone_idx on public.business_listing_requests (owner_phone, created_at desc);

insert into public.settings (key, value, "group", label, description, is_public) values
('business_listing_daily_limit', '3', 'orders', 'Business listing requests per phone per day', 'Stops one number from flooding the approval list.', false),
('business_listing_global_daily_limit', '50', 'orders', 'Business listing requests per day, all visitors', 'A ceiling against automated spam on the public form.', false)
on conflict (key) do nothing;

/** What a profile still needs before it can go public. Empty means it is ready. */
create or replace function public.business_missing_fields(b public.local_businesses)
returns text[] language plpgsql stable set search_path = public as $$
declare v text[] := '{}';
begin
  if char_length(coalesce(btrim(b.description), '')) < 40 then v := array_append(v, 'description (at least 40 characters)'); end if;
  if coalesce(btrim(b.address_line), '') = '' then v := array_append(v, 'address'); end if;
  if coalesce(btrim(b.phone), '') = '' then v := array_append(v, 'phone number'); end if;
  if b.contact_verified_at is null then v := array_append(v, 'contact check'); end if;
  if b.duplicate_of is not null then v := array_append(v, 'not a duplicate'); end if;
  if b.accepts_delivery and (coalesce(btrim(b.delivery_coverage), '') = '' or coalesce(btrim(b.delivery_charge), '') = '' or coalesce(btrim(b.delivery_eta), '') = '') then
    v := array_append(v, 'delivery coverage, charge and time');
  end if;
  return v;
end $$;

create or replace function public.guard_business_publish()
returns trigger language plpgsql set search_path = public as $$
declare v_missing text[];
begin
  new.updated_at := now();
  if new.status = 'published' then
    v_missing := public.business_missing_fields(new);
    if array_length(v_missing, 1) > 0 then raise exception 'BUSINESS_INCOMPLETE: Still needed: %', array_to_string(v_missing, ', '); end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;
drop trigger if exists local_businesses_guard on public.local_businesses;
create trigger local_businesses_guard before insert or update on public.local_businesses for each row execute function public.guard_business_publish();

alter table public.local_businesses enable row level security;
alter table public.business_menu_items enable row level security;
alter table public.business_listing_requests enable row level security;
revoke all on public.local_businesses, public.business_menu_items, public.business_listing_requests from anon, authenticated;
grant select on public.local_businesses, public.business_menu_items to anon, authenticated;
grant insert, update, delete on public.local_businesses, public.business_menu_items to authenticated;
grant select on public.business_listing_requests to authenticated;

drop policy if exists local_businesses_public_read on public.local_businesses;
create policy local_businesses_public_read on public.local_businesses for select using ((status = 'published' and duplicate_of is null) or public.is_admin());
drop policy if exists local_businesses_admin_write on public.local_businesses;
create policy local_businesses_admin_write on public.local_businesses for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists business_menu_public_read on public.business_menu_items;
create policy business_menu_public_read on public.business_menu_items for select using (public.is_admin() or exists (select 1 from public.local_businesses b where b.id = business_id and b.status = 'published' and b.duplicate_of is null));
drop policy if exists business_menu_admin_write on public.business_menu_items;
create policy business_menu_admin_write on public.business_menu_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists business_requests_admin_read on public.business_listing_requests;
create policy business_requests_admin_read on public.business_listing_requests for select using (public.is_admin());

/** "List Your Business" and profile change requests. Creates nothing public. */
create or replace function public.submit_business_listing(
  p_business_name text, p_category text, p_owner_name text, p_owner_phone text, p_address text,
  p_whatsapp text default null, p_details text default null, p_kind text default 'new', p_business_slug text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_business text := btrim(coalesce(p_business_name, ''));
  v_owner text := btrim(coalesce(p_owner_name, ''));
  v_phone text := btrim(coalesce(p_owner_phone, ''));
  v_address text := btrim(coalesce(p_address, ''));
  v_whatsapp text := nullif(btrim(coalesce(p_whatsapp, '')), '');
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_kind text := coalesce(p_kind, 'new');
  v_target uuid;
begin
  if v_kind not in ('new', 'update') then raise exception 'LISTING: Choose a valid request.'; end if;
  if p_category is null or p_category not in ('hotel', 'restaurant', 'bakery') then raise exception 'LISTING: Choose hotel, restaurant or bakery.'; end if;
  if char_length(v_business) not between 2 and 120 then raise exception 'LISTING: Enter the business name.'; end if;
  if char_length(v_owner) not between 2 and 80 then raise exception 'LISTING: Enter your name.'; end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'LISTING: Enter a 10-digit mobile number.'; end if;
  if v_whatsapp is not null and v_whatsapp !~ '^[6-9][0-9]{9}$' then raise exception 'LISTING: Enter a 10-digit WhatsApp number.'; end if;
  if char_length(v_address) not between 5 and 300 then raise exception 'LISTING: Enter the business address.'; end if;
  if char_length(coalesce(v_details, '')) > 2000 then raise exception 'LISTING: That is too long. Please shorten it.'; end if;
  if v_kind = 'update' then
    select id into v_target from public.local_businesses where slug = p_business_slug and status = 'published';
    if v_target is null then raise exception 'LISTING: We could not find that business.'; end if;
  end if;

  if (select count(*) from public.business_listing_requests where owner_phone = v_phone and created_at > now() - interval '1 day') >= public.get_setting_num('business_listing_daily_limit', 3)
    or (select count(*) from public.business_listing_requests where created_at > now() - interval '1 day') >= public.get_setting_num('business_listing_global_daily_limit', 50) then
    raise exception 'LISTING: We already have your request. Please call us if you need to change it.';
  end if;

  insert into public.business_listing_requests (kind, business_id, business_name, category, owner_name, owner_phone, whatsapp, address, details)
  values (v_kind, v_target, v_business, p_category, v_owner, v_phone, v_whatsapp, v_address, v_details);
  perform public.notify_admins('business_listing', 'New business listing request', v_business, jsonb_build_object('url', '/admin/businesses?tab=requests'));
  return jsonb_build_object('received', true);
end $$;
revoke execute on function public.submit_business_listing(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_business_listing(text, text, text, text, text, text, text, text, text) to anon, authenticated;

/** Approving a new request makes an unpublished draft to complete and verify; it never publishes. */
create or replace function public.admin_review_listing(p_id uuid, p_approve boolean, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.business_listing_requests; v_slug text; v_base text; v_business uuid; n int := 1;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v from public.business_listing_requests where id = p_id for update;
  if v.id is null then raise exception 'LISTING: This request no longer exists.'; end if;
  if v.status <> 'pending' then raise exception 'LISTING: This request has already been reviewed.'; end if;
  v_business := v.business_id;
  if p_approve and v.kind = 'new' then
    v_base := coalesce(nullif(btrim(regexp_replace(lower(v.business_name), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'business');
    v_slug := v_base;
    while exists (select 1 from public.local_businesses where slug = v_slug) loop n := n + 1; v_slug := v_base || '-' || n; end loop;
    insert into public.local_businesses (slug, category, name, description, address_line, phone, whatsapp, created_by, updated_by)
    values (v_slug, v.category, v.business_name, v.details, v.address, v.owner_phone, v.whatsapp, auth.uid(), auth.uid())
    returning id into v_business;
  end if;
  update public.business_listing_requests
     set status = case when p_approve then 'approved' else 'rejected' end, review_note = nullif(btrim(coalesce(p_note, '')), ''), reviewed_by = auth.uid(), reviewed_at = now(), business_id = v_business
   where id = p_id;
  perform public.audit('business_listing.review', 'business_listing_requests', p_id::text, null, jsonb_build_object('approved', p_approve, 'business_id', v_business));
  return v_business;
end $$;
revoke execute on function public.admin_review_listing(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_listing(uuid, boolean, text) to authenticated;
