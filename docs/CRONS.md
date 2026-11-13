# Scheduled jobs

Two endpoints need to run on a timer:

| Path | What it does | Wanted | On Vercel Hobby |
| --- | --- | --- | --- |
| `/api/cron/notifications` | New-order alerts to admins (push, WhatsApp, email; 0052) and any other queued push | every minute | daily 03:00 UTC, or every minute from the database once `notifications_cron_url` + `notifications_cron_secret` are set (Admin → Settings → Integrations) |
| `/api/cron/expire-unpaid`  | Releases stock held by orders that were never paid | every 5 min | daily 03:00 UTC |
| `/api/cron/housekeeping` | `run_order_housekeeping()` (0050): expires stale rider offers and re-offers waiting orders, sets quiet riders offline, expires item exceptions, escalates unattended orders, cancels unpaid orders after `payment_pending_minutes` | every minute | daily 03:05 UTC |

**Housekeeping does not need Vercel at all.** Migration 0050 schedules `select public.run_order_housekeeping()`
every minute with `pg_cron` inside the Supabase database when that extension is available (it is on
Supabase; the migration enables it and creates the job `merta_order_housekeeping`). Check with
`select * from cron.job` and `select * from cron.job_run_details order by start_time desc limit 10`.
The Vercel entry above is only a fallback. Push delivery still needs the notifications route, so that
one still wants a real schedule.

`vercel.json` ships the **daily** schedule because a Hobby account rejects anything
more frequent (`Hobby accounts are limited to daily cron jobs`). Daily is too slow for
real trading: an unpaid order holds its stock until the next run, and notifications
queue up instead of going out.

Restore the real cadence by editing `vercel.json` back to `*/5 * * * *` once the
account is on Pro:

```json
{ "path": "/api/cron/notifications", "schedule": "*/5 * * * *" }
```

Both endpoints are ordinary authenticated routes, so any external scheduler works too
(cron-job.org, GitHub Actions, a cheap VPS crontab) if you would rather not upgrade —
point it at `https://<your-domain>/api/cron/<name>` every five minutes.
