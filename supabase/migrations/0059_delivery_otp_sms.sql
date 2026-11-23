-- 0059: delivery code at the door, by SMS, with nothing readable at rest.
--
-- Until now the 4-digit delivery OTP was made when the order was placed, kept as plain text in
-- `order_secrets.delivery_otp` for the whole life of the order, and readable by the customer AND every
-- admin through the table's read policy. `track_order_by_code` handed it to anyone holding the order
-- number and the customer's phone number, and a rider on the delivery holds both. It never expired.
--
-- From here on:
--   * no code exists until the handover. `order_secrets.delivery_otp` is emptied and a trigger keeps it
--     empty (place_order still writes the column; the value never reaches the table);
--   * a code is minted in two places only, and only its salted SHA-256 is stored:
--       - `delivery_otp_claim` (server only), when the assigned rider has marked "reached the customer"
--         (`rider_mark_arrived`) or asked for a resend: the plain code goes to the server for one SMS
--         and is never written anywhere;
--       - `customer_delivery_code(order, true)`, when the customer taps "Show code" on their own order
--         screen: the plain code goes to that customer's own session only. This is what completes a
--         delivery when SMS is not configured, is switched off or fails;
--     the SMS code and the on-screen code are separate and either completes the delivery, so asking
--     for one never kills the other;
--   * every code is bound to the assignment it was made for, lives `delivery_otp_expiry_minutes`, is
--     wiped on use, and is wiped when the order leaves "out for delivery" or the assignment stops being
--     picked up (delivered, cancelled, failed attempt, another rider);
--   * wrong tries are still capped per order by `otp_max_attempts`; a lock tells the admins;
--   * arrival asks for one SMS per assignment however often it is repeated; a resend is the rider's
--     explicit request, spaced by `delivery_otp_resend_cooldown_seconds`, capped by
--     `delivery_otp_max_resends`, and replaces the earlier SMS code;
--   * each SMS request is one `delivery_code` notification for the customer (no code in it), and what
--     the SMS panel answered is recorded against it through `record_notification_delivery` (0052), so
--     Admin → Notifications shows sent / failed / not configured per request;
--   * nobody but security-definer functions can read `order_secrets` any more.
-- Completing a delivery is still `verify_delivery_otp` by the assigned rider, or `admin_confirm_delivery`.
-- Works with or without 0058 (rider alerts): it uses only the 0052 objects, which 0058 keeps.
-- Re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, "group", label, description, is_public) values
  ('otp_max_attempts', '5', coalesce((select "group" from public.settings where key = 'dispatch_offer_timeout_seconds'), 'delivery'),
   'Delivery code: wrong tries before it locks',
   'After this many wrong delivery codes on one order the code is locked and the handover has to be completed by support.', false),
  ('delivery_otp_expiry_minutes', '10', coalesce((select "group" from public.settings where key = 'dispatch_offer_timeout_seconds'), 'delivery'),
   'Delivery code: valid for (minutes)',
   'How long a delivery code works after it is sent by SMS or shown on the customer''s order screen. A new one can be asked for after that.', false),
  ('delivery_otp_resend_cooldown_seconds', '60', coalesce((select "group" from public.settings where key = 'dispatch_offer_timeout_seconds'), 'delivery'),
   'Delivery code: wait before a resend (seconds)',
   'The rider has to wait this long after one SMS before asking for another for the same delivery.', false),
  ('delivery_otp_max_resends', '3', coalesce((select "group" from public.settings where key = 'dispatch_offer_timeout_seconds'), 'delivery'),
   'Delivery code: resends allowed per delivery',
   'How many times the rider may ask for a new SMS code on one delivery, after the first. The customer can always see a code on their own order screen.', false),
  ('delivery_otp_sms_enabled', 'true', coalesce((select "group" from public.settings where key = 'dispatch_offer_timeout_seconds'), 'delivery'),
   'Delivery code: send by SMS',
   'On: when the rider reaches the customer the delivery code is sent to the customer by SMS, once the delivery-code SMS template is configured on the server. Off: no SMS is sent and the customer reads the code from their order screen. Each SMS is charged by the SMS panel.', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. order_secrets: no plain code, hashed codes, the SMS request's state
-- ---------------------------------------------------------------------------
alter table public.order_secrets alter column delivery_otp drop not null;
alter table public.order_secrets
  add column if not exists otp_assignment_id uuid references public.delivery_assignments(id) on delete set null,
  add column if not exists sms_code_hash text,
  add column if not exists sms_code_salt text,
  add column if not exists sms_issued_at timestamptz,
  add column if not exists sms_expires_at timestamptz,
  add column if not exists app_code_hash text,
  add column if not exists app_code_salt text,
  add column if not exists app_issued_at timestamptz,
  add column if not exists app_expires_at timestamptz,
  add column if not exists sms_status text,
  add column if not exists sms_status_at timestamptz,
  add column if not exists sms_error text,
  add column if not exists sms_phone_tail text,
  add column if not exists sms_notification_id uuid references public.notifications(id) on delete set null,
  add column if not exists sms_requests int not null default 0,
  add column if not exists sms_requested_at timestamptz,
  add column if not exists otp_consumed_at timestamptz;
alter table public.order_secrets drop constraint if exists order_secrets_sms_status_check;
alter table public.order_secrets add constraint order_secrets_sms_status_check
  check (sms_status is null or sms_status in ('pending', 'queued', 'sent', 'failed', 'unavailable', 'no_recipient'));
comment on table public.order_secrets is 'Delivery code state per order (0059). Readable and writable only by security-definer functions; holds salted hashes, never a code.';
comment on column public.order_secrets.delivery_otp is 'Always null since 0059. Kept because place_order still names the column; a trigger discards what it writes.';
comment on column public.order_secrets.otp_assignment_id is 'The picked-up assignment the codes and the SMS state below belong to. A different assignment starts clean.';
comment on column public.order_secrets.sms_code_hash is 'sha256(salt:code) of the code sent by SMS. Null when none is live.';
comment on column public.order_secrets.app_code_hash is 'sha256(salt:code) of the code the customer opened on their own order screen. Null when none is live.';
comment on column public.order_secrets.sms_status is 'pending: asked for, not yet attempted · queued: handed to the server for one SMS · sent: the SMS panel accepted it · failed · unavailable: SMS not configured or switched off · no_recipient: no usable mobile number.';
comment on column public.order_secrets.sms_requests is 'SMS requests on this assignment: the one at arrival plus the rider''s resends.';

/** The plain code never reaches the table, whatever writes the row. */
create or replace function public._order_secrets_no_plaintext()
returns trigger language plpgsql as $$
begin
  new.delivery_otp := null;
  return new;
end $$;
drop trigger if exists order_secrets_no_plaintext_trg on public.order_secrets;
create trigger order_secrets_no_plaintext_trg before insert or update on public.order_secrets
  for each row execute function public._order_secrets_no_plaintext();
update public.order_secrets set delivery_otp = null where delivery_otp is not null;

-- The table was readable by the order's customer and by every admin. Nobody reads it directly now.
drop policy if exists order_secrets_read on public.order_secrets;
revoke all on public.order_secrets from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public._delivery_code_hash(p_salt text, p_code text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p_salt, '') || ':' || coalesce(p_code, ''), 'UTF8')), 'hex');
$$;
revoke all on function public._delivery_code_hash(text, text) from public, anon, authenticated;

/** `+91 98765 43210`, `09876543210`, `9876543210` → `9876543210`; anything else is not an Indian mobile. */
create or replace function public._indian_mobile(p_phone text)
returns text language sql immutable as $$
  select case when v ~ '^[6-9][0-9]{9}$' then v end
  from (select case when length(d) = 12 and d like '91%' then substr(d, 3) when length(d) = 11 and d like '0%' then substr(d, 2) else d end as v
        from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) x) y;
$$;
revoke all on function public._indian_mobile(text) from public, anon, authenticated;

/**
 * Locks the order's row and makes it belong to this assignment. A different assignment (the order went
 * out again with another rider, or with the same rider on a new assignment) starts with no codes, no
 * SMS state and a fresh resend allowance. Wrong tries stay counted per order.
 */
create or replace function public._delivery_otp_bind(p_order_id uuid, p_assignment_id uuid)
returns public.order_secrets language plpgsql security definer set search_path = public as $$
declare sec public.order_secrets;
begin
  insert into public.order_secrets (order_id) values (p_order_id) on conflict (order_id) do nothing;
  select * into sec from public.order_secrets where order_id = p_order_id for update;
  if sec.otp_assignment_id is distinct from p_assignment_id then
    update public.order_secrets
    set otp_assignment_id = p_assignment_id,
        sms_code_hash = null, sms_code_salt = null, sms_issued_at = null, sms_expires_at = null,
        app_code_hash = null, app_code_salt = null, app_issued_at = null, app_expires_at = null,
        sms_status = null, sms_status_at = null, sms_error = null, sms_phone_tail = null, sms_notification_id = null,
        sms_requests = 0, sms_requested_at = null, otp_consumed_at = null
    where order_id = p_order_id returning * into sec;
  end if;
  return sec;
end $$;
revoke all on function public._delivery_otp_bind(uuid, uuid) from public, anon, authenticated;

/** Records an SMS outcome against the request's notification (0052 pipeline). Never fails the caller. */
create or replace function public._delivery_otp_log(p_notification_id uuid, p_status text, p_provider_id text, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_notification_id is null or not exists (select 1 from public.notifications where id = p_notification_id) then return; end if;
  begin
    perform public.record_notification_delivery(p_notification_id, 'sms'::public.notification_channel, p_status, left(p_provider_id, 200), left(p_error, 500));
  exception when others then
    null; -- the customer deleted the notification, or the pipeline is not there: the SMS itself must not depend on it
  end;
end $$;
revoke all on function public._delivery_otp_log(uuid, text, text, text) from public, anon, authenticated;

/**
 * Asks for one SMS code for this assignment. 'arrival' does nothing when the assignment already has a
 * request (so marking arrived again, a retry or a reconnect never asks twice); 'resend' is the rider's
 * explicit request and withdraws the earlier SMS code. Writes the customer's notification, which
 * carries no code, and leaves the request `pending` for the server to pick up with delivery_otp_claim.
 */
create or replace function public._delivery_otp_request(p_assignment_id uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; o public.orders; sec public.order_secrets; v_nid uuid;
begin
  select * into a from public.delivery_assignments where id = p_assignment_id;
  if a.id is null or a.status <> 'picked_up' then return false; end if;
  select * into o from public.orders where id = a.order_id;
  if o.id is null or o.status <> 'out_for_delivery' then return false; end if;
  sec := public._delivery_otp_bind(o.id, a.id);
  if p_kind = 'arrival' and sec.sms_requests > 0 then return false; end if;
  -- An earlier request the server never reported back on is closed, so it does not read "sending" for ever.
  if sec.sms_status = 'queued' and sec.sms_notification_id is not null then
    update public.notification_deliveries set status = 'failed', updated_at = now(),
      error = 'The send was interrupted before the SMS panel answered.'
    where notification_id = sec.sms_notification_id and channel = 'sms' and status = 'queued';
  end if;
  insert into public.notifications (user_id, type, title, body, data, channels)
  values (o.user_id, 'delivery_code',
    case when p_kind = 'resend' then 'New delivery code requested' else 'Your delivery partner has arrived' end,
    case when p_kind = 'resend'
      then format('Your delivery partner asked for a new delivery code for order %s. Use the newest SMS, or open your order to see a code. Share it only when the order is at your door.', o.order_number)
      else format('Order %s is at your door. Open your order to see your delivery code and share it with the delivery partner only when the order is in your hands.', o.order_number) end,
    jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'assignment_id', a.id, 'kind', p_kind),
    '{in_app,push}')
  returning id into v_nid;
  update public.order_secrets
  set sms_status = 'pending', sms_status_at = now(), sms_error = null, sms_notification_id = v_nid,
      sms_requests = sms_requests + 1, sms_requested_at = now(),
      -- A resend withdraws the code that was sent before; the customer's on-screen code is not touched.
      sms_code_hash = case when p_kind = 'resend' then null else sms_code_hash end,
      sms_code_salt = case when p_kind = 'resend' then null else sms_code_salt end,
      sms_expires_at = case when p_kind = 'resend' then null else sms_expires_at end
  where order_id = o.id;
  return true;
end $$;
revoke all on function public._delivery_otp_request(uuid, text) from public, anon, authenticated;

/** What the rider app may know about the code for one assignment. Never the code, never the number beyond its last two digits. */
create or replace function public._delivery_otp_state(p_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  a public.delivery_assignments; o public.orders; sec public.order_secrets; v_mine boolean; v_status text; v_wait int;
  v_max int := greatest(1, public.get_setting_num('otp_max_attempts', 5))::int;
  v_cool int := greatest(0, public.get_setting_num('delivery_otp_resend_cooldown_seconds', 60))::int;
  v_resends int := greatest(0, public.get_setting_num('delivery_otp_max_resends', 3))::int;
begin
  select * into a from public.delivery_assignments where id = p_assignment_id;
  select * into o from public.orders where id = a.order_id;
  select * into sec from public.order_secrets where order_id = a.order_id;
  v_mine := coalesce(sec.otp_assignment_id = a.id, false);
  -- A request the server never picked up, or never reported back on, is not "sending" any more.
  v_status := case when not v_mine then null
                   when sec.sms_status in ('pending', 'queued') and sec.sms_status_at < now() - interval '60 seconds' then 'failed'
                   else sec.sms_status end;
  v_wait := case when v_mine and sec.sms_requested_at is not null then greatest(0, ceil(v_cool - extract(epoch from now() - sec.sms_requested_at)))::int else 0 end;
  return jsonb_build_object(
    'applies', coalesce(a.status = 'picked_up' and o.status = 'out_for_delivery', false),
    'arrived', a.arrived_customer_at is not null,
    'locked', coalesce(sec.otp_attempts, 0) >= v_max,
    'attempts_left', greatest(v_max - coalesce(sec.otp_attempts, 0), 0),
    'max_attempts', v_max,
    'expiry_minutes', greatest(1, public.get_setting_num('delivery_otp_expiry_minutes', 10))::int,
    'sms', jsonb_build_object(
      'status', v_status,
      'at', case when v_mine then sec.sms_status_at end,
      'phone_tail', case when v_mine and v_status in ('queued', 'sent', 'failed') then sec.sms_phone_tail end,
      'live', v_mine and sec.sms_code_hash is not null and sec.sms_expires_at > now(),
      'expires_at', case when v_mine and sec.sms_code_hash is not null then sec.sms_expires_at end),
    'customer_has_code', v_mine and sec.app_code_hash is not null and sec.app_expires_at > now(),
    'resend', jsonb_build_object(
      'left', greatest(v_resends - greatest(case when v_mine then sec.sms_requests else 0 end - 1, 0), 0),
      'max', v_resends, 'cooldown_seconds', v_cool, 'retry_in_seconds', v_wait));
end $$;
revoke all on function public._delivery_otp_state(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The send point: the assigned rider marks "reached the customer"
-- ---------------------------------------------------------------------------
/** 0036 body; reaching the customer also asks for the delivery code SMS, once per assignment. */
create or replace function public.rider_mark_arrived(p_assignment_id uuid, p_where text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dp public.delivery_partners; a public.delivery_assignments; o public.orders;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or dp.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = a.order_id;
  if p_where = 'pickup' then
    if a.status <> 'accepted' then raise exception 'INVALID_STATE: %', a.status; end if;
    if a.arrived_pickup_at is null then
      update public.delivery_assignments set arrived_pickup_at = now() where id = a.id;
      perform public.notify_admins('rider_arrived', 'Rider at the pickup point for ' || o.order_number, 'Hand over the bag and scan the label (or let the rider scan it).', jsonb_build_object('order_id', o.id, 'assignment_id', a.id));
    end if;
  elsif p_where = 'customer' then
    if a.status <> 'picked_up' then raise exception 'INVALID_STATE: %', a.status; end if;
    if a.arrived_customer_at is null then update public.delivery_assignments set arrived_customer_at = now() where id = a.id; end if;
    -- 0059: one code request per assignment, however often this is called.
    perform public._delivery_otp_request(a.id, 'arrival');
  else raise exception 'INVALID_PLACE'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.rider_mark_arrived(uuid, text) from public, anon;
grant execute on function public.rider_mark_arrived(uuid, text) to authenticated;

/** The rider app's view of the code for its own assignment: send state, tries left, resend allowance. */
create or replace function public.rider_delivery_otp_state(p_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare dp public.delivery_partners; a public.delivery_assignments;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  select * into a from public.delivery_assignments where id = p_assignment_id;
  if a.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  return public._delivery_otp_state(a.id);
end $$;
revoke all on function public.rider_delivery_otp_state(uuid) from public, anon;
grant execute on function public.rider_delivery_otp_state(uuid) to authenticated;

/**
 * The assigned rider asks for a new SMS code. Refused, with a code the app can explain, before arrival
 * (OTP_NOT_ARRIVED), while one is on its way (OTP_SEND_IN_PROGRESS), inside the cooldown
 * (OTP_RESEND_WAIT, with the seconds left), past the cap (OTP_RESEND_LIMIT) and once the code is
 * locked (OTP_LOCKED). A request that is still waiting for the server is returned as it is, not
 * counted again. Nothing is sent from here: the server claims the request with delivery_otp_claim.
 */
create or replace function public.rider_resend_delivery_otp(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  dp public.delivery_partners; a public.delivery_assignments; o public.orders; sec public.order_secrets; v_wait int;
  v_max int := greatest(1, public.get_setting_num('otp_max_attempts', 5))::int;
  v_cool int := greatest(0, public.get_setting_num('delivery_otp_resend_cooldown_seconds', 60))::int;
  v_resends int := greatest(0, public.get_setting_num('delivery_otp_max_resends', 3))::int;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  if a.status <> 'picked_up' then raise exception 'INVALID_STATE: %', a.status; end if;
  select * into o from public.orders where id = a.order_id for update;
  if o.status <> 'out_for_delivery' then raise exception 'INVALID_STATE: %', o.status; end if;
  if a.arrived_customer_at is null then return jsonb_build_object('ok', false, 'code', 'OTP_NOT_ARRIVED'); end if;
  sec := public._delivery_otp_bind(o.id, a.id);
  if sec.otp_attempts >= v_max then return jsonb_build_object('ok', false, 'code', 'OTP_LOCKED'); end if;
  if sec.sms_status = 'pending' then return jsonb_build_object('ok', true, 'requested', false, 'state', public._delivery_otp_state(a.id)); end if;
  if sec.sms_status = 'queued' and sec.sms_status_at > now() - interval '60 seconds' then return jsonb_build_object('ok', false, 'code', 'OTP_SEND_IN_PROGRESS'); end if;
  -- Arrived before this flow existed, or the arrival request was never made: this is the first send, not a resend.
  if sec.sms_requests = 0 then
    perform public._delivery_otp_request(a.id, 'arrival');
    return jsonb_build_object('ok', true, 'requested', true, 'state', public._delivery_otp_state(a.id));
  end if;
  v_wait := greatest(0, ceil(v_cool - extract(epoch from now() - sec.sms_requested_at)))::int;
  if v_wait > 0 then return jsonb_build_object('ok', false, 'code', 'OTP_RESEND_WAIT', 'retry_in_seconds', v_wait); end if;
  if sec.sms_requests - 1 >= v_resends then return jsonb_build_object('ok', false, 'code', 'OTP_RESEND_LIMIT'); end if;
  perform public._delivery_otp_request(a.id, 'resend');
  return jsonb_build_object('ok', true, 'requested', true, 'state', public._delivery_otp_state(a.id));
end $$;
revoke all on function public.rider_resend_delivery_otp(uuid) from public, anon;
grant execute on function public.rider_resend_delivery_otp(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The server's two steps around one SMS: claim (mint), then record the panel's answer
-- ---------------------------------------------------------------------------
/**
 * Hands the server one freshly made code for a pending request, with the mobile number to send it to,
 * immediately before the SMS panel is called. Under locks on the assignment, the order and the code
 * row it re-checks that the delivery is still in progress with this assignment; anything else closes
 * the request with the reason and returns `send: false`. A request is claimed once: a second caller
 * gets `in_flight` or `nothing_pending`, so no retry, refresh or overlapping run mints or sends twice.
 * Only the hash of the code is stored. Server only.
 */
create or replace function public.delivery_otp_claim(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.delivery_assignments; o public.orders; sec public.order_secrets;
  v_mobile text; v_code text; v_salt text; v_stop text; v_why text;
  v_max int := greatest(1, public.get_setting_num('otp_max_attempts', 5))::int;
  v_exp int := greatest(1, public.get_setting_num('delivery_otp_expiry_minutes', 10))::int;
begin
  if auth.uid() is not null then raise exception 'FORBIDDEN'; end if;
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null then return jsonb_build_object('send', false, 'reason', 'not_found'); end if;
  select * into o from public.orders where id = a.order_id for update;
  select * into sec from public.order_secrets where order_id = a.order_id for update;
  if sec.order_id is null or sec.otp_assignment_id is distinct from a.id then return jsonb_build_object('send', false, 'reason', 'nothing_pending'); end if;
  if sec.sms_status = 'queued' then return jsonb_build_object('send', false, 'reason', 'in_flight'); end if;
  if sec.sms_status is distinct from 'pending' then return jsonb_build_object('send', false, 'reason', 'nothing_pending', 'status', sec.sms_status); end if;

  if a.status <> 'picked_up' or o.status <> 'out_for_delivery' then
    v_stop := 'failed'; v_why := 'The delivery was no longer in progress when the code was due to be sent.';
  elsif a.arrived_customer_at is null then
    v_stop := 'failed'; v_why := 'The rider had not reached the customer.';
  elsif sec.otp_attempts >= v_max then
    v_stop := 'failed'; v_why := 'The delivery code is locked after too many wrong tries.';
  elsif not public.get_setting_bool('delivery_otp_sms_enabled', true) then
    v_stop := 'unavailable'; v_why := 'Delivery code SMS is switched off in Settings.';
  else
    v_mobile := coalesce(public._indian_mobile(o.address_snapshot ->> 'phone'), public._indian_mobile((select p.phone from public.profiles p where p.id = o.user_id)));
    if v_mobile is null then v_stop := 'no_recipient'; v_why := 'No Indian mobile number on the delivery address or on the customer''s profile.'; end if;
  end if;
  if v_stop is not null then
    update public.order_secrets set sms_status = v_stop, sms_status_at = now(), sms_error = v_why where order_id = o.id;
    perform public._delivery_otp_log(sec.sms_notification_id, v_stop, null, v_why);
    return jsonb_build_object('send', false, 'reason', v_stop);
  end if;

  v_code := public.secure_otp4();
  v_salt := replace(gen_random_uuid()::text, '-', '');
  update public.order_secrets
  set sms_code_hash = public._delivery_code_hash(v_salt, v_code), sms_code_salt = v_salt, sms_issued_at = now(),
      sms_expires_at = now() + make_interval(mins => v_exp),
      sms_status = 'queued', sms_status_at = now(), sms_error = null, sms_phone_tail = right(v_mobile, 2)
  where order_id = o.id;
  perform public._delivery_otp_log(sec.sms_notification_id, 'queued', null, null);
  -- The only place the SMS code is ever returned. Nothing here names the order, the address or the customer.
  return jsonb_build_object('send', true, 'code', v_code, 'mobile', v_mobile, 'expires_in_minutes', v_exp);
end $$;
revoke all on function public.delivery_otp_claim(uuid) from public, anon, authenticated;
grant execute on function public.delivery_otp_claim(uuid) to service_role;

/**
 * Stores what happened to the request: `sent` only when the SMS panel accepted the message, `failed`
 * with its refusal or the timeout, `unavailable` when the server has no delivery-code SMS template
 * (no claim is made for that, so no SMS code exists). Sent is final. Server only.
 */
create or replace function public.delivery_otp_record(p_assignment_id uuid, p_status text, p_provider_id text default null, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.delivery_assignments; sec public.order_secrets;
begin
  if auth.uid() is not null then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('sent', 'failed', 'unavailable') then raise exception 'INVALID_STATUS: %', p_status; end if;
  select * into a from public.delivery_assignments where id = p_assignment_id;
  if a.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into sec from public.order_secrets where order_id = a.order_id for update;
  if sec.order_id is null or sec.otp_assignment_id is distinct from a.id then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if sec.sms_status = 'sent' then return jsonb_build_object('ok', true, 'status', 'sent', 'already', true); end if;
  -- "Not configured" answers a request nobody claimed; an SMS outcome answers a claimed one.
  if (p_status = 'unavailable' and sec.sms_status is distinct from 'pending') or (p_status <> 'unavailable' and sec.sms_status is distinct from 'queued') then
    return jsonb_build_object('ok', false, 'reason', 'not_expected', 'status', sec.sms_status);
  end if;
  update public.order_secrets
  set sms_status = p_status, sms_status_at = now(), sms_error = case when p_status = 'sent' then null else left(p_error, 300) end
  where order_id = a.order_id;
  perform public._delivery_otp_log(sec.sms_notification_id, p_status, case when p_status = 'sent' then p_provider_id end, case when p_status = 'sent' then null else p_error end);
  return jsonb_build_object('ok', true, 'status', p_status, 'already', false);
end $$;
revoke all on function public.delivery_otp_record(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.delivery_otp_record(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. The customer's own order screen
-- ---------------------------------------------------------------------------
/**
 * For the customer who placed the order, while it is out for delivery: whether a code was sent by SMS
 * (and to which number's last two digits), whether the order is at the door, and whether the code is
 * locked. With `p_reveal` it makes a new on-screen code, stores its hash and returns the code once, to
 * this customer only: that is how a delivery completes when no SMS could be sent. Asking again replaces
 * the on-screen code; the SMS code is not affected. Nobody else can call this for the order.
 */
create or replace function public.customer_delivery_code(p_order_id uuid, p_reveal boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders; a public.delivery_assignments; sec public.order_secrets; v_code text; v_salt text; v_mine boolean; v_status text;
  v_max int := greatest(1, public.get_setting_num('otp_max_attempts', 5))::int;
  v_exp int := greatest(1, public.get_setting_num('delivery_otp_expiry_minutes', 10))::int;
begin
  select * into o from public.orders where id = p_order_id;
  if o.id is null or auth.uid() is null or o.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if o.status <> 'out_for_delivery' then return jsonb_build_object('available', false); end if;
  select * into a from public.delivery_assignments where order_id = o.id and status = 'picked_up' order by created_at desc limit 1;
  if a.id is null then return jsonb_build_object('available', false); end if;

  if coalesce(p_reveal, false) then
    sec := public._delivery_otp_bind(o.id, a.id);
    if sec.otp_attempts < v_max then
      v_code := public.secure_otp4();
      v_salt := replace(gen_random_uuid()::text, '-', '');
      update public.order_secrets
      set app_code_hash = public._delivery_code_hash(v_salt, v_code), app_code_salt = v_salt, app_issued_at = now(),
          app_expires_at = now() + make_interval(mins => v_exp)
      where order_id = o.id;
    end if;
  end if;

  select * into sec from public.order_secrets where order_id = o.id;
  v_mine := coalesce(sec.otp_assignment_id = a.id, false);
  v_status := case when not v_mine then null
                   when sec.sms_status in ('pending', 'queued') and sec.sms_status_at < now() - interval '60 seconds' then 'failed'
                   else sec.sms_status end;
  return jsonb_build_object(
    'available', true,
    'arrived', a.arrived_customer_at is not null,
    'locked', coalesce(sec.otp_attempts, 0) >= v_max,
    'expiry_minutes', v_exp,
    'sms', jsonb_build_object(
      'status', v_status,
      'at', case when v_mine then sec.sms_status_at end,
      'phone_tail', case when v_mine and v_status in ('queued', 'sent') then sec.sms_phone_tail end,
      'live', v_mine and sec.sms_code_hash is not null and sec.sms_expires_at > now()),
    'app', jsonb_build_object(
      'live', v_mine and sec.app_code_hash is not null and sec.app_expires_at > now(),
      'issued_at', case when v_mine then sec.app_issued_at end,
      'expires_at', case when v_mine then sec.app_expires_at end),
    'code', v_code);
end $$;
revoke all on function public.customer_delivery_code(uuid, boolean) from public, anon;
grant execute on function public.customer_delivery_code(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Verification: the assigned rider, a picked-up delivery, a live code for this assignment
-- ---------------------------------------------------------------------------
/**
 * 0041 body, checking the hashed codes. Failures leave the order undelivered and say why with a code:
 *   OTP_LOCKED      too many wrong tries on this order (support completes the handover)
 *   OTP_NOT_ISSUED  no code has been made for this assignment yet (nothing counted)
 *   OTP_EXPIRED     the codes for this assignment ran out or were withdrawn (nothing counted)
 *   OTP_INCORRECT   it matches no live code (counted; never says how close it was)
 * A match wipes both codes before the delivery is completed, so a code works once. A repeat after
 * success still answers `already: true` without looking at the code.
 */
create or replace function public.verify_delivery_otp(p_assignment_id uuid, p_otp text, p_cash_collected boolean default false, p_upi_collected boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.delivery_assignments; dp public.delivery_partners; o public.orders; sec public.order_secrets; v_max int; v_points int;
  v_upi boolean := coalesce(p_upi_collected, false); v_in text := regexp_replace(coalesce(p_otp, ''), '\D', '', 'g');
  v_mine boolean; v_sms boolean; v_app boolean; v_left int;
begin
  select * into dp from public.delivery_partners where user_id = auth.uid();
  if dp.id is null then raise exception 'NOT_A_RIDER'; end if;
  -- Lock the assignment first: concurrent or repeated submissions run one after another.
  select * into a from public.delivery_assignments where id = p_assignment_id for update;
  if a.id is null or a.rider_id <> dp.id then raise exception 'FORBIDDEN'; end if;
  if a.status = 'delivered' then return jsonb_build_object('ok', true, 'status', 'delivered', 'already', true, 'reward_points', 0); end if;
  if a.status <> 'picked_up' then raise exception 'INVALID_STATE: %', a.status; end if;
  select * into o from public.orders where id = a.order_id for update;
  if o.status <> 'out_for_delivery' then raise exception 'INVALID_STATE: %', o.status; end if;
  insert into public.order_secrets (order_id) values (o.id) on conflict (order_id) do nothing;
  select * into sec from public.order_secrets where order_id = o.id for update;
  v_max := greatest(1, public.get_setting_num('otp_max_attempts', 5))::int;
  v_left := greatest(v_max - sec.otp_attempts, 0);
  if sec.otp_attempts >= v_max then
    return jsonb_build_object('ok', false, 'locked', true, 'code', 'OTP_LOCKED', 'attempts_left', 0, 'reason', 'Too many wrong OTPs. Call Merta Deal support to complete this delivery.');
  end if;
  if v_upi and o.payment_method <> 'cod' then v_upi := false; end if;
  if v_upi and (coalesce(p_cash_collected, false) or not public.get_setting_bool('upi_on_delivery_enabled', false)) then
    return jsonb_build_object('ok', false, 'needs_cash', true, 'reason', 'Choose either cash or UPI.');
  end if;
  -- Payment first, so a missing confirmation never uses up an OTP attempt.
  if o.payment_method = 'cod' and not coalesce(p_cash_collected, false) and not v_upi then
    return jsonb_build_object('ok', false, 'needs_cash', true, 'reason', format('Collect ₹%s and confirm it before entering the OTP.', to_char(o.total, 'FM9999990.00')));
  end if;

  v_mine := coalesce(sec.otp_assignment_id = a.id, false);
  v_sms := v_mine and sec.sms_code_hash is not null and sec.sms_expires_at > now();
  v_app := v_mine and sec.app_code_hash is not null and sec.app_expires_at > now();
  if not (v_sms or v_app) then
    return jsonb_build_object('ok', false, 'attempts_left', v_left, 'locked', false,
      'code', case when v_mine and (sec.sms_issued_at is not null or sec.app_issued_at is not null) then 'OTP_EXPIRED' else 'OTP_NOT_ISSUED' end,
      'reason', case when v_mine and (sec.sms_issued_at is not null or sec.app_issued_at is not null)
        then 'That delivery code is no longer valid. Send a new one, or ask the customer to open their order screen.'
        else 'No delivery code has been issued yet. Ask the customer to open their order screen.' end);
  end if;
  if length(v_in) <> 4 or not (
       (v_sms and sec.sms_code_hash = public._delivery_code_hash(sec.sms_code_salt, v_in))
    or (v_app and sec.app_code_hash = public._delivery_code_hash(sec.app_code_salt, v_in))) then
    update public.order_secrets set otp_attempts = otp_attempts + 1 where order_id = o.id;
    if sec.otp_attempts + 1 >= v_max then
      perform public.audit('delivery.otp_locked', 'orders', o.id::text, null, jsonb_build_object('assignment_id', a.id, 'rider_id', dp.id, 'attempts', sec.otp_attempts + 1));
      perform public.notify_admins('delivery_failed', 'Delivery code locked: ' || o.order_number,
        'Too many wrong delivery codes were entered for this order. Confirm the handover with the customer, then complete it from the order page.',
        jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'assignment_id', a.id));
    end if;
    return jsonb_build_object('ok', false, 'code', 'OTP_INCORRECT', 'reason', 'Incorrect OTP', 'attempts_left', greatest(v_left - 1, 0), 'locked', sec.otp_attempts + 1 >= v_max);
  end if;

  -- Single use: both codes are gone before anything else happens.
  update public.order_secrets
  set sms_code_hash = null, sms_code_salt = null, sms_expires_at = null, app_code_hash = null, app_code_salt = null, app_expires_at = null, otp_consumed_at = now()
  where order_id = o.id;
  v_points := public._complete_delivery(a.id, 'otp');
  if v_upi then
    update public.cod_collections set collected_mode = 'upi' where order_id = o.id;
    perform public.notify_admins('upi_to_confirm', 'Check UPI for ' || o.order_number, format('Rider recorded ₹%s by UPI. Confirm it in your bank.', to_char(o.total, 'FM9999990.00')), jsonb_build_object('order_id', o.id, 'url', '/admin/payments'));
  end if;
  return jsonb_build_object('ok', true, 'status', 'delivered', 'reward_points', v_points);
end $$;
revoke execute on function public.verify_delivery_otp(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.verify_delivery_otp(uuid, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. A code never outlives its delivery
-- ---------------------------------------------------------------------------
-- Whatever moves the order out of "out for delivery" (delivered, cancelled, rejected, a failed attempt
-- sending it back to the pickup point) or the assignment out of "picked up" withdraws every live code.
create or replace function public._delivery_otp_withdraw()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'orders' then
    update public.order_secrets
    set sms_code_hash = null, sms_code_salt = null, sms_expires_at = null, app_code_hash = null, app_code_salt = null, app_expires_at = null
    where order_id = new.id and (sms_code_hash is not null or app_code_hash is not null);
  else
    update public.order_secrets
    set sms_code_hash = null, sms_code_salt = null, sms_expires_at = null, app_code_hash = null, app_code_salt = null, app_expires_at = null
    where order_id = new.order_id and otp_assignment_id = new.id and (sms_code_hash is not null or app_code_hash is not null);
  end if;
  return null;
end $$;
revoke all on function public._delivery_otp_withdraw() from public, anon, authenticated;

drop trigger if exists orders_delivery_otp_withdraw_trg on public.orders;
create trigger orders_delivery_otp_withdraw_trg after update of status on public.orders
  for each row when (old.status = 'out_for_delivery' and new.status is distinct from old.status)
  execute function public._delivery_otp_withdraw();
drop trigger if exists delivery_assignments_otp_withdraw_trg on public.delivery_assignments;
create trigger delivery_assignments_otp_withdraw_trg after update of status on public.delivery_assignments
  for each row when (old.status = 'picked_up' and new.status is distinct from old.status)
  execute function public._delivery_otp_withdraw();

-- ---------------------------------------------------------------------------
-- 9. What Admin → Notifications reads
-- ---------------------------------------------------------------------------
/**
 * Delivery-code SMS requests, newest first, with what the SMS panel answered, plus the last outcome and
 * the day's counts. Order numbers and outcomes only: no code (none is stored), no number, no name.
 */
create or replace function public.admin_delivery_code_log(p_limit int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'last_status', (array_agg(d.status order by d.updated_at desc))[1],
        'last_at', max(d.updated_at),
        'last_error', (array_agg(d.error order by d.updated_at desc))[1],
        'sent_24h', count(*) filter (where d.status in ('sent', 'delivered') and d.updated_at > now() - interval '24 hours'),
        'failed_24h', count(*) filter (where d.status = 'failed' and d.updated_at > now() - interval '24 hours'),
        'not_sent_24h', count(*) filter (where d.status in ('unavailable', 'no_recipient') and d.updated_at > now() - interval '24 hours'))
      from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
      where n.type = 'delivery_code' and d.channel = 'sms'),
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'notification_id', r.id, 'at', r.created_at, 'kind', coalesce(r.data ->> 'kind', 'arrival'),
          'order_id', r.data ->> 'order_id', 'order_number', coalesce(o.order_number, r.data ->> 'order_number'),
          'status', r.status, 'attempts', coalesce(r.attempts, 0), 'error', r.error, 'provider_id', r.provider_id, 'updated_at', r.updated_at
        ) order by r.created_at desc), '[]'::jsonb)
      from (
        select n.id, n.created_at, n.data, d.status, d.attempts, d.error, d.provider_id, d.updated_at
        from public.notifications n
        left join public.notification_deliveries d on d.notification_id = n.id and d.channel = 'sms'
        where n.type = 'delivery_code'
        order by n.created_at desc limit greatest(1, least(coalesce(p_limit, 12), 50))
      ) r
      left join public.orders o on o.id::text = r.data ->> 'order_id'));
end $$;
revoke all on function public.admin_delivery_code_log(int) from public, anon;
grant execute on function public.admin_delivery_code_log(int) to authenticated;
create index if not exists notifications_delivery_code_idx on public.notifications (created_at desc) where type = 'delivery_code';
