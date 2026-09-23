# Scheduled jobs

Two endpoints need to run on a timer:

| Path | What it does | Wanted | On Vercel Hobby |
| --- | --- | --- | --- |
| `/api/cron/notifications` | Fans out queued push/SMS/WhatsApp notifications | every 5 min | daily 03:00 UTC |
| `/api/cron/expire-unpaid`  | Releases stock held by orders that were never paid | every 5 min | daily 03:00 UTC |

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
