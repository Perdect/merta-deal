# Merta Deal — Merta Ki Shopping, Ab Online.

Hyperlocal grocery marketplace for **Merta City, Rajasthan**: customers order from neighbourhood kirana stores, stores pack, local riders deliver with OTP handover. Built to expand city-by-city (Nagaur, Jodhpur, Ajmer, Pali, Jaipur) through the `cities` and `delivery_zones` tables.

**Flow:** Customer → Merta Deal → Kirana Store → Delivery Partner → Customer

| Surface | Route | Who |
|---|---|---|
| Customer app (PWA) | `/` | shoppers (mobile number + password, optional OTP, or guest checkout) |
| Store portal | `/store` | kirana owners & staff |
| Rider app (PWA) | `/rider` | delivery partners |
| Admin panel | `/admin` | operations team |
| Setup status | `/setup` | shows which integrations are live |

## Stack
Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind CSS 4, Supabase (Postgres + Auth + Storage + Realtime), Razorpay, Google Maps, Web Push (VAPID), Anthropic Claude (optional), WhatsApp Cloud API (optional). Package manager: pnpm.

## Quick start

```bash
pnpm install
cp .env.example .env.local        # fill NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
pnpm dev                          # http://localhost:3000  (redirects to /setup until Supabase is configured)
```

### 1. Database (Supabase)
Create a Supabase project (region `ap-south-1`), then apply, in order, every file in `supabase/migrations/` (SQL editor or `supabase db push`), followed by `supabase/seed.sql` for demo data. The seed creates:

- 10 kirana stores across Merta City (Sadar Bazaar, Station Road, Nagaur Road, Jodhpur Road, Merta Road)
- 150+ real Indian grocery products with ₹ MRPs and 600+ per-store price/stock rows
- 20 customers, 10 riders (6 online), 2 admins, 20 orders in every lifecycle state, reviews, coupons, banners, payouts, tickets

**Every seeded account uses password `Merta@123`:**

| Role | Mobile number |
|---|---|
| Super admin | `9829000001` |
| Admin | `9829000002` |
| Store owner (Jain Kirana Store) | `9414100001` |
| Store owner (Sharma Masala Bhandar) | `9414100008` |
| Customer | `9876500001` |
| Riders | `9001100001` … `9001100010` |

**Login is mobile number + password** (no email). Supabase Auth settings: enable the **Phone** provider and turn **off "Confirm phone"** so sign-up works without an SMS provider (turn it on later with MSG91/Twilio for OTP verification, then set `NEXT_PUBLIC_PHONE_AUTH_ENABLED=true` to also offer OTP login and SMS password reset). Enable **anonymous sign-ins** for scan-to-pay guest checkout (`NEXT_PUBLIC_ANONYMOUS_AUTH_ENABLED=true`). Seeded accounts sign in with the mobile numbers below and password `Merta@123`.

### 2. Integrations (all optional, none faked)
| Integration | Env vars | Without it |
|---|---|---|
| Razorpay (UPI/cards/net banking) | `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` | Online methods are shown as unavailable; Cash on Delivery and wallet work |
| Google Maps | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_SERVER_API_KEY` | Rider GPS still streams in real time; map tiles, reverse geocoding and route ETA show an honest fallback |
| Web Push | `pnpm push:keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | In-app + realtime notifications work; browser push is off |
| Claude AI | `ANTHROPIC_API_KEY` | Assistant and voice ordering use the rule-based Hinglish parser (labelled as such) |
| WhatsApp Cloud API | `WHATSAPP_*` | Webhook returns 503 with the required config |

Razorpay webhook URL: `https://<site>/api/payments/razorpay/webhook`. WhatsApp webhook: `https://<site>/api/webhooks/whatsapp`.

## Scan-to-pay (QR) flow
Printed QR codes point at stable URLs, mirroring the Zayka of Gurgaon pattern:
- `/start` — universal QR: opens the app with the location sheet.
- `/qr/<storeId>` — store QR (immutable id, survives renames) → that store's catalogue.
- `/r/<slug>` — editable short links (Admin → Settings → `qr_links`) so printed codes can be re-pointed.
- `/api/qr?path=/qr/<id>&format=png&size=1024` — QR images; store & admin dashboards render printable posters.
- No app install: the site is a PWA (`public/manifest.webmanifest`, `public/sw.js`, install prompt). Guests can check out with an anonymous session and later save the account.
- `/track` — track any order with order number + mobile, no login.

## Architecture notes
- **Business rules are data**: fees, thresholds, commission, ETAs, COD toggles live in `settings` and `delivery_zones`; admins edit them in the panel.
- **All mutations are Postgres functions** (`SECURITY DEFINER` with role checks): `place_order`, `store_update_order`, `auto_dispatch`, `rider_respond_assignment`, `rider_pickup`, `verify_delivery_otp`, `cancel_order`, … RLS protects every table; the app never needs the service-role key for normal flows.
- **Order statuses**: PLACED → STORE CONFIRMED → PREPARING → READY FOR PICKUP → RIDER ASSIGNED → OUT FOR DELIVERY → DELIVERED → COMPLETED (plus CANCELLED / REJECTED). Stores cannot mark delivered; only the rider's OTP verification can.
- **Pay-first**: online orders can only be accepted by a store once Razorpay confirms payment; unpaid online orders auto-cancel after 30 minutes (`/api/cron/expire-unpaid`).
- **Live delivery**: riders stream `navigator.geolocation` into `delivery_locations` via `record_rider_location`; customers subscribe over Supabase Realtime; the map uses Google Maps when configured.
- **Smart search**: `search_products` expands Hinglish synonyms (`aata → atta`, `chini → sugar`, `lal mirch → red chilli`) from the admin-managed `search_synonyms` table, with full-text + trigram ranking.

## Preview without a Supabase project (local harness)
`pnpm dev:harness` starts PostgREST + Supabase Auth (GoTrue) + a gateway on http://localhost:54321 over the local Postgres copy and writes a harness `.env.local`; then `pnpm dev`. You can browse the full public catalogue, search, store pages, SEO pages, the AI assistant (rule-based mode) and `/track`. Sign-in (mobile + password), guest sessions, cart, checkout and all portals work against the harness; only Realtime and Storage uploads need a real Supabase project (the harness returns 501 for those rather than faking them). `pnpm dev:harness:stop` shuts it down.

## Verification
```bash
pnpm typecheck            # tsc --noEmit
pnpm build                # production build
pnpm db:local:reset       # rebuild a local Postgres copy (needs local Postgres 16, no Docker)
pnpm db:local:test        # 67-check SQL end-to-end lifecycle test (customer → store → rider → OTP → review → admin)
pnpm gen:types            # regenerate src/types/database.ts from the local DB
pnpm smoke                # HTTP smoke test against a running dev server (32 routes)
```

## Project layout
```
supabase/migrations/   schema, functions, RLS, realtime, storage, payments, guest/QR
supabase/seed.sql      realistic Merta City demo data
supabase/local/        Supabase auth shim for local Postgres validation only
src/app/(shop)         customer app      src/app/store   merchant portal
src/app/rider          rider PWA         src/app/admin   admin panel
src/app/api            payments, maps, ai, push, whatsapp, cron, qr, search
src/components/ui      design system     src/components/shop|store|rider|admin|account
src/lib                supabase clients, actions, data, env flags, order rules, parser
```
