# Merta Deal — launch audit (13 Oct 2026)

**Verdict: No-go for a full launch today; ready for a cash-on-delivery soft launch once the owner completes the
20-minute signed-in walkthrough at the end of this file.** Server-side access control, the order/delivery
database flows and the public site are verified. The signed-in screens of the admin panel, store panel,
rider app and customer checkout were not exercised in a browser: there is no staging environment and
the assistant cannot sign in with real credentials.

Status key: **Passed** (verified, evidence given) · **Failed** (broken, still open) · **Fixed** (was broken,
fixed and re-tested) · **Blocked** (needs access we don't have) · **Not tested** · **Missing** (feature does not exist).

Evidence types: *Live DB* = run on production as the real role (RLS applies), with owner approval ·
*Local DB* = all migrations + seed in PGlite (`scripts/test-security.mjs`, `scripts/test-lifecycle.sql`) ·
*HTTP* = requests to mertadeal.com · *Browser* = local build in the in-app browser.

## 1. Authentication and permissions

| Item | Status | Evidence |
|---|---|---|
| Separate logins: `/login` (customer), `/admin/login`, `/rider/login`; store uses customer login | Passed | HTTP: signed-out `/admin*`, `/rider*`, `/store*`, `/account`, `/checkout` redirect to the right login with `next` |
| Admin/rider login admits only the right role, signs others out | Passed (logic) / Blocked (real sign-in) | Code review + `staffSignInAction`; real PIN sign-in not performed |
| Public sign-up can never create admin/rider/store roles | Passed | Local DB: 6 checks incl. metadata role injection |
| Customers can't raise their own role, self-activate as rider, or insert profiles with roles | Fixed | Live hole closed by 0023; Local DB checks |
| Deactivated admin loses access immediately | Fixed | Local DB |
| Redirect validation (`//evil.com`, absolute URLs, backslashes) | Fixed | 15-case unit check; proxy + actions use `safeNext` |
| Anonymous visitors calling `notify_user` / `audit` (phishing via push) | Fixed | HTTP to PostgREST: `permission denied` (401) |
| Cross-account reads (orders, addresses, assignments, OTP) | Passed | Local DB RLS checks as `authenticated` role |
| Store staff changing bank/UPI/PAN | Fixed | Local DB |
| Protected APIs without a session (refund, import-image, push/send, cron) | Passed | HTTP 403/401 |
| PIN recovery (admin-assisted reset) | Blocked | Needs a signed-in admin; service key is now configured (`/setup` shows LIVE) |
| Invalid credentials, logout, session expiry UI | Not tested | Needs real sign-in |

## 2. Customer

| Item | Status | Evidence |
|---|---|---|
| Serviceability inside/outside Merta | Passed | HTTP `/api/location/serviceability` |
| Home, categories, category, product pages (86 sitemap URLs) | Passed | HTTP 200 on all |
| New Categories screen (tabs, tiles, grouping, Back restores tab + scroll) | Passed | Browser at 320–1280 px |
| Search and suggestions | Passed / Fixed | Hidden products leaked into search (fixed, 0025) |
| Shop filters "Clear all" | Fixed | Browser: did nothing before, re-tested |
| Cart limit 5 per product (owner's choice) | Passed | Local DB 34 checks; live carts: no line above 5 |
| Bill: ₹19 delivery below ₹199 | Passed | Live DB order MD2610001027: ₹100 + ₹19 = ₹119 |
| Place COD order | Passed | Live DB as customer |
| Tracking (status, OTP only while out for delivery) | Passed | Live DB `order_tracking` |
| Cancellation + restock | Passed (Local DB) | Not repeated live |
| Online payment, failure, retry, refunds | Blocked | Razorpay not configured (COD only); "retry payment" link known broken |
| Addresses, account, support ticket UI | Not tested | Needs a customer sign-in |
| `/account/notifications` crash | Fixed | Root cause reproduced (duplicate realtime channel) |

## 3. Store

| Item | Status | Evidence |
|---|---|---|
| Accept → preparing → ready (auto-dispatch) | Passed | Live DB |
| Product list/edit/stock/visibility UI (all widths, filters, failures) | Passed | Browser preview with live catalogue data, no session |
| Product save keeps live stock and visibility | Fixed | 0024; Live DB: stock 5→3 kept after price edit, stayed hidden |
| Category shown for 130 products | Fixed | Form showed "Choose a category" |
| Store listings vs customer catalogue (165 vs 66) | Fixed | 99 archived products' listings hidden (audited) |
| Changes appear in the customer app | Passed | Hidden ⇒ not in search; visible ⇒ appears (Live DB, rolled back) |
| `/store/notifications` crash | Fixed | Same realtime bug |
| Dashboard, orders, inventory, customers, payments, earnings, profile, settings screens | Not tested | Needs a store sign-in |
| Store reject order | Not tested live | Covered by lifecycle function tests only |

## 4. Admin

| Item | Status | Evidence |
|---|---|---|
| Rider approval grants the role | Passed | Local DB |
| Rider payouts, support-confirmed delivery | Passed | Local DB (payout create/settle/fail, audited) |
| Cash hand-over (new) | Passed | Local DB + live record of the test order's ₹119 |
| Order reassignment after a failed attempt | Passed | Local DB |
| Filter panel Apply/Clear on phones | Fixed | Navigation race; not browser-tested (needs admin session) |
| All admin screens in a browser | Blocked | Needs an admin sign-in |

## 5. Delivery rider

| Item | Status | Evidence |
|---|---|---|
| Offer shows area only; accept; pickup | Passed | Live DB |
| Wrong OTP counted; COD needs cash confirmation; correct OTP delivers | Passed | Live DB |
| Duplicate completion | Passed | Live DB: second call "already", no extra reward/earning |
| Other riders can't read/act on the order | Passed | Local DB |
| Failed delivery → back to store → reassign → deliver (new) | Passed | Local DB (12 checks) |
| Earnings ledger and cash to hand over | Passed | Live DB |
| `/rider/profile` crash | Fixed | Same realtime bug |
| Rider app screens in a browser | Blocked | Needs a rider sign-in |

## 6. Cross-cutting UX

| Item | Status | Evidence |
|---|---|---|
| Portal themes (green/blue/orange) and labels | Passed | Browser + computed contrast ≥ 4.5:1 text, ≥ 3:1 focus/borders |
| Touch targets ≥ 44px on new screens | Passed | Measured in browser |
| Keyboard focus visible, tab order, arrow-key tabs | Passed | Browser |
| Fixed bars never cover content (categories) | Passed | 55px clearance at 320/390 px |
| Phone app bar off-screen / cart clipped | Fixed | Browser at all widths |

## Open issues (ranked)

1. **High — Signed-in screens unverified in a browser** (admin, store, rider, customer checkout). Blocked by access.
2. **High — Online payments not configured.** Fine for a COD-only launch; "retry payment" link is broken and must be fixed before enabling Razorpay.
3. **Medium — One active rider** (the owner). Approve real riders from `/deliver` applications first.
4. **Medium — Scheduled jobs run once a day** (Vercel Hobby). Only matters once online payments are on.
5. **Low — Missing product pages return HTTP 200** (they show "not found" and are `noindex`).
6. **Low — `/setup` is public** (lists which integrations are configured, not secrets).
7. **Housekeeping — test data in production:** order MD2610001027 (₹119, delivered) counts in GMV/reports; its ₹20 rider
   earning is payable to the owner (don't pay out); product "QA TEST – do not buy" is hidden.

## Missing features (not bugs)
- Self-service PIN reset by SMS (needs an SMS provider); admin-assisted reset exists.
- Referral redemption and reward-point spending; wallet top-up.

## Owner walkthrough to reach "Go" (about 20 minutes, on a phone)
1. `/admin/login` → sign in → open Orders, Riders, Rider payouts, Delivery, Settings. Reset the PIN of your own second number (0737).
2. `/login` with 0737 → add 2 items → checkout COD to a Merta address.
3. `/store` (7676) → accept → preparing → ready.
4. `/rider/login` (7676) → accept → picked up → tap "Can't complete this delivery?" once and cancel the sheet → complete with the customer's code and cash.
5. Check: customer sees Delivered; admin Rider payouts shows the earning and "Cash held"; record the cash.
Report anything that looks wrong; everything behind these screens is already verified at the database level.
