-- rollout-0052.sql: paste into the Supabase SQL editor after rollout-0051. Safe to run twice. Ends with one check row:
-- has_0052 = true. Then set the two settings (Admin → Settings → Integrations) if you want the database to call the
-- delivery route every minute: notifications_cron_url and notifications_cron_secret (= CRON_SECRET on Vercel).

-- 0052: new-order alert delivery.
-- A new order already writes one `new_order` notification per active admin inside place_order's
-- transaction (so it exists only once the order is committed). This migration adds what is needed to
-- deliver those alerts to admins' phones and inboxes reliably and honestly:
--   * `notification_deliveries`: one row per notification and channel (push / whatsapp / email) with the
--     provider's real outcome, attempts and last error, so a status screen can show what happened and a
--     retry never sends twice;
--   * `record_notification_delivery`: the only writer; a channel that has been sent is never re-marked;
--   * `notify_user` refuses a second `new_order` row for the same admin and order (duplicate events);
--   * `admin_alert_channel_summary` / `admin_recent_order_alerts`: what the admin status area reads;
--   * `run_notification_cron`: lets pg_cron call the app's delivery route every minute through pg_net,
--     when the URL and secret are set in settings (the hosting plan's own cron only runs daily).

-- ---------------------------------------------------------------------------
-- 1. Delivery tracking
-- ---------------------------------------------------------------------------
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel public.notification_channel not null,
  -- queued: picked up, not yet answered · sent: provider accepted it · delivered: provider confirmed delivery
  -- failed: provider error (retried up to the attempt limit) · unavailable: channel not configured
  -- no_recipient: the admin has no device / phone / email for this channel
  status text not null check (status in ('queued', 'sent', 'delivered', 'failed', 'unavailable', 'no_recipient')),
  attempts int not null default 0,
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel)
);
create index if not exists notification_deliveries_updated_idx on public.notification_deliveries (updated_at desc);
create index if not exists notification_deliveries_channel_status_idx on public.notification_deliveries (channel, status);
comment on table public.notification_deliveries is 'Per-channel outcome of sending a notification (0052). Written only by record_notification_delivery.';

alter table public.notification_deliveries enable row level security;
drop policy if exists notification_deliveries_admin_read on public.notification_deliveries;
create policy notification_deliveries_admin_read on public.notification_deliveries for select using (public.is_admin());

/** Records one attempt's outcome. Idempotent: a channel already sent or delivered keeps that status (`already: true`). */
create or replace function public.record_notification_delivery(p_notification_id uuid, p_channel public.notification_channel, p_status text, p_provider_id text default null, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.notification_deliveries; v_counts boolean := p_status in ('sent', 'delivered', 'failed', 'no_recipient');
begin
  if not public.is_admin_or_service() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('queued', 'sent', 'delivered', 'failed', 'unavailable', 'no_recipient') then raise exception 'INVALID_STATUS: %', p_status; end if;
  select * into d from public.notification_deliveries where notification_id = p_notification_id and channel = p_channel for update;
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
-- 2. One new_order row per admin and order, whatever calls notify_admins twice
-- ---------------------------------------------------------------------------
create or replace function public.notify_user(p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then return; end if;
  if p_type = 'new_order' and p_data ? 'order_id' and exists (
    select 1 from public.notifications where user_id = p_user_id and type = 'new_order' and data ->> 'order_id' = p_data ->> 'order_id'
  ) then return; end if;
  insert into public.notifications (user_id, type, title, body, data, channels)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_data,'{}'::jsonb), '{in_app,push}');
end $$;
create index if not exists notifications_new_order_per_user_idx on public.notifications (user_id, (data ->> 'order_id')) where type = 'new_order';

-- ---------------------------------------------------------------------------
-- 3. What the admin status area reads
-- ---------------------------------------------------------------------------
/** Per channel: the latest outcome and the last 24 hours' counts, across new_order alerts only. */
create or replace function public.admin_alert_channel_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return (select coalesce(jsonb_object_agg(c.channel, c.row), '{}'::jsonb) from (
    select d.channel::text as channel, jsonb_build_object(
      'last_status', (select x.status from public.notification_deliveries x join public.notifications n on n.id = x.notification_id where x.channel = d.channel and n.type = 'new_order' order by x.updated_at desc limit 1),
      'last_at', (select x.updated_at from public.notification_deliveries x join public.notifications n on n.id = x.notification_id where x.channel = d.channel and n.type = 'new_order' order by x.updated_at desc limit 1),
      'last_error', (select x.error from public.notification_deliveries x join public.notifications n on n.id = x.notification_id where x.channel = d.channel and n.type = 'new_order' order by x.updated_at desc limit 1),
      'sent_24h', count(*) filter (where d.status in ('sent', 'delivered') and d.updated_at > now() - interval '24 hours'),
      'failed_24h', count(*) filter (where d.status = 'failed' and d.updated_at > now() - interval '24 hours')
    ) as row
    from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
    where n.type = 'new_order'
    group by d.channel
  ) c);
end $$;
revoke all on function public.admin_alert_channel_summary() from public, anon;
grant execute on function public.admin_alert_channel_summary() to authenticated;

/** Recent orders and how each admin alert for them went, newest first. */
create or replace function public.admin_recent_order_alerts(p_limit int default 10)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'order_id', o.order_id, 'order_number', o.order_number, 'created_at', o.created_at, 'admins', o.admins,
      'deliveries', (select coalesce(jsonb_agg(jsonb_build_object('channel', d.channel, 'status', d.status, 'attempts', d.attempts, 'error', d.error, 'updated_at', d.updated_at, 'admin', p.full_name) order by d.channel, d.updated_at desc), '[]'::jsonb)
                     from public.notification_deliveries d join public.notifications n on n.id = d.notification_id join public.profiles p on p.id = n.user_id
                     where n.type = 'new_order' and n.data ->> 'order_id' = o.order_id)
    ) order by o.created_at desc), '[]'::jsonb)
    from (
      select n.data ->> 'order_id' as order_id, max(n.data ->> 'order_number') as order_number, min(n.created_at) as created_at, count(*) as admins
      from public.notifications n where n.type = 'new_order' and n.data ? 'order_id'
      group by n.data ->> 'order_id' order by min(n.created_at) desc limit greatest(1, least(p_limit, 50))
    ) o);
end $$;
revoke all on function public.admin_recent_order_alerts(int) from public, anon;
grant execute on function public.admin_recent_order_alerts(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Scheduler inside the database: pg_cron → pg_net → /api/cron/notifications every minute
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, "group", label, description, is_public) values
  ('notifications_cron_url', '""', 'integrations', 'Notification delivery URL (called every minute)',
   'Full URL of /api/cron/notifications on the live site, e.g. https://mertadeal.com/api/cron/notifications. With the secret below, the database calls it every minute so push, WhatsApp and email alerts for new orders go out even when no admin page is open. Leave empty to rely on the hosting cron.', false),
  ('notifications_cron_secret', '""', 'integrations', 'Notification delivery secret (CRON_SECRET)',
   'The same value as the CRON_SECRET environment variable on the hosting. Sent as a bearer token with the call above. Visible to admins only.', false)
on conflict (key) do nothing;

/** Calls the delivery route when the URL and secret are set and pg_net is installed. Returns true when a call was queued. */
create or replace function public.run_notification_cron()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_url text := public.get_setting('notifications_cron_url') #>> '{}'; v_secret text := public.get_setting('notifications_cron_secret') #>> '{}';
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then return false; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return false; end if;
  -- Dynamic SQL: the function must compile on databases without pg_net.
  execute format('select net.http_get(url := %L, headers := %L::jsonb, timeout_milliseconds := 8000)', v_url, jsonb_build_object('Authorization', 'Bearer ' || v_secret)::text);
  return true;
end $$;
revoke all on function public.run_notification_cron() from public, anon;
grant execute on function public.run_notification_cron() to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    begin
      create extension if not exists pg_net;
    exception when others then null;
    end;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'merta_notification_cron';
    perform cron.schedule('merta_notification_cron', '* * * * *', 'select public.run_notification_cron()');
  end if;
exception when others then
  raise notice 'notification cron not scheduled: %', sqlerrm;
end $$;

-- Check
select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notification_deliveries')
  and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'record_notification_delivery')
  and exists (select 1 from public.settings where key = 'notifications_cron_url') as has_0052,
  exists (select 1 from pg_extension where extname = 'pg_net') as pg_net_installed,
  (select count(*) from cron.job where jobname = 'merta_notification_cron') as cron_jobs;
