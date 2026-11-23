// Referral program (0043): a new customer who opens an invite link gets free standard delivery on the first
// order; the inviter earns a free delivery only once that order is delivered. Self-referral, a second link,
// customers who already ordered, cancelled orders and expired credits never pay out.
// Loads every migration + seed into PGlite. Run from the project folder:
//   node scripts/test-referrals.mjs "$PWD"
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
const as = async (uid, role) => { await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]); await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [role ?? (uid ? "authenticated" : "anon")]); };
// 0059: no delivery code is stored in plain text. The customer opens one on their own order screen, as the app does; the caller's identity is put back afterwards.
const doorCode = async (o) => { const me = (await db.query(`select current_setting('request.jwt.claim.sub', true) s`)).rows[0].s; await db.query(`select set_config('request.jwt.claim.sub', (select user_id::text from orders where id = $1), false)`, [o]); try { return (await db.query(`select public.customer_delivery_code($1::uuid, true) ->> 'code' as c`, [o])).rows[0].c; } finally { await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [me ?? ""]); } };
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
const fnv = async (sql, params) => (await one(`select ${sql} as r`, params)).r;
const ADMIN = "10000000-0000-4000-8000-000000000001", CUST = "30000000-0000-4000-8000-000000000002";
const RIDER1 = "40000000-0000-4000-8000-000000000001";

await q(`update settings set value = '{"open":"00:00","close":"23:59"}'::jsonb where key = 'business_hours'`);
await q(`update settings set value = 'true'::jsonb where key in ('business_open', 'auto_accept_orders', 'cod_enabled')`);
await q(`update settings set value = '0'::jsonb where key = 'free_delivery_threshold'`); // never free by threshold: the test must see the referral credit
await q(`update settings set value = '100000'::jsonb where key = 'free_delivery_threshold'`);
await q(`update delivery_zones set free_delivery_threshold = 100000`);
await q(`update delivery_partners set is_online = false, current_lat = null, current_lng = null`);
await q(`update delivery_assignments set status = 'cancelled' where status in ('offered','accepted','picked_up')`);
await q(`update orders set status = 'cancelled' where status not in ('delivered','completed','cancelled','rejected')`);
await q(`delete from notifications`);
const stock = await one(`select id, selling_price from inventory where stock_qty > 30 and selling_price between 100 and 400 order by selling_price desc, id limit 1`);

// Two brand-new customers (no orders yet), with a default address copied from the seeded customer.
const addrRow = await one(`select * from addresses where user_id = $1 order by is_default desc limit 1`, [CUST]);
async function newCustomer(id, name, phone) {
  await q(`insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values ($1, $2, '{}'::jsonb, now(), now()) on conflict (id) do nothing`, [id, `${name.toLowerCase()}@example.test`]);
  await q(`insert into profiles (id, role, full_name, phone, referral_code, is_active) values ($1::uuid, 'customer', $2, $3, upper(substr(md5($4), 1, 8)), true) on conflict (id) do nothing`, [id, name, phone, id]);
  await q(`insert into addresses (user_id, type, full_name, phone, house, street, area, city, state, pincode, lat, lng, is_default, zone_id)
           values ($1, 'home', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12)`,
    [id, name, phone, addrRow.house, addrRow.street, addrRow.area, addrRow.city, addrRow.state, addrRow.pincode, addrRow.lat, addrRow.lng, addrRow.zone_id]);
}
const INVITER = CUST;
const NEW1 = "30000000-0000-4000-8000-00000000a001", NEW2 = "30000000-0000-4000-8000-00000000a002", NEW3 = "30000000-0000-4000-8000-00000000a003";
await newCustomer(NEW1, "Aarav", "9876501001"); await newCustomer(NEW2, "Bhavna", "9876501002"); await newCustomer(NEW3, "Chetan", "9876501003");
const code = (await one(`select referral_code from profiles where id = $1`, [INVITER])).referral_code;
ok("every customer has a referral code", typeof code === "string" && code.length >= 6, code);

const placeCod = async (uid, n = 2, type = "standard") => { await as(uid); await q(`select public.clear_cart()`); await q(`select public.add_to_cart($1::uuid, $2)`, [stock.id, n]); return await fnv(`public.place_order((select id from addresses where user_id = $1 and is_default limit 1), 'cod'::public.payment_method, $2::public.delivery_type)`, [uid, type]); };
// Fill the cart first: an empty cart returns the short {empty:true} summary.
const summary = async (uid, type = "standard") => { await as(uid); await q(`select public.clear_cart()`); await q(`select public.add_to_cart($1::uuid, 2)`, [stock.id]); return await fnv(`public.cart_summary((select id from addresses where user_id = $1 and is_default limit 1), $2::public.delivery_type)`, [uid, type]); };
async function deliver(o) {
  await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o]);
  await as(RIDER1); await q(`select public.rider_set_online(true, 26.6480, 74.0325)`);
  const off = (await fnv(`public.rider_assignments(array['offered'])`))[0];
  await q(`select public.rider_respond_assignment($1::uuid, true)`, [off.id]); await q(`select public.rider_pickup($1::uuid)`, [off.id]);
  const otp = await doorCode(o);
  await q(`select public.verify_delivery_otp($1::uuid, $2, true, false)`, [off.id, otp]);
  return (await one(`select status from orders where id = $1`, [o])).status;
}
const credits = async (uid) => await q(`select credit_number, first_order_only, redeemed_order_id, expires_at from free_delivery_credits where user_id = $1 order by granted_at, credit_number`, [uid]);

console.log("Attribution rules");
await as(INVITER);
ok("you cannot use your own link", (await fnv(`public.track_referral($1)`, [code])).accepted === false);
ok("an existing customer with orders cannot be referred", (await fnv(`public.track_referral($1)`, [(await one(`select referral_code from profiles where id = $1`, [NEW3])).referral_code])).accepted === false);
await as(NEW1);
ok("an unknown code is refused", (await fnv(`public.track_referral('NOPE1234')`)).accepted === false);
const t1 = await fnv(`public.track_referral($1)`, [code.toLowerCase()]);
ok("a new customer is attributed (case-insensitive code)", t1.accepted === true && t1.status === "pending", JSON.stringify(t1));
ok("the invitee receives a first-order free delivery credit", (await credits(NEW1)).length === 1 && (await credits(NEW1))[0].first_order_only === true);
const otherCode = (await one(`select referral_code from profiles where id = $1`, [NEW3])).referral_code;
const t1b = await fnv(`public.track_referral($1)`, [otherCode]);
ok("a second link does not re-attribute the same customer", t1b.accepted === false && (await one(`select count(*)::int c from referral_attributions where referred_id = $1`, [NEW1])).c === 1, JSON.stringify(t1b));
ok("the same link twice is idempotent", (await fnv(`public.track_referral($1)`, [code])).accepted === true && (await credits(NEW1)).length === 1);
await as(ADMIN); await q(`update settings set value = 'false'::jsonb where key = 'referral_program_enabled'`);
await as(NEW2);
ok("a switched-off program accepts nothing", (await fnv(`public.track_referral($1)`, [code])).accepted === false);
await as(ADMIN); await q(`update settings set value = 'true'::jsonb where key = 'referral_program_enabled'`);

console.log("Invitee's first order");
const s1 = await summary(NEW1);
ok("the cart shows free delivery from the referral", s1.referral_delivery_credit === true && Number(s1.delivery_fee) === 0 && Number(s1.delivery_fee_waived) > 0, JSON.stringify({ fee: s1.delivery_fee, waived: s1.delivery_fee_waived, ref: s1.referral_delivery_credit }));
const sx = await summary(NEW1, "express");
ok("express delivery is not covered by the credit", sx.referral_delivery_credit !== true, JSON.stringify(sx.referral_delivery_credit));
const p1 = await placeCod(NEW1);
const o1 = p1.order_id;
ok("the order is placed with the delivery fee waived", Number((await one(`select delivery_fee from orders where id = $1`, [o1])).delivery_fee) === 0);
ok("the credit is marked redeemed by that order", (await credits(NEW1))[0].redeemed_order_id === o1);
ok("the inviter has nothing yet (order not delivered)", (await one(`select status from referral_attributions where referred_id = $1`, [NEW1])).status === "pending" && (await credits(INVITER)).length === 0);
await as(INVITER);
const st0 = await fnv(`public.my_referral_stats()`);
ok("the inviter sees one referral in progress", st0.pending === 1 && st0.rewarded === 0 && st0.credits_available === 0, JSON.stringify(st0));

console.log("Cancelled order never converts");
await as(NEW1);
await q(`select public.cancel_order($1::uuid, 'changed my mind')`, [o1]);
ok("the order is cancelled", (await one(`select status from orders where id = $1`, [o1])).status === "cancelled");
ok("the invitee's credit is handed back", (await credits(NEW1))[0].redeemed_order_id === null);
ok("the inviter still has no reward", (await one(`select status from referral_attributions where referred_id = $1`, [NEW1])).status === "pending" && (await credits(INVITER)).length === 0);

console.log("Delivered order converts");
const p2 = await placeCod(NEW1);
const o2 = p2.order_id;
ok("the credit is used again on the new order", (await credits(NEW1))[0].redeemed_order_id === o2);
const n0 = (await one(`select count(*)::int c from notifications where user_id = $1 and type = 'referral_reward'`, [INVITER])).c;
ok("delivered", (await deliver(o2)) === "delivered");
const att = await one(`select status, converted_order_id, rewarded_at from referral_attributions where referred_id = $1`, [NEW1]);
ok("the attribution records the qualifying order", att.status === "rewarded" && att.converted_order_id === o2 && att.rewarded_at, JSON.stringify(att));
ok("the inviter earns one free delivery credit", (await credits(INVITER)).length === 1 && (await credits(INVITER))[0].first_order_only === false);
ok("the inviter is notified", (await one(`select count(*)::int c from notifications where user_id = $1 and type = 'referral_reward'`, [INVITER])).c === n0 + 1);
await as(INVITER);
const st1 = await fnv(`public.my_referral_stats()`);
ok("the inviter's stats show the reward", st1.pending === 0 && st1.rewarded === 1 && st1.credits_available === 1, JSON.stringify(st1));
const sInv = await summary(INVITER);
ok("the inviter's next cart shows free delivery", sInv.referral_delivery_credit === true && Number(sInv.delivery_fee) === 0);
await as(NEW1);
const s3 = await summary(NEW1);
ok("the invitee's first-order credit is gone after it is used", s3.referral_delivery_credit !== true);

console.log("No repeat rewards");
const p3 = await placeCod(NEW1);
ok("a second order by the invitee is delivered", (await deliver(p3.order_id)) === "delivered");
ok("the inviter is not rewarded twice for the same friend", (await credits(INVITER)).length === 1);

console.log("Expiry");
await as(ADMIN); await q(`update settings set value = '30'::jsonb where key = 'referral_credit_expiry_days'`);
await as(NEW2);
await q(`select public.track_referral($1)`, [code]);
const c2 = await credits(NEW2);
ok("a credit granted now carries the configured expiry", c2.length === 1 && c2[0].expires_at && (new Date(c2[0].expires_at) - Date.now()) > 29 * 86400000);
await as(ADMIN); await q(`update free_delivery_credits set expires_at = now() - interval '1 day' where user_id = $1`, [NEW2]);
const s4 = await summary(NEW2);
ok("an expired credit does not waive delivery", s4.referral_delivery_credit !== true && Number(s4.delivery_fee) > 0);
await as(NEW2);
const st2 = await fnv(`public.my_referral_stats()`);
ok("the stats count it as expired", st2.credits_available === 0 && st2.credits_expired === 1, JSON.stringify(st2));
await as(ADMIN); await q(`update settings set value = '0'::jsonb where key = 'referral_credit_expiry_days'`);

console.log("Access");
// PGlite runs as the table owner, so RLS and grants are checked from the catalogue rather than by effect.
ok("attributions are protected by RLS (own rows or admin)", (await one(`select relrowsecurity rs from pg_class where relname = 'referral_attributions'`)).rs === true && (await one(`select count(*)::int c from pg_policies where tablename = 'referral_attributions'`)).c >= 1);
ok("credits are protected by RLS", (await one(`select relrowsecurity rs from pg_class where relname = 'free_delivery_credits'`)).rs === true);
ok("customers cannot call the award function", (await one(`select has_function_privilege('authenticated', 'public.award_referral_delivery(uuid)', 'execute') p`)).p === false);
ok("anonymous visitors cannot call track_referral", (await one(`select has_function_privilege('anon', 'public.track_referral(text)', 'execute') p`)).p === false);
await as(null);
ok("anonymous visitors cannot track a referral", /permission|denied|AUTH_REQUIRED/i.test((await err(`select public.track_referral($1)`, [code])) ?? ""));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
