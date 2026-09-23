# Go-live checklist

## Status (23 Sep 2026)
- **Live:** https://merta-deal.vercel.app — Vercel project `merta-deal`, production deploy, public.
- **Blocked on:** a Supabase project. Until one is connected the site serves `/setup`, which lists
  every missing variable rather than pretending the app works.
- `aether-schoolos` was paused on 23 Sep 2026 to free a free-plan slot (data intact, restorable from
  the Supabase dashboard at any time).
- `vercel.json` runs both crons **daily**, not every 5 minutes — see [CRONS.md](CRONS.md).

## A. Supabase project
1. Create a project in region **ap-south-1** (Mumbai). The free plan allows 2 active projects per org — pause or upgrade if the limit is hit.
2. Apply migrations + seed: `SUPABASE_DB_URL=... ./scripts/db-remote-apply.sh --seed` (or paste each `supabase/migrations/*.sql` into the SQL editor in order, then `supabase/seed.sql`).
3. Verify `select rolbypassrls from pg_roles where rolname = 'postgres';` returns `t` (SECURITY DEFINER functions rely on it).
4. Auth → Providers: enable **Phone** and turn off "Confirm phone" (login is mobile + password; no SMS provider needed). Enable **Anonymous sign-ins** (guest checkout). Optionally add an SMS provider (MSG91/Twilio) and set `NEXT_PUBLIC_PHONE_AUTH_ENABLED=true` for OTP login and password reset by SMS.
5. Auth → URL configuration: Site URL = your domain; add `https://<domain>/login` and `/account/settings` to redirect URLs.
6. Storage: buckets are created by `0005_storage.sql`. Confirm they exist.
7. Realtime: tables are added to `supabase_realtime` by `0004`. Confirm under Database → Replication.
8. Copy Project URL + anon key (+ service role key for server) into `.env.local` / hosting env vars.

## B. Hosting (Vercel recommended)
- Set every env var from `.env.example`. `NEXT_PUBLIC_SITE_URL` must be the public domain (used by QR codes, sitemap, OG image, email redirects).
- `vercel.json` schedules `/api/cron/expire-unpaid` and `/api/cron/notifications`; set `CRON_SECRET`.

## C. Payments
- Razorpay dashboard → Webhooks → `https://<domain>/api/payments/razorpay/webhook`, events `payment.captured`, `payment.failed`, `refund.processed`, secret = `RAZORPAY_WEBHOOK_SECRET`.
- Test with Razorpay test keys before live keys.

## D. Maps, push, AI, WhatsApp
- Google Cloud: enable Maps JavaScript API, Geocoding API, Distance Matrix API; restrict the browser key by HTTP referrer and the server key by IP.
- `pnpm push:keys` → VAPID keys.
- `ANTHROPIC_API_KEY` for the shopping assistant; without it the rule-based parser is used and labelled.
- Meta for Developers → WhatsApp → set webhook `https://<domain>/api/webhooks/whatsapp` with `WHATSAPP_VERIFY_TOKEN`; subscribe to `messages`.

## E. Operations
- Admin → Delivery: confirm zones, fees, ETAs for Merta City; add new cities/zones when expanding.
- Admin → Settings: commission default, platform fee, GST on fees, COD/online toggles, QR short links.
- Print store QR posters from Store → Profile → QR & marketing (`/qr/<storeId>`), and the universal poster (`/start`).
