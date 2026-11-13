# Notifications

`dispatchNotification({ userId, title, body, url, channels, data, type })` fans one message out to every requested
channel and returns the real result per channel. Nothing in this folder pretends to send.

```
dispatch.ts                  fan-out + in_app row insert (service role)
providers/push.ts            Web Push (web-push + VAPID), prunes dead subscriptions on 404/410
providers/whatsapp.ts        Meta WhatsApp Cloud API (text inside the 24h window, template otherwise)
providers/sms.ts             MSG91 stub  -> always { sent:false, reason:"not_configured", envVars:[...] }
providers/email.ts           Resend stub -> always { sent:false, reason:"not_configured", envVars:[...] }
types.ts                     NotificationProvider interface, SendResult
```

Every provider exports `isConfigured()` and `send()`. `send()` never throws and returns one of:

| result | meaning |
| --- | --- |
| `{ sent: true, count }` | the transport accepted the message for `count` recipients/devices |
| `{ sent: false, reason: "not_configured", envVars }` | credentials missing (or transport not implemented) — the env vars needed are listed |
| `{ sent: false, reason: "no_recipient" }` | user has no push subscription / phone / email |
| `{ sent: false, reason: "error", detail }` | the transport returned an error; `detail` is the upstream message |

## New-order alerts to admins (0052)

`place_order` writes one `new_order` row per active admin inside its own transaction, so an alert exists only for a
committed order and `notify_user` refuses a second row for the same admin and order. `order-alerts.ts`
(`deliverOrderAlerts`) then sends each row through every configured channel in `ALERT_CHANNELS` (push, WhatsApp,
email) and records the provider's real answer in `notification_deliveries` through `record_notification_delivery`
(one row per notification and channel; `sent` is final, `failed` retries up to `MAX_ATTEMPTS`, an unconfigured
channel is recorded once as `unavailable`). It runs from `after()` in `placeOrderAction`, from `/api/cron/notifications`,
from the admin's "Deliver pending now" tap, and from the staff courier that already delivered push. Messages carry the
order number, total, payment method, item count and the admin order link only. Admin → Notifications shows each
channel's configuration, latest outcome and the recent orders' per-admin results, with "Send me a test alert".

## In-app vs push

Most in-app rows are created by Postgres triggers when orders change (see `supabase/migrations`). Those rows carry
`channels` and `sent_push = false`; the cron below delivers the push part. When the server creates a notification
itself, call `dispatchNotification` with `channels: ["in_app", "push"]` — it inserts the row and sets `sent_push`
according to whether the push actually went out, so the cron only retries real failures.

## Cron routes

Both routes require `Authorization: Bearer ${CRON_SECRET}` (Vercel adds this header automatically when the
`CRON_SECRET` environment variable is set on the project).

| route | what it does |
| --- | --- |
| `GET /api/cron/notifications` | selects `notifications` where `'push' = any(channels) and sent_push = false`, sends push, marks `sent_push = true` (also when the user has no subscription, so the row is not retried forever) |
| `GET /api/cron/expire-unpaid` | calls `expire_unpaid_orders(30)` with the service role: online orders left unpaid for 30 minutes are cancelled |

`vercel.json` schedules these daily on the Hobby plan. Migration 0052 adds `run_notification_cron()`: when the settings
`notifications_cron_url` (= `https://<site>/api/cron/notifications`) and `notifications_cron_secret` (= `CRON_SECRET`) are
filled in under Admin → Settings → Integrations, pg_cron calls the route every minute through pg_net, so alerts go out with
every admin page closed. Until then, delivery happens right after an order is placed and whenever an admin page is open.

`vercel.json` schedules both every 5 minutes. Vercel's Hobby plan only allows crons that run once per day, and the
`*/5` schedules are accepted only on Pro or Enterprise. On Hobby either change the schedules to `0 3 * * *` style
daily runs, or trigger the routes from an external scheduler (GitHub Actions `schedule`, cron-job.org, or Supabase
`pg_cron` + `pg_net` calling the URL with the bearer header). The routes are idempotent, so overlapping calls are safe.

## Environment

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT   pnpm push:keys
SUPABASE_SERVICE_ROLE_KEY                                           reading push_subscriptions, inserting notifications
WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID                    WhatsApp sends
WHATSAPP_NOTIFY_TEMPLATE / WHATSAPP_TEMPLATE_LANG                   approved template with {{1}} title, {{2}} body (optional)
MSG91_AUTH_KEY / MSG91_SENDER_ID / MSG91_TEMPLATE_ID                future SMS transport
RESEND_API_KEY / EMAIL_FROM                                         email (Resend REST; EMAIL_FROM on a verified domain)
CRON_SECRET                                                         protects /api/cron/*
```
