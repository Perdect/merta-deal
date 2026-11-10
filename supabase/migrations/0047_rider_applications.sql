-- Rider applications (0047): "Deliver with Merta Deal" no longer needs an account. A visitor leaves their
-- details (name, mobile, email, vehicle, documents); admins see the application under Riders, call to
-- verify, and create the rider's email + password sign-in from it (Admin → Riders → Applications → Create
-- rider). Nothing here grants any role: only the admin's createRiderAction does, and only after review.

create table public.rider_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) between 2 and 80),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  vehicle_type public.vehicle_type not null default 'bike',
  vehicle_number text check (vehicle_number is null or vehicle_number ~ '^[A-Z0-9 -]{4,15}$'),
  license_number text check (license_number is null or length(license_number) <= 30),
  aadhaar_last4 text check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$'),
  emergency_contact text check (emergency_contact is null or emergency_contact ~ '^[6-9][0-9]{9}$'),
  note text check (note is null or length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'created', 'declined')),
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index rider_applications_status_idx on public.rider_applications(status, created_at desc);
alter table public.rider_applications enable row level security;
create policy rider_applications_admin_read on public.rider_applications for select using (public.is_admin());

/** Public: leave a delivery partner application. Returns the application id. */
create or replace function public.submit_rider_application(p_full_name text, p_phone text, p_email text, p_vehicle_type text default 'bike', p_vehicle_number text default null, p_license_number text default null, p_aadhaar_last4 text default null, p_emergency_contact text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10); v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_full_name, '')); v_vehicle public.vehicle_type; v_id uuid;
  v_vnum text := nullif(upper(regexp_replace(coalesce(p_vehicle_number, ''), '[^A-Za-z0-9 -]', '', 'g')), '');
  v_emg text := nullif(right(regexp_replace(coalesce(p_emergency_contact, ''), '\D', '', 'g'), 10), '');
begin
  if length(v_name) < 2 then raise exception 'RIDER_APPLY: Enter your name.'; end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'RIDER_APPLY: Enter a valid 10-digit mobile number.'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'RIDER_APPLY: Enter a valid email address. It becomes your sign-in.'; end if;
  begin v_vehicle := coalesce(nullif(btrim(p_vehicle_type), ''), 'bike')::public.vehicle_type; exception when others then raise exception 'RIDER_APPLY: Pick a vehicle type.'; end;
  if v_vehicle <> 'bicycle' and nullif(btrim(coalesce(p_license_number, '')), '') is null then raise exception 'RIDER_APPLY: A driving licence number is needed for a motor vehicle.'; end if;
  if p_aadhaar_last4 is not null and p_aadhaar_last4 !~ '^[0-9]{4}$' then raise exception 'RIDER_APPLY: Aadhaar: enter the last 4 digits only.'; end if;
  if v_emg is not null and v_emg !~ '^[6-9][0-9]{9}$' then raise exception 'RIDER_APPLY: Emergency contact must be a 10-digit mobile number.'; end if;
  if exists (select 1 from public.profiles where lower(email) = v_email) then raise exception 'RIDER_APPLY: This email already has a Merta Deal account. Sign in at the delivery partner login, or call us.'; end if;
  if exists (select 1 from public.rider_applications where status = 'new' and (phone = v_phone or email = v_email)) then raise exception 'RIDER_APPLY: We already have your application and will call you soon.'; end if;
  if (select count(*) from public.rider_applications where created_at > now() - interval '1 hour') >= 30 then raise exception 'RIDER_APPLY: Too many applications right now. Please call us instead.'; end if;
  insert into public.rider_applications (full_name, phone, email, vehicle_type, vehicle_number, license_number, aadhaar_last4, emergency_contact, note)
  values (v_name, v_phone, v_email, v_vehicle, v_vnum, nullif(btrim(coalesce(p_license_number, '')), ''), p_aadhaar_last4, v_emg, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  perform public.notify_admins('rider_application', 'Delivery partner application: ' || v_name,
    format('%s (%s) wants to deliver with a %s. Review it under Riders → Applications.', v_name, v_phone, v_vehicle::text),
    jsonb_build_object('application_id', v_id));
  return jsonb_build_object('id', v_id);
end $$;
revoke all on function public.submit_rider_application(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_rider_application(text, text, text, text, text, text, text, text, text) to anon, authenticated;

/** Admin: applications, newest first (p_status null = every status). */
create or replace function public.admin_rider_applications(p_status text default 'new')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('reviewer_name', (select full_name from public.profiles where id = a.reviewed_by)) order by a.created_at desc)
    from (select * from public.rider_applications where p_status is null or status = p_status order by created_at desc limit 200) a), '[]'::jsonb);
end $$;
revoke all on function public.admin_rider_applications(text) from public, anon;
grant execute on function public.admin_rider_applications(text) to authenticated;

/** Admin: decline an application (or reopen a declined one) with a note. */
create or replace function public.admin_review_rider_application(p_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.rider_applications;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('declined', 'new') then raise exception 'RIDER_APPLY: Choose declined or new.'; end if;
  update public.rider_applications set status = p_status, review_note = nullif(btrim(coalesce(p_note, '')), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status <> 'created' returning * into a;
  if a.id is null then raise exception 'RIDER_APPLY: This application was not found or already has a rider account.'; end if;
  perform public.audit('rider.application.review', 'rider_applications', a.id::text, null, jsonb_build_object('status', p_status));
  return to_jsonb(a);
end $$;
revoke all on function public.admin_review_rider_application(uuid, text, text) from public, anon;
grant execute on function public.admin_review_rider_application(uuid, text, text) to authenticated;

/** Admin: record that a rider account was created from this application. */
create or replace function public.admin_link_rider_application(p_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.rider_applications set status = 'created', created_user_id = p_user_id, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
end $$;
revoke all on function public.admin_link_rider_application(uuid, uuid) from public, anon;
grant execute on function public.admin_link_rider_application(uuid, uuid) to authenticated;
