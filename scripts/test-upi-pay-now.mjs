// UPI before packing (0042): a UPI order waits as placed / payment pending, the customer can say they paid,
// an admin marking it received confirms the order in one step, not received keeps it waiting, and an unpaid
// order can be switched to cash on delivery. Also: the option is off when the settings are off.
// Loads every migration + seed into PGlite. Run from the project folder:
//   node scripts/test-upi-pay-now.mjs "$PWD"
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";

const root = process.argv[2];
const db = await PGlite.create({ extensions: { pg_trgm } });
const read = (p) => fs.readFileSync(`${root}/${p}`, "utf8");
async function exec(label, sql) { try { await db.exec(sql); } catch (e) { console.error(`SETUP FAIL ${label}: ${e.message}`); process.exit(1); } }

await exec("shim", read("supabase/local/00_supabase_shim.sql"));
await exec("stubs", `
  create or replace function extensions.unaccent(text) returns text language sql immutable as $$ select $1 $$;
  create or replace function extensions.crypt(text, text) returns text language sql as $$ select md5($1) $$;
  create or replace function extensions.gen_salt(text) returns text language sql as $$ select 'salt' $$;
  create or replace function extensions.gen_random_bytes(int) returns bytea language sql as $$ select substring(decode(repeat(md5(random()::text), 8), 'hex') from 1 for $1) $$;`);
await exec("auth", read("supabase/local/00b_auth_tables_fallback.sql"));
const migrations = fs.readdirSync(`${root}/supabase/migrations`).filter((f) => f.endsWith(".sql")).sort();
for (const f of migrations) await exec(f, read(`supabase/migrations/${f}`).replace(/create extension if not exists "(pgcrypto|unaccent)"[^;]*;/g, ""));
await exec("seed", read("supabase/seed.sql"));
console.log(`loaded ${migrations.length} migrations + seed`);

let pass = 0, fail = 0;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); } };
const as = async (uid, role) => { await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]); await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [role ?? (uid ? "authenticated" : "")]); };
// 0059: no delivery code is stored in plain text. The customer opens one on their own order screen, as the app does; the caller's identity is put back afterwards.
const doorCode = async (o) => { const me = (await db.query(`select current_setting('request.jwt.claim.sub', true) s`)).rows[0].s; await db.query(`select set_config('request.jwt.claim.sub', (select user_id::text from orders where id = $1), false)`, [o]); try { return (await db.query(`select public.customer_delivery_code($1::uuid, true) ->> 'code' as c`, [o])).rows[0].c; } finally { await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [me ?? ""]); } };
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
const fnv = async (sql, params) => (await one(`select ${sql} as r`, params)).r;
const near = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) <= eps;
const ADMIN = "10000000-0000-4000-8000-000000000001", OPS = "10000000-0000-4000-8000-000000000002", CUST = "30000000-0000-4000-8000-000000000002";
const RIDER1 = "40000000-0000-4000-8000-000000000001", RIDER2 = "40000000-0000-4000-8000-000000000002";

await q(`update settings set value = '{"open":"00:00","close":"23:59"}'::jsonb where key = 'business_hours'`);
await q(`update settings set value = 'true'::jsonb where key = 'business_open'`);
await q(`update delivery_partners set is_online = false, current_lat = null, current_lng = null`);
await q(`update delivery_assignments set status = 'cancelled' where status in ('offered','accepted','picked_up')`);
await q(`update orders set status = 'cancelled' where status not in ('delivered','completed','cancelled','rejected')`);
await q(`update orders set accepted_at = now() where accepted_at is null`);
await q(`delete from notifications`);
// Seeded earnings are settled and the seeded cash position is the baseline, so only this run's deliveries count.
await q(`update rider_earnings set status = 'paid'`);
const r1 = (await one(`select id from delivery_partners where user_id = $1`, [RIDER1])).id;
const cashBase = Number((await fnv(`public._rider_cash($1::uuid)`, [r1])).due);
const addr = (await one(`select id from addresses where user_id = $1 order by is_default desc limit 1`, [CUST])).id;
const vegCat = (await one(`select id from categories where slug = 'vegetables'`)).id;
await as(ADMIN);
async function product(name, value, unit, label, price, stock, slug) {
  const p = await one(`insert into products (name, slug, category_id, weight_value, weight_unit, pack_label, mrp) values ($1, $2, $3, $4, $5, $6, $7) returning id`, [name, slug, vegCat, value, unit, label, price]);
  const i = await one(`insert into inventory (product_id, selling_price, mrp, stock_qty, max_order_qty) values ($1, $2, $2, $3, 50) returning id`, [p.id, price, stock]);
  return { id: p.id, inv: i.id };
}
const oil = await product("Fin Oil", 1, "l", "1 L", 180, 0, "fin-oil-1-l");

const placeCod = async (inv, n = 2) => { await as(CUST); await q(`select public.clear_cart()`); await q(`select public.add_to_cart($1::uuid, $2)`, [inv, n]); return (await fnv(`public.place_order($1::uuid, 'cod'::public.payment_method, 'standard', null)`, [addr])).order_id; };
async function toDoor(o) {
  await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o]);
  await as(RIDER1); await q(`select public.rider_set_online(true, 26.6480, 74.0325)`);
  const off = (await fnv(`public.rider_assignments(array['offered'])`))[0];
  await q(`select public.rider_respond_assignment($1::uuid, true)`, [off.id]); await q(`select public.rider_pickup($1::uuid)`, [off.id]);
  return { id: off.id, otp: await doorCode(o) };
}
const due = async () => Number((await one(`select (public._rider_cash($1::uuid) ->> 'due') d`, [r1])).d);
const stock2 = await one(`select id, selling_price from inventory where stock_qty > 20 and selling_price between 100 and 400 order by selling_price desc, id limit 1`);
const pub = await fnv(`public.public_settings()`);
ok("UPI details are public and switched on", pub.upi_on_delivery_enabled === true && pub.upi_id === "8875020202@hdfc" && pub.upi_payee_name === "DESHWALI MINERALS", JSON.stringify(pub.upi_id));


const placeUpi = async (inv, n = 4) => { await as(CUST); await q(`select public.clear_cart()`); await q(`select public.add_to_cart($1::uuid, $2)`, [inv, n]); return await fnv(`public.place_order($1::uuid, 'upi'::public.payment_method, 'standard', null)`, [addr]); };
const order = async (id) => await one(`select status, payment_method, payment_status, accepted_at, accepted_by_name from orders where id = $1`, [id]);
const pay = async (id) => await one(`select provider::text as provider, status, provider_payment_id, raw_response from payments where order_id = $1 order by created_at desc limit 1`, [id]);
await q(`update settings set value = 'true'::jsonb where key in ('auto_accept_orders', 'cod_enabled')`);

console.log("Placing a UPI order");
ok("the setting is public and on", pub.upi_pay_now_enabled === true);
const p1 = await placeUpi(stock2.id);
ok("no gateway step is needed", p1.payment_required === false && p1.upi_pending === true && p1.payment_provider === "upi", JSON.stringify(p1));
const o1 = p1.order_id;
let s1 = await order(o1);
ok("the order waits as placed / payment pending", s1.status === "placed" && s1.payment_status === "pending", JSON.stringify(s1));
ok("the payment row is a direct UPI payment", (await pay(o1)).provider === "upi" && (await pay(o1)).status === "pending");
ok("admins are told it is waiting for UPI", (await one(`select count(*)::int c from notifications where type = 'new_order' and body like '%UPI%' and data ->> 'order_id' = $1`, [o1])).c > 0);
await as(ADMIN);
const feed1 = await fnv(`public.admin_order_alerts()`);
const a1 = feed1.orders.find((x) => x.id === o1);
ok("it rings for admins, flagged as UPI pending", a1 && a1.upi_pending === true && a1.upi_reference === null, JSON.stringify(a1));
ok("plain accept is refused until the money is confirmed", /PAYMENT_PENDING/.test((await err(`select public.admin_accept_order($1::uuid)`, [o1])) ?? ""));
ok("nothing to confirm shows an empty rider list", !(await fnv(`public.admin_pending_upi()`)).some((p) => p.order_id === o1));
ok("it is listed under UPI orders to confirm", (await fnv(`public.admin_pending_upi_orders()`)).some((p) => p.order_id === o1 && Number(p.amount) > 0));

console.log("Customer says paid");
await as(OPS);
ok("someone else cannot claim it", /ORDER_NOT_FOUND|FORBIDDEN/.test((await err(`select public.customer_upi_claim($1::uuid, 'UTR0001')`, [o1])) ?? ""));
await as(CUST);
ok("a too-long reference is refused", /too long/.test((await err(`select public.customer_upi_claim($1::uuid, $2)`, [o1, "X".repeat(41)])) ?? ""));
const c1 = await fnv(`public.customer_upi_claim($1::uuid, ' UTR0001 ')`, [o1]);
ok("the claim is recorded with a trimmed reference", c1.ok === true && c1.reference === "UTR0001" && (await pay(o1)).provider_payment_id === "UTR0001");
ok("admins get a confirm request", (await one(`select count(*)::int c from notifications where type = 'upi_to_confirm' and data ->> 'order_id' = $1`, [o1])).c > 0);
await as(ADMIN);
const a2 = (await fnv(`public.admin_order_alerts()`)).orders.find((x) => x.id === o1);
ok("the alert carries the customer's reference", a2 && a2.upi_reference === "UTR0001" && a2.upi_claimed_at, JSON.stringify(a2));

console.log("Admin confirms");
await as(CUST);
ok("a customer cannot confirm a payment", /FORBIDDEN/.test((await err(`select public.admin_confirm_upi_payment($1::uuid, true, 'UTR0001')`, [o1])) ?? ""));
await as(ADMIN);
const n0 = (await one(`select count(*)::int c from notifications where user_id = $1 and type = 'payment'`, [CUST])).c;
await q(`select public.admin_confirm_upi_payment($1::uuid, false, null)`, [o1]);
s1 = await order(o1);
ok("not received keeps the order waiting", s1.status === "placed" && s1.payment_status === "pending" && (await pay(o1)).raw_response.checked_at, JSON.stringify(s1));
ok("the customer is told to pay or switch to cash", (await one(`select count(*)::int c from notifications where user_id = $1 and type = 'payment'`, [CUST])).c === n0 + 1);
ok("received needs the bank reference", /reference/.test((await err(`select public.admin_confirm_upi_payment($1::uuid, true, 'ab')`, [o1])) ?? ""));
const d1 = await fnv(`public.admin_confirm_upi_payment($1::uuid, true, 'UTR0001')`, [o1]);
s1 = await order(o1);
ok("received confirms and accepts the order in one step", d1.status === "confirmed" && s1.status === "confirmed" && s1.payment_status === "paid" && s1.accepted_at, JSON.stringify(s1));
ok("the payment is paid with the reference", (await pay(o1)).status === "paid" && (await pay(o1)).provider_payment_id === "UTR0001");
ok("the order leaves the alerts and the list", !(await fnv(`public.admin_order_alerts()`)).orders.some((x) => x.id === o1) && !(await fnv(`public.admin_pending_upi_orders()`)).some((p) => p.order_id === o1));
ok("a repeat confirm is refused", /UPI/.test((await err(`select public.admin_confirm_upi_payment($1::uuid, true, 'UTR0001')`, [o1])) ?? ""));
ok("the status history says why", (await one(`select count(*)::int c from order_status_history where order_id = $1 and status = 'confirmed' and note = 'UPI payment received'`, [o1])).c === 1);

console.log("Same reference twice");
const r2 = await placeUpi(stock2.id); const o2 = r2.order_id;
await as(ADMIN);
ok("a used reference is refused on another order", /already used/.test((await err(`select public.admin_confirm_upi_payment($1::uuid, true, 'UTR0001')`, [o2])) ?? ""));

console.log("Switching to cash");
await as(OPS);
ok("someone else cannot switch it", /ORDER_NOT_FOUND/.test((await err(`select public.customer_upi_to_cash($1::uuid)`, [o2])) ?? ""));
await as(CUST);
const t2 = await fnv(`public.customer_upi_to_cash($1::uuid)`, [o2]);
const s2 = await order(o2);
ok("the order becomes cash on delivery and is confirmed automatically", t2.payment_method === "cod" && s2.payment_method === "cod" && s2.payment_status === "cod_pending" && s2.status === "confirmed", JSON.stringify(s2));
ok("the payment row follows", (await pay(o2)).provider === "cod" && (await pay(o2)).status === "cod_pending");
ok("it can no longer be claimed as UPI", /UPI/.test((await err(`select public.customer_upi_claim($1::uuid, 'UTR0002')`, [o2])) ?? ""));
await as(ADMIN);
ok("a cash order rings as usual", (await fnv(`public.admin_order_alerts()`)).orders.some((x) => x.id === o2 && x.upi_pending === false));

console.log("Switched off");
await q(`update settings set value = 'false'::jsonb where key = 'upi_pay_now_enabled'`);
const r3 = await placeUpi(stock2.id);
ok("with the setting off, UPI goes to the gateway as before", r3.payment_required === true && r3.payment_provider === "razorpay" && r3.upi_pending === false, JSON.stringify(r3));
ok("public settings reflect it", (await fnv(`public.public_settings()`)).upi_pay_now_enabled === false);

console.log("Expiry");
await q(`update settings set value = 'true'::jsonb where key = 'upi_pay_now_enabled'`);
const r4 = await placeUpi(stock2.id); await q(`select public.customer_upi_claim($1::uuid, 'UTR0004')`, [r4.order_id]);
const r5 = await placeUpi(stock2.id);
await as(ADMIN);
const expired = await fnv(`public.expire_unpaid_orders(0)`);
ok("an unclaimed UPI order and a gateway order expire", expired >= 2 && (await order(r5.order_id)).status === "cancelled" && (await order(r3.order_id)).status === "cancelled", String(expired));
ok("a UPI order the customer says they paid is kept for the admin", (await order(r4.order_id)).status === "placed");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
