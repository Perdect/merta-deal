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

## Rider alerts (0058)

A delivery request (`delivery_offer`) and a "no longer yours" notice (`delivery_cancelled`) are written by the
database when the assignment changes; `rider-alerts.ts` (`deliverRiderAlerts`) sends them to the rider's phone by
push and, for requests only, by SMS. The loop itself is `rider-alerts-core.ts` (no server imports, so
`scripts/test-rider-alerts.mjs` runs it against PGlite with stub providers).

- **Who is alerted is decided in the database, at the last moment.** Before every send the loop calls
  `rider_alert_claim(notification, channel)`, which locks the row, re-reads the assignment and the order, and
  answers `send: false` with a reason when the delivery is no longer that rider's (expired, taken by another rider,
  withdrawn, order cancelled, already accepted, given back to them). That refusal is stored as `skipped` with the
  reason. Only a `send: true` grant is sent, and the grant carries the order number and ids, nothing else.
- **One send per event and channel.** One `delivery_offer` row is refreshed for every re-offer (0051), so outcomes
  are keyed by `event_key` (`offer:<assignment>` / `released:<assignment>`) under the unique index
  `notification_deliveries_one_per_event_idx`. A second claim while one is out is refused (`in_flight`), sent is
  final, failures stop at the setting `rider_alert_max_attempts`, an SMS claim that never reported back is closed
  rather than repeated, and an unconfigured channel is recorded once as `unavailable`.
- **SMS** needs its own DLT-approved template (`PARKEN_RIDER_ALERT_TEMPLATE_ID`, `PARKEN_RIDER_ALERT_TEMPLATE` with
  `{order}`, `PARKEN_RIDER_ALERT_ROUTE`, plus the panel key and sender), the setting `rider_sms_alerts_enabled`, and
  the rider's own switch (`profiles.preferences.rider_sms_alerts`, Profile tab). The login OTP template cannot be
  used and is refused as configuration. The `providers/sms.ts` MSG91 stub is unrelated and still sends nothing.
- **Where it runs:** `/api/cron/notifications` (also called at once through pg_net when a rider alert is written,
  once the cron URL and secret are set), `after()` in the rider's answer / online actions and the admin's assign /
  unassign / re-dispatch actions, and the open staff apps' courier. The older push sweep skips rider alert rows
  once 0058 is applied; before that it sends them as it always did.
- **Seen by staff** under Admin → Notifications → Rider alerts (`admin_rider_alert_summary`,
  `admin_recent_rider_alerts`): channel, state, attempts and the provider's answer or the skip reason.

## Delivery code at the door (0059)

When the assigned rider marks "reached the customer" (`rider_mark_arrived`), the database asks for one delivery
code SMS for that assignment and writes the customer a `delivery_code` notification with no code in it.
`delivery-code.ts` (`deliverDeliveryCode`) then runs from `after()` in `riderArrivedAction`, and inline from the
rider's resend. The step itself is `delivery-code-core.ts` (no server imports, so `scripts/test-delivery-otp.mjs`
runs it against PGlite with a stand-in for the SMS panel).

- **The code exists nowhere in plain text.** `delivery_otp_claim` (service role only) mints it under locks on the
  assignment, the order and the code row, stores `sha256(salt:code)` and returns the code once, for one SMS. The
  sender holds it in one local variable; it is not returned, logged or put into a recorded error. `order_secrets`
  is readable by security-definer functions only.
- **One SMS per request.** A request is `pending` until claimed, `queued` until the panel answers, then `sent`
  (the panel accepted it), `failed` (its refusal or a timeout) or `unavailable`. A second claim is refused
  (`in_flight` / `nothing_pending`); marking arrived again asks for nothing; a resend is the rider's explicit
  request (`rider_resend_delivery_otp`: cooldown and cap from settings) and withdraws the earlier SMS code.
- **Not configured is the normal state until the owner has a template.** It needs its own DLT-approved template
  (`PARKEN_DELIVERY_OTP_TEMPLATE_ID`, `PARKEN_DELIVERY_OTP_TEMPLATE` with `{otp}`, `PARKEN_DELIVERY_OTP_ROUTE`, plus
  the panel key and sender) and the setting `delivery_otp_sms_enabled`. The login OTP template is refused as
  configuration (same ID, same text, or the word "login"). Without it no claim is made, the request is recorded
  `unavailable`, and the customer opens a code on their own order screen (`customer_delivery_code`), which works
  alongside any SMS code.
- **Recorded through the same pipeline:** each request's outcome goes through `record_notification_delivery`
  (channel `sms`) against its `delivery_code` notification. Admin → Notifications → Delivery codes reads
  `admin_delivery_code_log`: order number, request kind, state, attempts and the panel's answer. No code, number
  or name.

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
MSG91_AUTH_KEY / MSG91_SENDER_ID / MSG91_TEMPLATE_ID                future SMS transport (stub; unused)
PARKEN_RIDER_ALERT_TEMPLATE_ID / _TEMPLATE / _ROUTE (/ _SENDER)     rider SMS alerts (with PARKEN_SMS_KEY); own DLT template
PARKEN_DELIVERY_OTP_TEMPLATE_ID / _TEMPLATE / _ROUTE (/ _SENDER)    delivery code SMS (with PARKEN_SMS_KEY); own DLT template
RESEND_API_KEY / EMAIL_FROM                                         email (Resend REST; EMAIL_FROM on a verified domain)
CRON_SECRET                                                         protects /api/cron/*
```
