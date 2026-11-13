// New-order alert delivery (0052): one new_order row per admin per order even when notified twice, delivery
// outcomes recorded once per channel and never downgraded after a send, retries counted, the admin status
// reads, and who may call what. Loads every migration + seed into PGlite. Run from the project folder:
//   node scripts/test-notify.mjs "$PWD"
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
const as = async (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
const fnv = async (sql, params) => (await one(`select ${sql} as r`, params)).r;
const ADMIN = "10000000-0000-4000-8000-000000000001";
const CUST = "30000000-0000-4000-8000-000000000002";

await q(`update settings set value = '{"open":"00:00","close":"23:59"}'::jsonb where key = 'business_hours'`);
await q(`update settings set value = 'true'::jsonb where key = 'business_open'`);
await q(`delete from notifications`);
const addr = (await one(`select id from addresses where user_id = $1 order by is_default desc limit 1`, [CUST])).id;
const inv = (await one(`select id from inventory where stock_qty > 60 and selling_price between 100 and 400 order by selling_price limit 1`)).id;
const admins = (await one(`select count(*)::int n from profiles where role in ('admin','super_admin') and is_active`)).n;

console.log("A placed order alerts every active admin exactly once");
await as(CUST); await q(`select public.clear_cart()`); await q(`select public.add_to_cart($1::uuid, 2)`, [inv]);
const placed = await fnv(`public.place_order($1::uuid, 'cod'::public.payment_method, 'standard', null)`, [addr]);
const rows = await q(`select id, user_id, title, body, channels, sent_push from notifications where type = 'new_order' and data ->> 'order_id' = $1`, [placed.order_id]);
ok("one new_order notification per active admin", rows.length === admins && admins >= 1, `${rows.length}/${admins}`);
ok("the row is created with the order (same transaction) and still waits for push", rows.every((r) => r.sent_push === false && r.channels.includes("push")));
ok("the alert never carries the customer's address or phone", rows.every((r) => !/\d{10}/.test(r.body) && !/house|street|pincode/i.test(r.body)));
await as(null);
await q(`select public.notify_admins('new_order', 'New order ' || $2, 'duplicate event', jsonb_build_object('order_id', $1::uuid, 'order_number', $2))`, [placed.order_id, placed.order_number]);
const again = await q(`select id from notifications where type = 'new_order' and data ->> 'order_id' = $1`, [placed.order_id]);
ok("a repeated new_order event for the same order adds no second row", again.length === rows.length);
await q(`select public.notify_admins('order_cancelled', 'Cancelled', 'x', jsonb_build_object('order_id', $1::uuid))`, [placed.order_id]);
ok("other types are not de-duplicated by order", (await one(`select count(*)::int n from notifications where type = 'order_cancelled' and data ->> 'order_id' = $1`, [placed.order_id])).n === admins);

console.log("Delivery outcomes: once per channel, sent is final, attempts counted");
const nid = rows[0].id;
const r1 = await fnv(`public.record_notification_delivery($1::uuid, 'push', 'failed', null, 'push service 500')`, [nid]);
ok("a failed attempt is recorded with attempts = 1", r1.ok === true && r1.status === "failed" && r1.attempts === 1 && r1.already === false);
const r2 = await fnv(`public.record_notification_delivery($1::uuid, 'push', 'sent', 'msg-1', null)`, [nid]);
ok("a later success replaces it and clears the error", r2.status === "sent" && r2.attempts === 2 && (await one(`select error, provider_id from notification_deliveries where id = $1`, [r2.id])).error === null);
const r3 = await fnv(`public.record_notification_delivery($1::uuid, 'push', 'failed', null, 'retry after lost response')`, [nid]);
ok("a sent channel is never marked failed again (retry-safe)", r3.already === true && r3.status === "sent" && r3.attempts === 2);
const r4 = await fnv(`public.record_notification_delivery($1::uuid, 'push', 'delivered', null, null)`, [nid]);
ok("the provider's delivery confirmation can still upgrade a sent channel", r4.status === "delivered");
ok("one row per notification and channel", (await one(`select count(*)::int n from notification_deliveries where notification_id = $1 and channel = 'push'`, [nid])).n === 1);
await fnv(`public.record_notification_delivery($1::uuid, 'whatsapp', 'unavailable', null, 'WhatsApp Cloud API credentials missing.')`, [nid]);
ok("an unconfigured channel is recorded as unavailable without counting an attempt", (await one(`select status, attempts from notification_deliveries where notification_id = $1 and channel = 'whatsapp'`, [nid])).attempts === 0);
await fnv(`public.record_notification_delivery($1::uuid, 'email', 'no_recipient', null, 'no email on the profile')`, [nid]);
ok("an invalid status is refused", /INVALID_STATUS/.test((await err(`select public.record_notification_delivery($1::uuid, 'email', 'maybe', null, null)`, [nid])) ?? ""));
await as(CUST);
ok("a customer cannot record deliveries", /FORBIDDEN/.test((await err(`select public.record_notification_delivery($1::uuid, 'push', 'sent', null, null)`, [nid])) ?? ""));
// PGlite runs as superuser (RLS is not enforced), so the policy itself is checked: admins only, nothing for anyone else.
ok("the delivery table is readable by admins only (RLS policy)", (await one(`select count(*)::int n from pg_policies where tablename = 'notification_deliveries' and cmd = 'SELECT' and qual like '%is_admin()%'`)).n === 1
  && (await one(`select count(*)::int n from pg_policies where tablename = 'notification_deliveries' and cmd <> 'SELECT'`)).n === 0
  && (await one(`select relrowsecurity from pg_class where relname = 'notification_deliveries'`)).relrowsecurity === true);
ok("a customer cannot read the channel summary", /FORBIDDEN/.test((await err(`select public.admin_alert_channel_summary()`)) ?? ""));

console.log("Admin status reads");
await as(ADMIN);
const summary = await fnv(`public.admin_alert_channel_summary()`);
ok("the summary shows push delivered with one send in the last day", summary.push?.last_status === "delivered" && Number(summary.push?.sent_24h) === 1 && Number(summary.push?.failed_24h) === 0);
ok("the summary shows WhatsApp unavailable with its reason", summary.whatsapp?.last_status === "unavailable" && /credentials/.test(summary.whatsapp?.last_error ?? ""));
const recent = await fnv(`public.admin_recent_order_alerts(5)`);
ok("recent order alerts list the order once with every admin counted", recent.length >= 1 && recent[0].order_id === placed.order_id && Number(recent[0].admins) === admins);
ok("and carry the per-channel outcomes", recent[0].deliveries.some((d) => d.channel === "push" && d.status === "delivered") && recent[0].deliveries.some((d) => d.channel === "email" && d.status === "no_recipient"));
ok("an admin can read the delivery rows directly", (await q(`select id from notification_deliveries where notification_id = $1`, [nid])).length === 3);
ok("the admin can call the cron hook, which does nothing until the URL and secret are set", (await fnv(`public.run_notification_cron()`)) === false);
await as(CUST);
ok("a customer cannot call the cron hook", /FORBIDDEN/.test((await err(`select public.run_notification_cron()`)) ?? ""));
await as(null);
ok("the scheduler (no user) may call the cron hook", (await err(`select public.run_notification_cron()`)) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
