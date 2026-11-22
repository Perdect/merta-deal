-- 0058: rider alerts.
-- A delivery request already writes one `delivery_offer` notification per rider and order (0051), and the
-- generic push sweep sent whatever row still had `sent_push = false`. That sweep never looked at the
-- assignment again, so a request that had expired, been taken by another rider or been cancelled could
-- still buzz a phone, and nothing recorded what the push service answered. This migration gives rider
-- alerts the same treatment 0052 gave new-order alerts, plus the staleness check:
--   * `notification_deliveries` gets an `event_key`, because one `delivery_offer` row is refreshed for
--     every re-offer: each offer (one assignment) is its own event with its own outcome per channel;
--   * `rider_alert_claim` is the gate every send goes through. Under a lock on the notification it
--     re-reads the assignment and the order, refuses anything no longer this rider's (recorded as
--     `skipped` with the reason), refuses a second send of the same event on the same channel, and
--     hands out one claim at a time, so overlapping schedulers cannot both send;
--   * `rider_alert_record` stores the provider's real answer (sent is final, failures stop at the
--     attempt limit, an unconfigured channel is `unavailable`);
--   * a rider whose open request is taken by another rider, withdrawn by an admin or cancelled with the
--     order gets one "no longer yours" notice per assignment, never repeated;
--   * SMS is a second channel for requests only, and only for a rider who has switched it on
--     (`profiles.preferences.rider_sms_alerts`); the app sends nothing until a DLT-approved
--     delivery-alert template is configured on the server;
--   * the admin status area reads `admin_rider_alert_summary` / `admin_recent_rider_alerts`.
-- Nothing here changes who may accept, collect or complete a delivery, and nothing writes
-- delivery_assignments.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, "group", label, description, is_public) values
  ('rider_alert_max_attempts', '3', coalesce((select "group" from public.settings where key = 'dispatch_offer_timeout_seconds'), 'delivery'),
   'Rider alert: stop retrying after (attempts)',
   'A push or SMS to a rider that the provider keeps refusing is left alone after this many tries. Admin → Notifications shows the provider''s answer.', false),
  ('rider_alert_notice_minutes', '15', coalesce((select "group" from public.settings where key = 'dispatch_offer_timeout_seconds'), 'delivery'),
   'Rider alert: drop a "no longer yours" notice after (minutes)',
   'A notice that a delivery was taken away is only pushed while it is this fresh. An older one stays in the rider''s in-app list and is not sent to the phone.', false),
  ('rider_sms_alerts_enabled', 'true', coalesce((select "group" from public.settings where key = 'dispatch_offer_timeout_seconds'), 'delivery'),
   'Rider alert: SMS for delivery requests',
   'On: a rider who has switched SMS alerts on in the rider app also gets an SMS for each delivery request, once the SMS template is configured on the server. Off: no rider SMS is sent, whatever the rider chose. Each SMS is charged by the SMS panel.', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. One outcome per notification, channel and event
-- ---------------------------------------------------------------------------
alter table public.notification_deliveries add column if not exists event_key text not null default '';
comment on column public.notification_deliveries.event_key is 'Which occurrence of the notification this outcome belongs to (0058). Empty for alerts that happen once (new_order); offer:<assignment id> / released:<assignment id> for rider alerts, whose one row is refreshed on every re-offer.';
alter table public.notification_deliveries drop constraint if exists notification_deliveries_notification_id_channel_key;
create unique index if not exists notification_deliveries_one_per_event_idx on public.notification_deliveries (notification_id, channel, event_key);
-- skipped: deliberately not sent (no longer this rider's, rider has SMS off, …); the reason is in `error`.
alter table public.notification_deliveries drop constraint if exists notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check
  check (status in ('queued', 'sent', 'delivered', 'failed', 'unavailable', 'no_recipient', 'skipped'));

/** 0052 body; the row it keeps is the one with no event key, so rider alert outcomes are never mixed in. */
create or replace function public.record_notification_delivery(p_notification_id uuid, p_channel public.notification_channel, p_status text, p_provider_id text default null, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.notification_deliveries; v_counts boolean := p_status in ('sent', 'delivered', 'failed', 'no_recipient');
begin
  if not public.is_admin_or_service() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('queued', 'sent', 'delivered', 'failed', 'unavailable', 'no_recipient') then raise exception 'INVALID_STATUS: %', p_status; end if;
  select * into d from public.notification_deliveries where notification_id = p_notification_id and channel = p_channel and event_key = '' for update;
  if d.id is null then
    insert into public.notification_deliveries (notification_id, channel, status, attempts, provider_id, error)
    values (p_notification_id, p_channel, p_status, case when v_counts then 1 else 0 end, p_provider_id, p_error)
    returning * into d;
    return jsonb_build_object('ok', true, 'id', d.id, 'status', d.status, 'attempts', d.attempts, 'already', false);
  end if;
  -- Sent stays sent: a retry after a lost response must not look like a failure, and never sends again.
  if d.status in ('sent', 'delivered') and p_status not in ('delivered') then
    return jsonb_build_object('ok', true, 'id', d.id, 'status', d.status, 'attempts', d.attempts, 'already', true);
  end if;
  update public.notification_deliveries
  set status = p_status, attempts = attempts + case when v_counts then 1 else 0 end,
      provider_id = coalesce(p_provider_id, provider_id), error = case when p_status in ('sent', 'delivered') then null else p_error end, updated_at = now()
  where id = d.id returning * into d;
  return jsonb_build_object('ok', true, 'id', d.id, 'status', d.status, 'attempts', d.attempts, 'already', false);
end $$;
revoke all on function public.record_notification_delivery(uuid, public.notification_channel, text, text, text) from public, anon;
grant execute on function public.record_notification_delivery(uuid, public.notification_channel, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. One "no longer yours" notice per rider and assignment
-- ---------------------------------------------------------------------------
/** 0052 body plus: a second `delivery_cancelled` row for the same rider and assignment is refused. */
create or replace function public.notify_user(p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then return; end if;
  if p_type = 'new_order' and p_data ? 'order_id' and exists (
    select 1 from public.notifications where user_id = p_user_id and type = 'new_order' and data ->> 'order_id' = p_data ->> 'order_id'
  ) then return; end if;
  if p_type = 'delivery_cancelled' and p_data ? 'assignment_id' and exists (
    select 1 from public.notifications where user_id = p_user_id and type = 'delivery_cancelled' and data ->> 'assignment_id' = p_data ->> 'assignment_id'
  ) then return; end if;
  insert into public.notifications (user_id, type, title, body, data, channels)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_data,'{}'::jsonb), '{in_app,push}');
end $$;
create index if not exists notifications_release_per_assignment_idx on public.notifications (user_id, (data ->> 'assignment_id')) where type = 'delivery_cancelled';

-- An open request that someone else closed. Runs at commit (deferred), so it sees how the transaction
-- ended: a request re-offered or re-assigned to the same rider in the same step says nothing, and
-- "taken" is only said once the other rider's acceptance is really there. Not told: a request that
-- simply ran out, one the rider closed themselves (going offline, a late tap that already got its
-- answer on screen), and a quiet rider set offline (they get `rider_offline`). An accepted delivery
-- that is unassigned or cancelled keeps its own notice from admin_unassign_rider / cancel_order.
create or replace function public._rider_offer_withdrawn_notice()
returns trigger language plpgsql security definer set search_path = public as $$
declare o public.orders; dp public.delivery_partners; v_reason text;
begin
  select * into dp from public.delivery_partners where id = new.rider_id;
  if dp.user_id is null or dp.user_id = auth.uid() then return null; end if;
  if exists (select 1 from public.delivery_assignments a where a.order_id = new.order_id and a.rider_id = new.rider_id and a.id <> new.id
             and a.status in ('offered', 'accepted', 'picked_up')) then return null; end if;
  select * into o from public.orders where id = new.order_id;
  if o.id is null then return null; end if;
  if o.status in ('cancelled', 'rejected') then v_reason := 'order_cancelled';
  elsif exists (select 1 from public.delivery_assignments a where a.order_id = new.order_id and a.rider_id <> new.rider_id
                and a.status in ('accepted', 'picked_up', 'delivered')) then v_reason := 'taken';
  elsif new.status = 'cancelled' then v_reason := 'withdrawn';
  else return null;
  end if;
  perform public.notify_user(dp.user_id, 'delivery_cancelled', 'Request closed: ' || o.order_number,
    case v_reason when 'order_cancelled' then 'The order was cancelled. This delivery is no longer offered to you.'
                  when 'taken' then 'Another rider accepted it. This delivery is no longer offered to you.'
                  else 'Merta Deal withdrew this request. This delivery is no longer offered to you.' end,
    jsonb_build_object('assignment_id', new.id, 'order_id', o.id, 'order_number', o.order_number, 'reason', v_reason));
  return null;
end $$;
revoke all on function public._rider_offer_withdrawn_notice() from public, anon, authenticated;

drop trigger if exists delivery_assignments_withdrawn_notice_trg on public.delivery_assignments;
create constraint trigger delivery_assignments_withdrawn_notice_trg
  after update of status on public.delivery_assignments
  deferrable initially deferred
  for each row when (old.status = 'offered' and new.status in ('expired', 'cancelled'))
  execute function public._rider_offer_withdrawn_notice();

-- ---------------------------------------------------------------------------
-- 4. The gate: claim, then record
-- ---------------------------------------------------------------------------
create or replace function public._rider_alert_event_key(p_type text, p_data jsonb, p_id uuid)
returns text language sql immutable as $$
  select case when p_type = 'delivery_offer' then 'offer:' else 'released:' end || coalesce(nullif(p_data ->> 'assignment_id', ''), p_id::text);
$$;

/** Closes the row for the scheduler (`sent_push`) once every channel of its current event has a final outcome. */
create or replace function public._rider_alert_settle(p_notification_id uuid, p_event_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n public.notifications; v_max int := greatest(1, public.get_setting_num('rider_alert_max_attempts', 3))::int; v_open int;
begin
  select * into n from public.notifications where id = p_notification_id for update;
  -- A re-offer has moved the row on to a new event: the old event's outcome must not close the new one.
  if n.id is null or public._rider_alert_event_key(n.type, n.data, n.id) <> p_event_key then return false; end if;
  select count(*) into v_open
  from unnest(case when n.type = 'delivery_offer' then array['push', 'sms'] else array['push'] end::public.notification_channel[]) as c(channel)
  where not exists (select 1 from public.notification_deliveries d
                    where d.notification_id = n.id and d.channel = c.channel and d.event_key = p_event_key
                      and (d.status in ('sent', 'delivered', 'no_recipient', 'unavailable', 'skipped') or (d.status = 'failed' and d.attempts >= v_max)));
  if v_open > 0 then return false; end if;
  update public.notifications set sent_push = true where id = n.id and not sent_push;
  return true;
end $$;
revoke all on function public._rider_alert_settle(uuid, text) from public, anon, authenticated;

/** Rider alerts still waiting for an outcome, oldest first. Server only. */
create or replace function public.rider_alert_queue(p_limit int default 50, p_order_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'FORBIDDEN'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'type', q.type) order by q.created_at), '[]'::jsonb) from (
    select n.id, n.type, n.created_at from public.notifications n
    where n.type in ('delivery_offer', 'delivery_cancelled') and not n.sent_push
      -- Anything older is history: its request has long run out, and claiming it would only record a skip.
      and n.created_at > now() - interval '2 hours'
      and (p_order_id is null or n.data ->> 'order_id' = p_order_id::text)
    order by n.created_at limit greatest(1, least(coalesce(p_limit, 50), 500))
  ) q);
end $$;
revoke all on function public.rider_alert_queue(int, uuid) from public, anon, authenticated;
grant execute on function public.rider_alert_queue(int, uuid) to service_role;
create index if not exists notifications_rider_alert_queue_idx on public.notifications (created_at) where type in ('delivery_offer', 'delivery_cancelled') and not sent_push;

/**
 * Asks to send one rider alert on one channel, immediately before the provider is called. Returns
 * `send: true` with the few fields a message may carry (order number and ids only), or `send: false`
 * with why. Everything is decided under a lock on the notification row, so two workers never both
 * get `send: true` for the same event and channel.
 */
create or replace function public.rider_alert_claim(p_notification_id uuid, p_channel public.notification_channel)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n public.notifications; a public.delivery_assignments; o public.orders; dp public.delivery_partners; d public.notification_deliveries;
  v_kind text; v_event text; v_skip text; v_why text; v_prefs jsonb; v_reason text;
  v_max int := greatest(1, public.get_setting_num('rider_alert_max_attempts', 3))::int;
  v_notice int := greatest(1, public.get_setting_num('rider_alert_notice_minutes', 15))::int;
  v_lease constant int := 60;
begin
  if auth.uid() is not null then raise exception 'FORBIDDEN'; end if;
  if p_channel not in ('push', 'sms') then raise exception 'INVALID_CHANNEL: %', p_channel; end if;
  select * into n from public.notifications where id = p_notification_id and type in ('delivery_offer', 'delivery_cancelled') for update;
  if n.id is null then return jsonb_build_object('send', false, 'reason', 'not_found'); end if;
  v_kind := case when n.type = 'delivery_offer' then 'offer' else 'released' end;
  v_event := public._rider_alert_event_key(n.type, n.data, n.id);
  -- SMS is for requests only; a "no longer yours" notice goes in-app and by push.
  if v_kind = 'released' and p_channel = 'sms' then return jsonb_build_object('send', false, 'reason', 'not_applicable', 'event_key', v_event); end if;

  select * into d from public.notification_deliveries where notification_id = n.id and channel = p_channel and event_key = v_event for update;
  if d.status in ('sent', 'delivered') then return jsonb_build_object('send', false, 'reason', 'already_sent', 'event_key', v_event); end if;
  if d.status in ('skipped', 'no_recipient', 'unavailable') then
    perform public._rider_alert_settle(n.id, v_event);
    return jsonb_build_object('send', false, 'reason', d.status, 'event_key', v_event);
  end if;

  if n.data ->> 'assignment_id' ~ '^[0-9a-fA-F-]{36}$' then select * into a from public.delivery_assignments where id = (n.data ->> 'assignment_id')::uuid; end if;
  select * into o from public.orders where id = a.order_id;
  select * into dp from public.delivery_partners where user_id = n.user_id;
  select p.preferences into v_prefs from public.profiles p where p.id = n.user_id;

  -- Is it still this rider's, right now?
  if a.id is null or o.id is null then v_skip := 'assignment_missing'; v_why := 'The assignment no longer exists.';
  elsif dp.id is null or a.rider_id <> dp.id then v_skip := 'not_this_rider'; v_why := 'The assignment belongs to another rider.';
  elsif v_kind = 'offer' then
    if o.status in ('cancelled', 'rejected') then v_skip := 'order_cancelled'; v_why := 'The order was cancelled before the alert went out.';
    elsif a.status in ('accepted', 'picked_up', 'delivered') then v_skip := 'already_accepted'; v_why := 'The rider had already accepted it.';
    elsif a.status = 'rejected' then v_skip := 'declined'; v_why := 'The rider had already declined it.';
    elsif a.status = 'cancelled' then v_skip := 'withdrawn'; v_why := 'The request was withdrawn before the alert went out.';
    elsif a.status = 'expired' and exists (select 1 from public.delivery_assignments x where x.order_id = a.order_id and x.id <> a.id and x.status in ('accepted', 'picked_up', 'delivered'))
      then v_skip := 'taken'; v_why := 'Another rider accepted it first.';
    elsif a.status = 'expired' or a.expires_at <= now() then v_skip := 'expired'; v_why := 'The request ran out before the alert went out.';
    elsif o.status <> 'ready_for_pickup' then v_skip := 'order_not_waiting'; v_why := 'The order is no longer waiting for a rider.';
    end if;
  else
    if exists (select 1 from public.delivery_assignments x where x.order_id = a.order_id and x.rider_id = dp.id and x.id <> a.id
               and (x.status in ('accepted', 'picked_up') or (x.status = 'offered' and x.expires_at > now())))
      then v_skip := 'assigned_again'; v_why := 'The delivery is with this rider again.';
    elsif n.created_at < now() - make_interval(mins => v_notice) then v_skip := 'too_old'; v_why := format('The notice was more than %s minutes old.', v_notice);
    -- A request the phone was never told about has nothing to take back: the notice stays in the app only.
    elsif n.data ? 'reason' and not exists (
        select 1 from public.notification_deliveries x join public.notifications m on m.id = x.notification_id
        where m.user_id = n.user_id and m.type = 'delivery_offer' and x.channel = 'push' and x.event_key = 'offer:' || a.id::text and x.status in ('sent', 'delivered'))
      then v_skip := 'request_never_pushed'; v_why := 'The request itself was never pushed to this rider, so there was nothing to take back.';
    end if;
  end if;
  if v_skip is null and p_channel = 'sms' then
    if not public.get_setting_bool('rider_sms_alerts_enabled', true) then v_skip := 'sms_switched_off'; v_why := 'Rider SMS alerts are switched off in Settings.';
    elsif coalesce(v_prefs ->> 'rider_sms_alerts', 'false') <> 'true' then v_skip := 'sms_not_opted_in'; v_why := 'The rider has not switched SMS alerts on.';
    end if;
  end if;

  if v_skip is not null then
    if d.id is null then
      insert into public.notification_deliveries (notification_id, channel, event_key, status, attempts, error) values (n.id, p_channel, v_event, 'skipped', 0, v_skip || ': ' || v_why);
    else
      update public.notification_deliveries set status = 'skipped', error = v_skip || ': ' || v_why, updated_at = now() where id = d.id;
    end if;
    perform public._rider_alert_settle(n.id, v_event);
    return jsonb_build_object('send', false, 'reason', v_skip, 'skipped', true, 'event_key', v_event);
  end if;

  -- Another worker holds this send and has not reported back yet.
  if d.status = 'queued' and d.updated_at > now() - make_interval(secs => v_lease) then
    return jsonb_build_object('send', false, 'reason', 'in_flight', 'event_key', v_event);
  end if;
  -- A send that never reported back. A push may be tried again (the phone replaces it by tag); an SMS may
  -- already be on its way and is charged, so it is closed instead of risking a second one.
  if d.status = 'queued' and p_channel = 'sms' then
    update public.notification_deliveries set status = 'failed', attempts = greatest(attempts, v_max), updated_at = now(),
      error = 'The send was interrupted before the SMS panel answered. Not retried, so the rider cannot get it twice.' where id = d.id;
    perform public._rider_alert_settle(n.id, v_event);
    return jsonb_build_object('send', false, 'reason', 'interrupted', 'event_key', v_event);
  end if;
  if d.id is not null and d.attempts >= v_max then
    if d.status <> 'failed' then update public.notification_deliveries set status = 'failed', error = coalesce(error, 'Gave up after repeated interrupted sends.'), updated_at = now() where id = d.id; end if;
    perform public._rider_alert_settle(n.id, v_event);
    return jsonb_build_object('send', false, 'reason', 'attempts_exhausted', 'event_key', v_event);
  end if;

  if d.id is null then
    insert into public.notification_deliveries (notification_id, channel, event_key, status, attempts) values (n.id, p_channel, v_event, 'queued', 1) returning * into d;
  else
    update public.notification_deliveries set status = 'queued', attempts = attempts + 1, updated_at = now() where id = d.id returning * into d;
  end if;
  v_reason := case when v_kind = 'offer' then null
                   else coalesce(n.data ->> 'reason', case when o.status in ('cancelled', 'rejected') then 'order_cancelled' else 'unassigned' end) end;
  -- Only what a lock-screen message may show: the order number and ids. No customer, address or amount.
  return jsonb_build_object('send', true, 'event_key', v_event, 'kind', v_kind, 'attempt', d.attempts, 'user_id', n.user_id,
    'order_id', o.id, 'order_number', o.order_number, 'assignment_id', a.id,
    'expires_in_seconds', case when v_kind = 'offer' then greatest(1, ceil(extract(epoch from a.expires_at - now())))::int end,
    'reason', v_reason,
    'after_pickup', v_kind = 'released' and a.picked_up_at is not null,
    'sticky', v_kind = 'offer' or not (n.data ? 'reason'),
    'lang', case when v_prefs ->> 'language' = 'hi' then 'hi' else 'en' end);
end $$;
revoke all on function public.rider_alert_claim(uuid, public.notification_channel) from public, anon, authenticated;
grant execute on function public.rider_alert_claim(uuid, public.notification_channel) to service_role;

/**
 * Stores what the provider answered for a claimed send, or `unavailable` for a channel that is not
 * configured (no claim needed). Sent is final. Attempts are counted by the claim, not here.
 */
create or replace function public.rider_alert_record(p_notification_id uuid, p_channel public.notification_channel, p_status text, p_provider_id text default null, p_error text default null, p_event_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n public.notifications; d public.notification_deliveries; v_event text; v_done boolean;
begin
  if auth.uid() is not null then raise exception 'FORBIDDEN'; end if;
  if p_channel not in ('push', 'sms') then raise exception 'INVALID_CHANNEL: %', p_channel; end if;
  if p_status not in ('sent', 'failed', 'no_recipient', 'unavailable') then raise exception 'INVALID_STATUS: %', p_status; end if;
  select * into n from public.notifications where id = p_notification_id and type in ('delivery_offer', 'delivery_cancelled') for update;
  if n.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  v_event := coalesce(nullif(p_event_key, ''), public._rider_alert_event_key(n.type, n.data, n.id));
  if n.type = 'delivery_cancelled' and p_channel = 'sms' then return jsonb_build_object('ok', true, 'ignored', true, 'event_key', v_event); end if;
  select * into d from public.notification_deliveries where notification_id = n.id and channel = p_channel and event_key = v_event for update;
  if d.id is null then
    insert into public.notification_deliveries (notification_id, channel, event_key, status, attempts, provider_id, error)
    values (n.id, p_channel, v_event, p_status, case when p_status = 'unavailable' then 0 else 1 end, left(p_provider_id, 200), case when p_status = 'sent' then null else left(p_error, 500) end)
    returning * into d;
  elsif d.status in ('sent', 'delivered') then
    return jsonb_build_object('ok', true, 'id', d.id, 'status', d.status, 'attempts', d.attempts, 'already', true, 'event_key', v_event);
  -- A deliberate skip (no longer this rider's) is not turned back into "not configured".
  elsif not (p_status = 'unavailable' and d.status = 'skipped') then
    update public.notification_deliveries
    set status = p_status, provider_id = coalesce(left(p_provider_id, 200), provider_id), error = case when p_status = 'sent' then null else left(p_error, 500) end, updated_at = now()
    where id = d.id returning * into d;
  end if;
  v_done := public._rider_alert_settle(n.id, v_event);
  return jsonb_build_object('ok', true, 'id', d.id, 'status', d.status, 'attempts', d.attempts, 'already', false, 'done', v_done, 'event_key', v_event);
end $$;
revoke all on function public.rider_alert_record(uuid, public.notification_channel, text, text, text, text) from public, anon, authenticated;
grant execute on function public.rider_alert_record(uuid, public.notification_channel, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. A new rider alert wakes the delivery route at once
-- ---------------------------------------------------------------------------
-- The same call run_notification_cron makes every minute, queued through pg_net when a request or a
-- "no longer yours" notice is written, so the push does not wait for the next minute or for an open
-- app. pg_net sends only after the transaction commits. Once per transaction; a no-op until the URL
-- and secret are set (Settings → Integrations) and where pg_net is not installed. It can never fail
-- the dispatch that wrote the row.
create or replace function public._nudge_notification_cron()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if current_setting('merta.rider_alert_nudged', true) = '1' then return null; end if;
  perform set_config('merta.rider_alert_nudged', '1', true);
  v_url := public.get_setting('notifications_cron_url') #>> '{}'; v_secret := public.get_setting('notifications_cron_secret') #>> '{}';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then return null; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return null; end if;
  execute format('select net.http_get(url := %L, headers := %L::jsonb, timeout_milliseconds := 8000)', v_url, jsonb_build_object('Authorization', 'Bearer ' || v_secret)::text);
  return null;
exception when others then
  return null;
end $$;
revoke all on function public._nudge_notification_cron() from public, anon, authenticated;

drop trigger if exists notifications_rider_alert_nudge_ins on public.notifications;
create trigger notifications_rider_alert_nudge_ins after insert on public.notifications
  for each row when (new.type in ('delivery_offer', 'delivery_cancelled') and not new.sent_push)
  execute function public._nudge_notification_cron();
-- A re-offer refreshes the existing row (0051): created_at moves and sent_push goes back to false.
drop trigger if exists notifications_rider_alert_nudge_upd on public.notifications;
create trigger notifications_rider_alert_nudge_upd after update of created_at on public.notifications
  for each row when (new.type = 'delivery_offer' and not new.sent_push and new.created_at is distinct from old.created_at)
  execute function public._nudge_notification_cron();

-- ---------------------------------------------------------------------------
-- 6. What the admin status area reads
-- ---------------------------------------------------------------------------
/** Per channel (push, sms): the latest outcome and the last 24 hours' counts, across rider alerts only. */
create or replace function public.admin_rider_alert_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return (select coalesce(jsonb_object_agg(c.channel, c.row), '{}'::jsonb) from (
    select d.channel::text as channel, jsonb_build_object(
      'last_status', (array_agg(d.status order by d.updated_at desc))[1],
      'last_at', max(d.updated_at),
      'last_error', (array_agg(d.error order by d.updated_at desc))[1],
      'sent_24h', count(*) filter (where d.status in ('sent', 'delivered') and d.updated_at > now() - interval '24 hours'),
      'failed_24h', count(*) filter (where d.status = 'failed' and d.updated_at > now() - interval '24 hours'),
      'skipped_24h', count(*) filter (where d.status = 'skipped' and d.updated_at > now() - interval '24 hours'),
      'no_device_24h', count(*) filter (where d.status = 'no_recipient' and d.updated_at > now() - interval '24 hours')
    ) as row
    from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
    where n.type in ('delivery_offer', 'delivery_cancelled')
    group by d.channel
  ) c);
end $$;
revoke all on function public.admin_rider_alert_summary() from public, anon;
grant execute on function public.admin_rider_alert_summary() to authenticated;

/** Recent rider alerts, newest first: one entry per request or notice, with each channel's outcome. */
create or replace function public.admin_recent_rider_alerts(p_limit int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'notification_id', e.notification_id, 'event_key', e.event_key, 'kind', case when n.type = 'delivery_offer' then 'offer' else 'released' end,
      'at', e.at, 'order_id', n.data ->> 'order_id', 'order_number', coalesce(o.order_number, n.data ->> 'order_number'),
      'rider', p.full_name, 'current', e.event_key = public._rider_alert_event_key(n.type, n.data, n.id), 'deliveries', e.deliveries
    ) order by e.at desc), '[]'::jsonb)
    from (
      select x.notification_id, x.event_key, x.at, x.deliveries from (
        select d.notification_id, d.event_key, max(d.updated_at) as at,
               jsonb_agg(jsonb_build_object('channel', d.channel, 'status', d.status, 'attempts', d.attempts, 'error', d.error, 'provider_id', d.provider_id, 'updated_at', d.updated_at) order by d.channel) as deliveries
        from public.notification_deliveries d join public.notifications m on m.id = d.notification_id
        where m.type in ('delivery_offer', 'delivery_cancelled')
        group by d.notification_id, d.event_key
        union all
        -- Written but not yet picked up by the sender: shown as in-app only so far.
        select m.id, public._rider_alert_event_key(m.type, m.data, m.id), m.created_at, '[]'::jsonb
        from public.notifications m
        where m.type in ('delivery_offer', 'delivery_cancelled') and m.created_at > now() - interval '7 days'
          and not exists (select 1 from public.notification_deliveries d where d.notification_id = m.id and d.event_key = public._rider_alert_event_key(m.type, m.data, m.id))
      ) x order by x.at desc limit greatest(1, least(coalesce(p_limit, 12), 50))
    ) e
    join public.notifications n on n.id = e.notification_id
    join public.profiles p on p.id = n.user_id
    left join public.orders o on o.id::text = n.data ->> 'order_id');
end $$;
revoke all on function public.admin_recent_rider_alerts(int) from public, anon;
grant execute on function public.admin_recent_rider_alerts(int) to authenticated;
