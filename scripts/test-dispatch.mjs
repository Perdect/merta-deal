// Dispatch reliability (0050): two riders racing for one order, answers that are safe to retry, expired and
// withdrawn offers, a rider going offline or going quiet, admin assignment only for packed orders, unassigning
// a no-show, stale exception flags, and the housekeeping function a scheduler calls. Loads every migration +
// seed into PGlite. Run from the project folder:
//   node scripts/test-dispatch.mjs "$PWD"
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
const CUST = "30000000-0000-4000-8000-000000000002", RIDER1 = "40000000-0000-4000-8000-000000000001", RIDER2 = "40000000-0000-4000-8000-000000000002";

await q(`update settings set value = '{"open":"00:00","close":"23:59"}'::jsonb where key = 'business_hours'`);
await q(`update settings set value = 'true'::jsonb where key = 'business_open'`);
await q(`update settings set value = 'false'::jsonb where key = 'order_alert_require_accept'`);
await q(`update settings set value = 'true'::jsonb where key = 'dispatch_offer_all_riders'`);
await q(`update delivery_partners set is_online = false, current_lat = null, current_lng = null`);
await q(`update delivery_assignments set status = 'cancelled' where status in ('offered','accepted','picked_up')`);
await q(`delete from notifications`);
await q(`update orders set status = 'cancelled' where status not in ('delivered','completed','cancelled','rejected')`);
const addr = (await one(`select id from addresses where user_id = $1 order by is_default desc limit 1`, [CUST])).id;
const inv = (await one(`select id from inventory where stock_qty > 60 and selling_price between 100 and 400 order by selling_price limit 1`)).id;
const rider1Id = (await one(`select id from delivery_partners where user_id = $1`, [RIDER1])).id;
const rider2Id = (await one(`select id from delivery_partners where user_id = $1`, [RIDER2])).id;

async function placeOrder(n = 2) {
  await as(CUST); await q(`select public.clear_cart()`);
  await q(`select public.add_to_cart($1::uuid, $2)`, [inv, n]);
  return (await fnv(`public.place_order($1::uuid, 'cod'::public.payment_method, 'standard', null)`, [addr])).order_id;
}
async function packedOrder() { const id = await placeOrder(); await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [id]); return id; }
const online = async (uid, lat, lng) => { await as(uid); await q(`select public.rider_set_online(true, $1, $2)`, [lat, lng]); };
const offline = async (uid) => { await as(uid); await q(`select public.rider_set_online(false)`); };
const offersOf = async (uid, orderId) => { await as(uid); return (await fnv(`public.rider_assignments(array['offered'])`)).filter((a) => !orderId || a.order.id === orderId); };
const order = async (id) => one(`select status, exception, ready_at from orders where id = $1`, [id]);
const assignment = async (id) => one(`select status, note, expires_at, responded_at from delivery_assignments where id = $1`, [id]);
const notifs = async (uid, type) => q(`select title from notifications where user_id = $1 and type = $2`, [uid, type]);

console.log("Two riders race for one order");
await online(RIDER1, 26.648, 74.0325); await online(RIDER2, 26.6482, 74.032);
const o1 = await packedOrder();
const off1 = await offersOf(RIDER1, o1), off2 = await offersOf(RIDER2, o1);
ok("both free online riders are offered the packed order", off1.length === 1 && off2.length === 1);
await as(RIDER1);
const acc1 = await fnv(`public.rider_respond_assignment($1::uuid, true)`, [off1[0].id]);
ok("the first accept wins and reports the frozen earning", acc1.ok === true && acc1.status === "accepted" && Number(acc1.earning) > 0);
await as(RIDER2);
const acc2 = await fnv(`public.rider_respond_assignment($1::uuid, true)`, [off2[0].id]);
ok("the second rider's accept is refused as taken, not raised", acc2.ok === false && acc2.error === "OFFER_TAKEN");
ok("the losing offer is closed so it stops ringing", (await assignment(off2[0].id)).status === "expired");
ok("the order shows one rider assigned", (await order(o1)).status === "rider_assigned" && (await one(`select count(*)::int n from delivery_assignments where order_id = $1 and status = 'accepted'`, [o1])).n === 1);
await as(RIDER1);
const again = await fnv(`public.rider_respond_assignment($1::uuid, true)`, [off1[0].id]);
ok("repeating the accept after a lost response is a no-op that confirms the job", again.ok === true && again.already === true && again.status === "accepted");
ok("the winning rider's offer stays accepted", (await assignment(off1[0].id)).status === "accepted");

console.log("Unassigning a rider who never turned up");
await as(CUST);
ok("a customer cannot unassign", /FORBIDDEN/.test((await err(`select public.admin_unassign_rider($1::uuid, null)`, [o1])) ?? ""));
await as(ADMIN);
const un = await fnv(`public.admin_unassign_rider($1::uuid, 'Rider did not reach the shop')`, [o1]);
ok("unassign frees the order and offers it again", un.ok === true && un.unassigned === off1[0].id && un.reassigned_to !== null);
ok("the old assignment is cancelled with the note", (await assignment(off1[0].id)).status === "cancelled" && (await assignment(off1[0].id)).note === "Rider did not reach the shop");
ok("the order is back to packed and keeps its ready time", (await order(o1)).status === "ready_for_pickup" && (await order(o1)).ready_at !== null);
ok("the removed rider is told", (await notifs(RIDER1, "delivery_cancelled")).length === 1);
ok("unassigning again reports that no rider is assigned", /NO_RIDER/.test((await err(`select public.admin_unassign_rider($1::uuid, null)`, [o1])) ?? ""));
const re2 = await offersOf(RIDER2, o1);
ok("the other rider holds a fresh offer", re2.length === 1 && re2[0].id !== off2[0].id);
await as(RIDER2); await q(`select public.rider_respond_assignment($1::uuid, true)`, [re2[0].id]);
const offerRows = async (uid, orderId) => q(`select is_read, (data ->> 'offers')::int as offers, data ->> 'assignment_id' as assignment_id from notifications where user_id = $1 and type = 'delivery_offer' and data ->> 'order_id' = $2`, [uid, orderId]);
const n2 = await offerRows(RIDER2, o1);
ok("the second offer of the same order refreshed the one notification instead of adding another (0051)", n2.length === 1 && n2[0].offers === 2 && n2[0].is_read === false && n2[0].assignment_id === re2[0].id);
const liveBefore = (await fnv(`public.rider_assignments(array['accepted','picked_up'])`)).find((a) => a.id === re2[0].id);
ok("the rider's active delivery carries no arrival time until the rider taps reached (0051)", liveBefore && liveBefore.arrived_pickup_at === null && liveBefore.arrived_customer_at === null && liveBefore.handover_method === null);
await q(`select public.rider_mark_arrived($1::uuid, 'pickup')`, [re2[0].id]);
const liveArrived = (await fnv(`public.rider_assignments(array['accepted','picked_up'])`)).find((a) => a.id === re2[0].id);
ok("reaching the pickup point shows up on the assignment the app reads, so the journey step survives a reinstall", liveArrived && liveArrived.arrived_pickup_at !== null && liveArrived.arrived_customer_at === null);
await q(`select public.rider_pickup($1::uuid)`, [re2[0].id]);
await q(`select public.rider_mark_arrived($1::uuid, 'customer')`, [re2[0].id]);
const liveCust = (await fnv(`public.rider_assignments(array['accepted','picked_up'])`)).find((a) => a.id === re2[0].id);
ok("collecting the bag and reaching the customer are both visible to the app", liveCust && liveCust.status === "picked_up" && liveCust.handover_method === "rider_tap" && liveCust.arrived_customer_at !== null);
await as(ADMIN);
ok("a collected bag cannot be unassigned", /PICKED_UP/.test((await err(`select public.admin_unassign_rider($1::uuid, null)`, [o1])) ?? ""));
await q(`update delivery_assignments set status = 'delivered' where id = $1`, [re2[0].id]);
await q(`update orders set status = 'delivered' where id = $1`, [o1]);

console.log("Admin assignment only for a packed order");
const o2 = await placeOrder();
await as(ADMIN);
ok("a confirmed order cannot be hand-assigned (it would get stuck)", /INVALID_STATE/.test((await err(`select public.admin_assign_rider($1::uuid, $2::uuid)`, [o2, rider1Id])) ?? ""));
await q(`select public.fulfil_order($1::uuid, 'ready')`, [o2]);
await q(`update settings set value = '240'::jsonb where key = 'dispatch_offer_timeout_seconds'`);
const a2 = await fnv(`public.admin_assign_rider($1::uuid, $2::uuid)`, [o2, rider1Id]);
const a2row = await assignment(a2);
const secs = (new Date(a2row.expires_at).getTime() - Date.now()) / 1000;
ok("an admin's offer expires after the dispatch timeout setting", secs > 200 && secs <= 245, String(secs));
ok("the automatic offers were withdrawn for the hand-picked rider", (await one(`select count(*)::int n from delivery_assignments where order_id = $1 and status = 'offered'`, [o2])).n === 1);
await q(`update settings set value = '180'::jsonb where key = 'dispatch_offer_timeout_seconds'`);
await as(RIDER1); await q(`select public.rider_respond_assignment($1::uuid, true)`, [a2]);
await as(ADMIN);
ok("assigning on top of an accepted rider is refused", /ALREADY_ASSIGNED|INVALID_STATE/.test((await err(`select public.admin_assign_rider($1::uuid, $2::uuid)`, [o2, rider2Id])) ?? ""));
await as(ADMIN); await q(`select public.cancel_order($1::uuid, 'test')`, [o2]);

console.log("Declines and expiries are safe to repeat");
const o3 = await packedOrder();
const d2 = await offersOf(RIDER2, o3);
await as(RIDER2);
const dec = await fnv(`public.rider_respond_assignment($1::uuid, false)`, [d2[0].id]);
ok("a decline is recorded", dec.ok === true && dec.status === "rejected");
const decAgain = await fnv(`public.rider_respond_assignment($1::uuid, false)`, [d2[0].id]);
ok("repeating the decline is a no-op", decAgain.ok === true && decAgain.already === true);
ok("a declined rider cannot then accept", /INVALID_STATE/.test((await err(`select public.rider_respond_assignment($1::uuid, true)`, [d2[0].id])) ?? ""));
const d1 = await offersOf(RIDER1, o3);
await q(`update delivery_assignments set expires_at = now() - interval '1 second' where id = $1`, [d1[0].id]);
await as(RIDER1);
const ex1 = await fnv(`public.rider_respond_assignment($1::uuid, true)`, [d1[0].id]);
const ex2 = await fnv(`public.rider_respond_assignment($1::uuid, true)`, [d1[0].id]);
ok("an expired offer answers OFFER_EXPIRED both times instead of failing", ex1.ok === false && ex1.error === "OFFER_EXPIRED" && ex2.ok === false && ex2.error === "OFFER_EXPIRED");
const fresh1 = await offersOf(RIDER1, o3);
ok("the expiry re-offered the order to the rider who had not declined", fresh1.length === 1 && fresh1[0].id !== d1[0].id);
ok("the rider who declined is not offered it again", (await offersOf(RIDER2, o3)).length === 0);
const n1 = await offerRows(RIDER1, o3);
ok("the re-offer after the expiry refreshed the rider's single request notification", n1.length === 1 && n1[0].offers === 2 && n1[0].assignment_id === fresh1[0].id);
ok("the admin-assigned offer also reuses the notification row", (await offerRows(RIDER1, o2)).length === 1);

console.log("Going offline hands open offers back");
await offline(RIDER1);
ok("the offline rider's offer is closed", (await assignment(fresh1[0].id)).status === "expired");
ok("with nobody left the order is flagged for admins", (await order(o3)).exception === "no_rider" && (await notifs(ADMIN, "dispatch_no_rider")).length >= 1);
await online(RIDER1, 26.648, 74.0325);
const back = await offersOf(RIDER1, o3);
ok("coming back online offers the waiting order again and clears the flag", back.length === 1 && (await order(o3)).exception === null);
await as(RIDER1); await q(`select public.rider_respond_assignment($1::uuid, true)`, [back[0].id]);

console.log("Stale exception flags");
await as(ADMIN);
await q(`update orders set exception = 'delivery_failed' where id = $1`, [o3]);
await q(`update delivery_assignments set status = 'cancelled' where order_id = $1 and status = 'accepted'`, [o3]);
await q(`update orders set status = 'ready_for_pickup' where id = $1`, [o3]);
await as(RIDER1);
const re3 = (await fnv(`public.rider_assignments(array['offered'])`)).filter((a) => a.order.id === o3);
ok("a failed-delivery order is re-offered on the next rider poll", re3.length === 1);
await q(`select public.rider_respond_assignment($1::uuid, true)`, [re3[0].id]);
ok("accepting clears the failed-delivery flag", (await order(o3)).exception === null);
await as(ADMIN);
await q(`update orders set exception = 'no_rider' where id = $1`, [o3]);
await q(`update delivery_assignments set status = 'delivered' where order_id = $1 and status = 'accepted'`, [o3]);
await q(`update orders set status = 'delivered' where id = $1`, [o3]);
ok("a delivered order never keeps a dispatch flag", (await order(o3)).exception === null);

console.log("Heartbeat and quiet riders");
await as(RIDER1); await q(`select public.rider_assignments(array['offered'])`);
const seen = (await one(`select last_seen_at from delivery_partners where id = $1`, [rider1Id])).last_seen_at;
ok("every poll of the rider app records a heartbeat", seen !== null && Date.now() - new Date(seen).getTime() < 5000);
await q(`update settings set value = '10'::jsonb where key = 'rider_online_stale_minutes'`);
const o4 = await packedOrder();
const q1 = await offersOf(RIDER1, o4);
await q(`update delivery_partners set last_seen_at = now() - interval '20 minutes', last_location_at = now() - interval '20 minutes' where id = $1`, [rider1Id]);
await as(CUST);
ok("a customer cannot run housekeeping", /FORBIDDEN/.test((await err(`select public.run_order_housekeeping()`)) ?? ""));
await as(ADMIN);
const hk = await fnv(`public.run_order_housekeeping()`);
ok("housekeeping sets the quiet rider offline and closes their offer", hk.riders_set_offline === 1 && (await one(`select is_online from delivery_partners where id = $1`, [rider1Id])).is_online === false && (await assignment(q1[0].id)).status === "expired");
ok("the rider is told why", (await notifs(RIDER1, "rider_offline")).length === 1);
ok("the other rider still holds the order", (await offersOf(RIDER2, o4)).length === 1);
await as(RIDER2);
ok("a rider cannot run housekeeping", /FORBIDDEN/.test((await err(`select public.run_order_housekeeping()`)) ?? ""));
await as(ADMIN);
const hk2 = await fnv(`public.run_order_housekeeping()`);
ok("running housekeeping again changes nothing", hk2.riders_set_offline === 0 && hk2.expired_offers === 0);
await as(null);
ok("the scheduler (no user) may run it", (await err(`select public.run_order_housekeeping()`)) === null);
const q2 = await offersOf(RIDER2, o4);
await as(RIDER2); await q(`select public.rider_respond_assignment($1::uuid, true)`, [q2[0].id]);
await q(`update delivery_partners set last_seen_at = now() - interval '2 hours', last_location_at = now() - interval '2 hours' where id = $1`, [rider2Id]);
await as(ADMIN);
const hk3 = await fnv(`public.run_order_housekeeping()`);
ok("a rider on a delivery is never set offline", hk3.riders_set_offline === 0 && (await one(`select is_online from delivery_partners where id = $1`, [rider2Id])).is_online === true);
await q(`update settings set value = '0'::jsonb where key = 'rider_online_stale_minutes'`);
await q(`update delivery_partners set last_seen_at = now() - interval '2 hours', last_location_at = now() - interval '2 hours' where id = $1`, [rider2Id]);
await q(`update delivery_assignments set status = 'cancelled' where order_id = $1`, [o4]);
await q(`update orders set status = 'cancelled' where id = $1`, [o4]);
const hk4 = await fnv(`public.run_order_housekeeping()`);
ok("setting 0 switches the quiet-rider rule off", hk4.riders_set_offline === 0);

console.log("Cancellation clears the rider's screen");
await online(RIDER1, 26.648, 74.0325);
const o5 = await packedOrder();
const c1 = await offersOf(RIDER1, o5);
await as(RIDER1); await q(`select public.rider_respond_assignment($1::uuid, true)`, [c1[0].id]);
await as(ADMIN); await q(`select public.cancel_order($1::uuid, 'Customer changed mind')`, [o5]);
await as(RIDER1);
ok("the cancelled order leaves the rider's active list", (await fnv(`public.rider_assignments(array['accepted','picked_up'])`)).every((a) => a.order.id !== o5));
ok("the rider was told", (await notifs(RIDER1, "delivery_cancelled")).length >= 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
