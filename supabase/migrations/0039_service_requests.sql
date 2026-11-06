-- ============================================================================
-- MERTA DEAL — Service requests (gift, sweets, food and cake orders, urgent delivery, bulk quotations,
-- pickup and drop).
-- These services are confirmed by a person: the customer sends a request from a public page, the team
-- checks stock, rider and charge, then calls back. Nothing here books a rider or takes payment.
-- Requests are readable only by admins; visitors can only submit through submit_service_request.
-- Also adds the business facts the public pages and search data show only once they are filled in.
-- Independent of 0036-0038. Idempotent.
-- ============================================================================
create sequence if not exists public.service_request_seq;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default ('SR-' || lpad(nextval('public.service_request_seq')::text, 5, '0')),
  kind text not null check (kind in ('gift_order', 'sweets_order', 'food_order', 'cake_order', 'delivery_order', 'bulk_quote', 'pickup_drop')),
  status text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'completed', 'cancelled')),
  customer_name text not null,
  customer_phone text not null,
  item_type text not null,
  quantity text,
  occasion text,
  pickup_location text,
  drop_location text not null,
  destination text not null default 'home' check (destination in ('home', 'hotel', 'office', 'other')),
  place_name text,
  place_detail text,
  via_reception boolean not null default false,
  recipient_name text,
  recipient_phone text,
  gift_message text,
  context text,
  preferred_at timestamptz,
  urgency text not null default 'today' check (urgency in ('asap', 'today', 'scheduled')),
  notes text,
  quoted_charge numeric(10, 2) check (quoted_charge is null or quoted_charge >= 0),
  admin_note text,
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_requests_status_idx on public.service_requests (status, created_at desc);
create index if not exists service_requests_phone_idx on public.service_requests (customer_phone, created_at desc);
create index if not exists service_requests_created_idx on public.service_requests (created_at desc);

alter table public.service_requests enable row level security;
revoke all on public.service_requests from anon, authenticated;
grant select on public.service_requests to authenticated;
drop policy if exists service_requests_admin_read on public.service_requests;
create policy service_requests_admin_read on public.service_requests for select using (public.is_admin());
revoke all on sequence public.service_request_seq from anon, authenticated;

insert into public.settings (key, value, "group", label, description, is_public) values
('business_street_address', '""', 'general', 'Business street address', 'Shown on the service pages and in search data. Leave empty until it is confirmed; only the city and pincode are shown until then.', true),
('google_business_profile_url', '""', 'general', 'Google Business Profile link', 'Full https link to the profile. Listed in search data once filled in.', true),
('fssai_license_no', '""', 'general', 'FSSAI licence number', 'Shown on the gifts, sweets and bulk pages once filled in.', true),
('business_hours_confirmed', 'false', 'business', 'Publish hours in search data', 'Turn on once the opening hours above are correct. The pages always show them; search data lists them only when this is on.', true),
('pickup_drop_min_charge', '0', 'delivery', 'Pickup and drop: starting charge (₹)', 'Shown on the delivery boy page as "from ₹X". 0 shows no figure and says the charge is confirmed before booking.', true),
('service_request_hourly_limit', '5', 'orders', 'Service requests per phone per hour', 'Stops one number from flooding the requests list.', false),
('service_request_global_hourly_limit', '60', 'orders', 'Service requests per hour, all visitors', 'A ceiling against automated spam on the public forms.', false)
on conflict (key) do nothing;

/** Public entry point. Validates everything, limits repeat submissions, and tells the admins. */
create or replace function public.submit_service_request(
  p_kind text, p_name text, p_phone text, p_item_type text, p_drop text,
  p_pickup text default null, p_quantity text default null, p_occasion text default null,
  p_preferred_at timestamptz default null, p_urgency text default 'today', p_notes text default null,
  p_destination text default 'home', p_place_name text default null, p_place_detail text default null, p_via_reception boolean default false,
  p_recipient_name text default null, p_recipient_phone text default null, p_gift_message text default null, p_context text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_item text := btrim(coalesce(p_item_type, ''));
  v_drop text := btrim(coalesce(p_drop, ''));
  v_pickup text := nullif(btrim(coalesce(p_pickup, '')), '');
  v_quantity text := nullif(btrim(coalesce(p_quantity, '')), '');
  v_occasion text := nullif(btrim(coalesce(p_occasion, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_place text := nullif(btrim(coalesce(p_place_name, '')), '');
  v_detail text := nullif(btrim(coalesce(p_place_detail, '')), '');
  v_rname text := nullif(btrim(coalesce(p_recipient_name, '')), '');
  v_rphone text := nullif(btrim(coalesce(p_recipient_phone, '')), '');
  v_gift text := nullif(btrim(coalesce(p_gift_message, '')), '');
  v_context text := nullif(btrim(coalesce(p_context, '')), '');
  v_destination text := coalesce(p_destination, 'home');
  v_urgency text := coalesce(p_urgency, 'today');
  v_number text; v_id uuid; v_label text;
begin
  if p_kind is null or p_kind not in ('gift_order', 'sweets_order', 'food_order', 'cake_order', 'delivery_order', 'bulk_quote', 'pickup_drop') then raise exception 'SERVICE_REQUEST: Choose what you need.'; end if;
  if v_urgency not in ('asap', 'today', 'scheduled') then raise exception 'SERVICE_REQUEST: Choose how soon you need this.'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'SERVICE_REQUEST: Enter your name.'; end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'SERVICE_REQUEST: Enter a 10-digit mobile number.'; end if;
  if char_length(v_item) not between 2 and 200 then raise exception 'SERVICE_REQUEST: Tell us what you need.'; end if;
  if char_length(v_drop) not between 3 and 300 then raise exception 'SERVICE_REQUEST: Enter the delivery location.'; end if;
  if p_kind = 'pickup_drop' and (v_pickup is null or char_length(v_pickup) < 3) then raise exception 'SERVICE_REQUEST: Enter the pickup location.'; end if;
  if p_kind = 'bulk_quote' and v_quantity is null then raise exception 'SERVICE_REQUEST: Tell us roughly how many you need.'; end if;
  if v_destination not in ('home', 'hotel', 'office', 'other') then raise exception 'SERVICE_REQUEST: Choose where it is going.'; end if;
  if v_destination = 'hotel' and v_place is null then raise exception 'SERVICE_REQUEST: Enter the hotel name.'; end if;
  if v_destination = 'office' and v_place is null then raise exception 'SERVICE_REQUEST: Enter the company name.'; end if;
  if v_rphone is not null and v_rphone !~ '^[6-9][0-9]{9}$' then raise exception 'SERVICE_REQUEST: Enter a 10-digit mobile number for the receiver.'; end if;
  if v_urgency = 'scheduled' and p_preferred_at is null then raise exception 'SERVICE_REQUEST: Choose a preferred date and time.'; end if;
  if p_preferred_at is not null and p_preferred_at < now() - interval '1 hour' then raise exception 'SERVICE_REQUEST: The preferred time has already passed.'; end if;
  if char_length(coalesce(v_pickup, '')) > 300 or char_length(coalesce(v_quantity, '')) > 100 or char_length(coalesce(v_occasion, '')) > 100 or char_length(coalesce(v_notes, '')) > 1000
    or char_length(coalesce(v_place, '')) > 120 or char_length(coalesce(v_detail, '')) > 120 or char_length(coalesce(v_rname, '')) > 80 or char_length(coalesce(v_gift, '')) > 200 or char_length(coalesce(v_context, '')) > 120 then
    raise exception 'SERVICE_REQUEST: That is too long. Please shorten it.';
  end if;

  if (select count(*) from public.service_requests where customer_phone = v_phone and created_at > now() - interval '1 hour') >= public.get_setting_num('service_request_hourly_limit', 5)
    or (select count(*) from public.service_requests where created_at > now() - interval '1 hour') >= public.get_setting_num('service_request_global_hourly_limit', 60) then
    raise exception 'SERVICE_REQUEST: We already have your request. Please call or WhatsApp us if it is urgent.';
  end if;

  insert into public.service_requests (kind, customer_name, customer_phone, item_type, quantity, occasion, pickup_location, drop_location, preferred_at, urgency, notes, user_id,
    destination, place_name, place_detail, via_reception, recipient_name, recipient_phone, gift_message, context)
  values (p_kind, v_name, v_phone, v_item, v_quantity, v_occasion, v_pickup, v_drop, p_preferred_at, v_urgency, v_notes, auth.uid(),
    v_destination, v_place, v_detail, coalesce(p_via_reception, false), v_rname, v_rphone, v_gift, v_context)
  returning id, request_number into v_id, v_number;

  v_label := case p_kind when 'gift_order' then 'Gift order' when 'sweets_order' then 'Sweets order' when 'food_order' then 'Food order' when 'cake_order' then 'Cake order' when 'delivery_order' then 'Urgent delivery' when 'bulk_quote' then 'Bulk quotation' else 'Pickup and drop' end;
  perform public.notify_admins('service_request', 'New service request', v_label || ' request ' || v_number || (case when v_urgency = 'asap' then ' (as soon as possible)' else '' end), jsonb_build_object('request_id', v_id, 'url', '/admin/requests?view=' || v_id));
  return jsonb_build_object('request_number', v_number);
end $$;

revoke execute on function public.submit_service_request(text, text, text, text, text, text, text, text, timestamptz, text, text, text, text, text, boolean, text, text, text, text) from public;
grant execute on function public.submit_service_request(text, text, text, text, text, text, text, text, timestamptz, text, text, text, text, text, boolean, text, text, text, text) to anon, authenticated;

/** Status, the charge told to the customer, and an internal note. Records who handled it. */
create or replace function public.admin_update_service_request(p_id uuid, p_status text, p_quoted_charge numeric default null, p_admin_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before public.service_requests;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('new', 'contacted', 'confirmed', 'completed', 'cancelled') then raise exception 'SERVICE_REQUEST: Choose a valid status.'; end if;
  if p_quoted_charge is not null and p_quoted_charge < 0 then raise exception 'SERVICE_REQUEST: The charge cannot be negative.'; end if;
  select * into v_before from public.service_requests where id = p_id for update;
  if not found then raise exception 'SERVICE_REQUEST: This request no longer exists.'; end if;
  update public.service_requests
     set status = p_status, quoted_charge = p_quoted_charge, admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
         handled_by = auth.uid(), handled_at = now(), updated_at = now()
   where id = p_id;
  perform public.audit('service_request.update', 'service_requests', p_id::text,
    jsonb_build_object('status', v_before.status, 'quoted_charge', v_before.quoted_charge),
    jsonb_build_object('status', p_status, 'quoted_charge', p_quoted_charge));
end $$;

revoke execute on function public.admin_update_service_request(uuid, text, numeric, text) from public, anon;
grant execute on function public.admin_update_service_request(uuid, text, numeric, text) to authenticated;
