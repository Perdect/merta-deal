# Testing Merta Deal

## 1. Database lifecycle test (no Supabase needed)
```bash
pnpm db:local:reset     # local Postgres 16: shim + migrations + seed
pnpm db:local:test      # 67 assertions
```
Covers: Hinglish search (aata/chini/lal mirch), typeahead, home feed, serviceability, RLS isolation (customer/store/rider/anon), cart + coupons + totals, place order (COD), stock decrement, OTP visibility (customer yes / store no / rider no), store accept → preparing → ready → auto-dispatch, rider accept → GPS → pickup → wrong OTP → correct OTP → delivered → COD collected, reward points, reviews + admin moderation → rating recompute, reorder, cancel + restock, audit logs, settings edit.

## 2. App smoke test (needs a configured Supabase project)
```bash
pnpm dev & sleep 8; BASE=http://localhost:3000 node scripts/smoke.mjs
```

## 3. Manual end-to-end (four browsers/tabs)
1. **Customer** `9876500001` / `Merta@123` → pick location (341510) → search "aata" → open product → BUY NOW → address → COD → place. Note the OTP on the order page.
2. **Store** `9414100001` → Orders → New → ACCEPT → PREPARING → READY FOR PICKUP (auto-dispatch offers the nearest online rider).
3. **Rider** `9001100002` (online) → New request → ACCEPT → Go to store → PICKED UP → Go to customer → enter the customer's OTP → DELIVERED.
4. **Customer** sees live status changes (Realtime) and rates the order; **Admin** `9829000001` moderates the review and sees KPIs.

Payment (Razorpay test mode): choose UPI at checkout → Razorpay test checkout → success → verify → store can accept.
