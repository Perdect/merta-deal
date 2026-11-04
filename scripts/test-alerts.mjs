// Ringing order alerts (0035): the admin alert feed, acceptance (once, by one admin, visible to all),
// payment rules for prepaid orders, cancellation, unattended escalation, no-rider alerts, rider offers
// (only the offered rider, atomic accept, withdrawn by admin assignment, expiry and re-offer) and who
// receives which notification. Loads every migration + seed into PGlite. Run from the project folder:
//   node scripts/test-alerts.mjs "$PWD"
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
const ADMIN = "10000000-0000-4000-8000-000000000001", OPS = "10000000-0000-4000-8000-000000000002";
const CUST = "30000000-0000-4000-8000-000000000002", RIDER1 = "40000000-0000-4000-8000-000000000001", RIDER2 = "40000000-0000-4000-8000-000000000002";

await q(`update settings set value = '{"open":"00:00","close":"23:59"}'::jsonb where key = 'business_hours'`);
await q(`update settings set value = 'true'::jsonb where key = 'business_open'`);
// Deterministic riders: everyone offline and unplaced until a test puts them somewhere.
await q(`update delivery_partners set is_online = false, current_lat = null, current_lng = null`);
await q(`update delivery_assignments set status = 'cancelled' where status in ('offered','accepted','picked_up')`);
await q(`delete from notifications`);
// Seeded demo orders are closed so only orders placed by this harness ring or get offered.
await q(`update orders set status = 'cancelled' where status not in ('delivered','completed','cancelled','rejected')`);
await q(`update orders set accepted_at = now() where accepted_at is null`);
const addr = (await one(`select id from addresses where user_id = $1 order by is_default desc limit 1`, [CUST])).id;
const inv = (await one(`select id from inventory where stock_qty > 60 and selling_price between 100 and 400 order by selling_price limit 1`)).id;
async function placeOrder(pay = "cod", n = 2) {
  await as(CUST); await q(`select public.clear_cart()`);
  await q(`select public.add_to_cart($1::uuid, $2)`, [inv, n]);
  const r = await fnv(`public.place_order($1::uuid, $2::public.payment_method, 'standard', null)`, [addr, pay]);
  return r.order_id;
}
const alerts = async (uid = ADMIN) => { await as(uid); return await fnv(`public.admin_order_alerts()`); };
const orderOf = async (id) => one(`select status, payment_status, accepted_at, accepted_by, accepted_by_name from orders where id = $1`, [id]);
const notifs = async (type, orderId) => q(`select n.user_id, p.role from notifications n join profiles p on p.id = n.user_id where n.type = $1 and n.data ->> 'order_id' = $2`, [type, orderId]);
const adminCount = (await one(`select count(*)::int n from profiles where role in ('admin','super_admin') and is_active`)).n;

console.log("Alert feed");
const o1 = await placeOrder("cod");
let feed = await alerts();
ok("feed carries the ring policy and the server clock", typeof feed.ring_seconds === "number" && typeof feed.reminder_seconds === "number" && Boolean(feed.now));
ok("a new cash order is in the feed at once", feed.orders.some((o) => o.id === o1));
const row = feed.orders.find((o) => o.id === o1);
ok("the feed shows number, items, total, payment and area", row && row.order_number && row.item_count === 2 && Number(row.total) > 0 && row.payment_method === "cod" && typeof row.area === "string");
ok("auto-confirm already ran but the order is still unaccepted", (await orderOf(o1)).status === "confirmed" && (await orderOf(o1)).accepted_at === null);
ok("new-order notifications go only to admins", (await notifs("new_order", o1)).every((n) => ["admin", "super_admin"].includes(n.role)) && (await notifs("new_order", o1)).length === adminCount);
await as(CUST);
ok("a customer cannot read the feed", /FORBIDDEN/.test((await err(`select public.admin_order_alerts()`)) ?? ""));
ok("a customer cannot accept", /FORBIDDEN/.test((await err(`select public.admin_accept_order($1::uuid)`, [o1])) ?? ""));
await as(RIDER1);
ok("a rider cannot accept", /FORBIDDEN/.test((await err(`select public.admin_accept_order($1::uuid)`, [o1])) ?? ""));

console.log("Acceptance");
await as(ADMIN);
let a = await fnv(`public.admin_accept_order($1::uuid)`, [o1]);
ok("first accept records the admin", a.already === false && a.accepted_by === ADMIN && a.accepted_by_name === "Sameer Khan");
await as(OPS);
a = await fnv(`public.admin_accept_order($1::uuid)`, [o1]);
ok("a second admin's accept is a no-op that reports who already accepted", a.already === true && a.accepted_by === ADMIN && a.accepted_by_name === "Sameer Khan");
await as(ADMIN);
a = await fnv(`public.admin_accept_order($1::uuid)`, [o1]);
ok("a retry by the same admin is idempotent", a.already === true);
feed = await alerts(OPS);
ok("an accepted order leaves every admin's feed", !feed.orders.some((o) => o.id === o1));
ok("accepting never changes delivery state", (await orderOf(o1)).status === "confirmed");
ok("acceptance is audited once", (await one(`select count(*)::int n from audit_logs where action = 'order.accept' and entity_id = $1`, [o1])).n === 1);

console.log("Prepaid orders follow the payment rules");
const o2 = await placeOrder("razorpay");
ok("an unpaid online order is placed, not confirmed", (await orderOf(o2)).status === "placed" && (await orderOf(o2)).payment_status === "pending");
ok("it does not ring until the payment is verified", !(await alerts()).orders.some((o) => o.id === o2));
await as(ADMIN);
ok("accepting it is refused while unpaid", /PAYMENT_PENDING/.test((await err(`select public.admin_accept_order($1::uuid)`, [o2])) ?? ""));
await q(`update orders set payment_status = 'paid' where id = $1`, [o2]);
ok("once paid it is in the feed", (await alerts()).orders.some((o) => o.id === o2));
a = await fnv(`public.admin_accept_order($1::uuid)`, [o2]);
ok("accepting a paid 'placed' order confirms it and marks it accepted", a.status === "confirmed" && a.already === false);
ok("the customer is told it is confirmed", (await one(`select count(*)::int n from notifications where user_id = $1 and type = 'order_status' and data ->> 'order_id' = $2 and data ->> 'status' = 'confirmed'`, [CUST, o2])).n === 1);

console.log("Cancellation");
const o3 = await placeOrder("cod");
ok("the new order rings", (await alerts()).orders.some((o) => o.id === o3));
await as(CUST); await q(`select public.cancel_order($1::uuid, 'Changed my mind')`, [o3]);
ok("a cancelled order leaves the feed", !(await alerts()).orders.some((o) => o.id === o3));
await as(ADMIN);
ok("a cancelled order cannot be accepted", /ORDER_CLOSED/.test((await err(`select public.admin_accept_order($1::uuid)`, [o3])) ?? ""));

console.log("Unattended escalation");
const o4 = await placeOrder("cod");
await as(null);
ok("a fresh order is not escalated", (await fnv(`public.escalate_unattended_orders()`)) === 0);
await q(`update orders set created_at = now() - interval '15 minutes' where id = $1`, [o4]);
ok("an order unaccepted past the limit escalates once", (await fnv(`public.escalate_unattended_orders()`)) === 1);
ok("every admin, and only admins, get the escalation", (await notifs("order_unattended", o4)).length === adminCount && (await notifs("order_unattended", o4)).every((n) => ["admin", "super_admin"].includes(n.role)));
ok("a second run inside the window sends nothing", (await fnv(`public.escalate_unattended_orders()`)) === 0);
await q(`update notifications set created_at = created_at - interval '11 minutes' where type = 'order_unattended'`);
ok("after the interval it reminds again", (await fnv(`public.escalate_unattended_orders()`)) === 1);
await as(ADMIN); await q(`select public.admin_accept_order($1::uuid)`, [o4]); await as(null);
await q(`update notifications set created_at = created_at - interval '11 minutes' where type = 'order_unattended'`);
ok("an accepted order is never escalated", (await fnv(`public.escalate_unattended_orders()`)) === 0);
await q(`update settings set value = '0'::jsonb where key = 'order_alert_escalate_minutes'`);
const o4b = await placeOrder("cod"); await q(`update orders set created_at = now() - interval '4 hours' where id = $1`, [o4b]); await as(null);
ok("escalation can be switched off", (await fnv(`public.escalate_unattended_orders()`)) === 0);
await q(`update settings set value = '10'::jsonb where key = 'order_alert_escalate_minutes'`);
await as(CUST);
ok("a customer cannot run the escalation", /FORBIDDEN/.test((await err(`select public.escalate_unattended_orders()`)) ?? ""));
ok("old orders drop out of the feed after the recovery window", !(await alerts()).orders.some((o) => o.id === o4b));

console.log("No rider available");
const o5 = await placeOrder("cod");
await as(ADMIN);
const packed = await fnv(`public.fulfil_order($1::uuid, 'ready')`, [o5]);
ok("packing with nobody online returns no assignment", packed.assignment_id === null && packed.status === "ready_for_pickup");
ok("admins are alerted that no rider is available", (await notifs("dispatch_no_rider", o5)).length === adminCount);
await alerts(); await alerts();
ok("repeated sweeps do not repeat the alert inside the window", (await notifs("dispatch_no_rider", o5)).length === adminCount);
ok("the audit row is written once, not per sweep", (await one(`select count(*)::int n from audit_logs where action = 'dispatch.no_rider' and entity_id = $1`, [o5])).n === 1);
await q(`update notifications set created_at = created_at - interval '6 minutes' where type = 'dispatch_no_rider'`);
await alerts();
ok("after the window the alert repeats", (await notifs("dispatch_no_rider", o5)).length === adminCount * 2);

console.log("Rider offers");
await as(RIDER1);
await q(`select public.rider_set_online(true, 26.6480, 74.0325)`);
const mine = await fnv(`public.rider_assignments(array['offered'])`);
ok("coming online near the pickup gets the packed order offered", mine.length === 1 && mine[0].order.id === o5 && mine[0].status === "offered");
const offer = mine[0];
ok("the offer carries pickup, area, distance and earning, not the full address", offer.pickup.name && offer.order.address.area && offer.distance_km != null && offer.earning != null && !offer.order.address.house);
const noPin = await placeOrder("cod"); await q(`update orders set delivery_lat = null, delivery_lng = null where id = $1`, [noPin]);
await as(ADMIN); await q(`update delivery_assignments set status = 'delivered' where order_id = $1`, [o5]); await q(`select public.fulfil_order($1::uuid, 'ready')`, [noPin]);
const noPinOffer = await one(`select distance_km, drop_lat from delivery_assignments where order_id = $1`, [noPin]);
ok("an order without a map pin is offered with an unknown distance, not 0 km", noPinOffer && noPinOffer.distance_km === null && noPinOffer.drop_lat === null);
await q(`update delivery_assignments set status = 'cancelled' where order_id = $1`, [noPin]); await q(`update orders set status = 'cancelled' where id = $1`, [noPin]);
await q(`update delivery_assignments set status = 'offered' where order_id = $1`, [o5]);
ok("the offer notification went only to that rider", (await notifs("delivery_offer", o5)).length === 1 && (await notifs("delivery_offer", o5))[0].user_id === RIDER1);
await as(RIDER2);
ok("another rider does not see it", (await fnv(`public.rider_assignments(array['offered'])`)).length === 0);
ok("another rider cannot accept it", /FORBIDDEN/.test((await err(`select public.rider_respond_assignment($1::uuid, true)`, [offer.id])) ?? ""));
await as(RIDER1);
const acc = await fnv(`public.rider_respond_assignment($1::uuid, true)`, [offer.id]);
ok("the offered rider accepts atomically", acc.status === "accepted" && (await orderOf(o5)).status === "rider_assigned");
ok("a repeated accept (retry, double tap) is refused, not double-assigned", /INVALID_STATE/.test((await err(`select public.rider_respond_assignment($1::uuid, true)`, [offer.id])) ?? ""));
ok("the admin is told a rider is assigned", (await notifs("rider_assigned", o5)).length === adminCount);
ok("the order is not delivered by any of this", (await orderOf(o5)).status === "rider_assigned");

console.log("Withdrawn and expired offers");
const o6 = await placeOrder("cod");
await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o6]);
await as(RIDER2); await q(`select public.rider_set_online(true, 26.6482, 74.0320)`);
let r2 = await fnv(`public.rider_assignments(array['offered'])`);
ok("the free online rider gets the next packed order", r2.length === 1 && r2[0].order.id === o6);
const offer6 = r2[0];
await as(ADMIN);
const rider1Id = (await one(`select id from delivery_partners where user_id = $1`, [RIDER1])).id;
await q(`update delivery_assignments set status = 'delivered' where order_id = $1`, [o5]);
await q(`select public.admin_assign_rider($1::uuid, $2::uuid)`, [o6, rider1Id]);
ok("an admin assignment withdraws the open offer", (await one(`select status from delivery_assignments where id = $1`, [offer6.id])).status === "cancelled");
await as(RIDER2);
ok("the withdrawn offer is gone from the rider's list", (await fnv(`public.rider_assignments(array['offered'])`)).length === 0);
ok("accepting a withdrawn offer is refused", /INVALID_STATE/.test((await err(`select public.rider_respond_assignment($1::uuid, true)`, [offer6.id])) ?? ""));
await as(RIDER1);
const r1 = await fnv(`public.rider_assignments(array['offered'])`);
ok("the assigned rider sees the admin's offer", r1.length === 1 && r1[0].order.id === o6);
await q(`update delivery_assignments set expires_at = now() - interval '1 second' where id = $1`, [r1[0].id]);
const exp = await fnv(`public.rider_respond_assignment($1::uuid, true)`, [r1[0].id]);
ok("an expired offer cannot be accepted", exp.ok === false && exp.error === "OFFER_EXPIRED");
ok("it is marked expired", (await one(`select status from delivery_assignments where id = $1`, [r1[0].id])).status === "expired");
const again = await fnv(`public.rider_assignments(array['offered'])`);
ok("the next sweep offers the order again with a fresh request", again.length === 1 && again[0].order.id === o6 && again[0].id !== r1[0].id);
const dec = await fnv(`public.rider_respond_assignment($1::uuid, false)`, [again[0].id]);
ok("declining hands it to another eligible rider at once", dec.status === "rejected" && dec.reassigned_to !== null);
await as(RIDER2);
ok("that rider now holds the offer", (await fnv(`public.rider_assignments(array['offered'])`)).some((x) => x.order.id === o6));

console.log("Inbox recipients");
ok("customers never receive admin or rider alert types", (await one(`select count(*)::int n from notifications n join profiles p on p.id = n.user_id where p.role = 'customer' and n.type in ('new_order','order_unattended','dispatch_no_rider','delivery_offer','rider_assigned')`)).n === 0);
ok("riders only receive their own offers", (await one(`select count(*)::int n from notifications n join profiles p on p.id = n.user_id where p.role = 'rider' and n.type <> 'delivery_offer'`)).n === 0);
ok("every alert type requests push as well as in-app", (await one(`select count(*)::int n from notifications where type in ('new_order','order_unattended','dispatch_no_rider','delivery_offer') and not ('push' = any(channels))`)).n === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
