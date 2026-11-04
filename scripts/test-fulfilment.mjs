// Fulfilment flow checks (0036): capacity limit, rider arrival, handover record (scan vs tap, scan-only mode),
// cancellation notice to the assigned rider, exception flags, unavailable-item approval / decline / expiry /
// admin decision with stock and bill effects, duplicate payment callbacks, pick-list bin locations.
// Loads every migration + seed into PGlite. Run from the project folder:
//   node scripts/test-fulfilment.mjs "$PWD"
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
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
const fnv = async (sql, params) => (await one(`select ${sql} as r`, params)).r;
const ADMIN = "10000000-0000-4000-8000-000000000001", CUST = "30000000-0000-4000-8000-000000000002";
const RIDER1 = "40000000-0000-4000-8000-000000000001", RIDER2 = "40000000-0000-4000-8000-000000000002";

await q(`update settings set value = '{"open":"00:00","close":"23:59"}'::jsonb where key = 'business_hours'`);
await q(`update settings set value = 'true'::jsonb where key = 'business_open'`);
await q(`update delivery_partners set is_online = false, current_lat = null, current_lng = null`);
await q(`update delivery_assignments set status = 'cancelled' where status in ('offered','accepted','picked_up')`);
await q(`update orders set status = 'cancelled' where status not in ('delivered','completed','cancelled','rejected')`);
await q(`update orders set accepted_at = now() where accepted_at is null`);
await q(`delete from notifications`);
const addr = (await one(`select id from addresses where user_id = $1 order by is_default desc limit 1`, [CUST])).id;
const invs = await q(`select i.id, i.product_id, i.stock_qty, i.selling_price from inventory i join products p on p.id = i.product_id where i.stock_qty > 60 and i.selling_price between 100 and 400 and p.stock_pool_id is null order by i.selling_price limit 2`);
const invA = invs[0].id, invB = invs[1].id;
async function placeOrder(lines, pay = "cod") {
  await as(CUST); await q(`select public.clear_cart()`);
  for (const [inv, n] of lines) await q(`select public.add_to_cart($1::uuid, $2)`, [inv, n]);
  return (await fnv(`public.place_order($1::uuid, $2::public.payment_method, 'standard', null)`, [addr, pay])).order_id;
}
const orderOf = async (id) => one(`select status, payment_status, total, subtotal, item_count, exception from orders where id = $1`, [id]);
const stock = async (inv) => (await one(`select stock_qty from inventory where id = $1`, [inv])).stock_qty;
const notifs = async (type, orderId) => q(`select n.user_id, p.role, n.body from notifications n join profiles p on p.id = n.user_id where n.type = $1 and n.data ->> 'order_id' = $2`, [type, orderId]);
const adminCount = (await one(`select count(*)::int n from profiles where role in ('admin','super_admin') and is_active`)).n;

console.log("Capacity");
await as(null);
let cap = await fnv(`public.order_capacity()`);
ok("no limit by default", cap.max === 0 && cap.accepting === true);
await q(`update settings set value = '1'::jsonb where key = 'max_active_orders'`);
const o1 = await placeOrder([[invA, 2]]);
ok("the first order fits", Boolean(o1));
ok("capacity now reports full", (await fnv(`public.order_capacity()`)).accepting === false);
await as(CUST); await q(`select public.clear_cart()`); await q(`select public.add_to_cart($1::uuid, 2)`, [invA]);
ok("the next order is refused with a clear message", /CAPACITY_FULL/.test((await err(`select public.place_order($1::uuid, 'cod', 'standard', null)`, [addr])) ?? ""));
await q(`update settings set value = '0'::jsonb where key = 'max_active_orders'`);
ok("no limit again", (await fnv(`public.order_capacity()`)).accepting === true);

console.log("Pick list");
await q(`update products set bin_location = 'A-12' where id = (select product_id from inventory where id = $1)`, [invA]);
await as(ADMIN);
let detail = await fnv(`public.scan_order_detail($1::uuid)`, [o1]);
ok("lines carry the bin location", detail.lines[0].bin_location === "A-12");

console.log("Unavailable item: customer approves a reduction");
const o2 = await placeOrder([[invA, 3], [invB, 1]]);
const before = await orderOf(o2); const stockA = await stock(invA);
const itemA = (await one(`select id, unit_price from order_items where order_id = $1 and inventory_id = $2`, [o2, invA]));
await as(ADMIN);
ok("packing is not blocked before any exception", (await err(`select 1`)) === null);
const ex = await fnv(`public.admin_raise_item_exception($1::uuid, 1, 'only one left on the shelf')`, [itemA.id]);
ok("the exception is pending with who raised it", ex.status === "pending" && ex.kind === "short" && ex.created_by_name === "Sameer Khan" && ex.requested_qty === 3 && ex.available_qty === 1);
ok("the order is flagged", (await orderOf(o2)).exception === "item_exception");
ok("the customer is asked, not the admins", (await notifs("order_exception", o2)).length === 1 && (await notifs("order_exception", o2))[0].user_id === CUST);
ok("packing is refused while the customer decides", /EXCEPTION_PENDING/.test((await err(`select public.fulfil_order($1::uuid, 'ready')`, [o2])) ?? ""));
ok("a second exception on the same line is refused", /EXCEPTION_PENDING/.test((await err(`select public.admin_raise_item_exception($1::uuid, 0)`, [itemA.id])) ?? ""));
ok("available must be below ordered", /INVALID_QUANTITY/.test((await err(`select public.admin_raise_item_exception($1::uuid, 3)`, [itemA.id])) ?? ""));
await as(RIDER1);
ok("someone else cannot answer for the customer", /FORBIDDEN/.test((await err(`select public.customer_resolve_exception($1::uuid, true)`, [ex.id])) ?? ""));
await as(CUST);
const res = await fnv(`public.customer_resolve_exception($1::uuid, true)`, [ex.id]);
const after = await orderOf(o2);
ok("approval reduces the line and the bill", res.status === "approved" && Number(after.subtotal) === Number(before.subtotal) - 2 * Number(itemA.unit_price) && after.item_count === before.item_count - 2);
ok("released stock goes back on the shelf once", (await stock(invA)) === stockA + 2);
ok("the release is in the stock ledger", (await one(`select count(*)::int n from inventory_movements where reason = 'exception_release' and reference_id = $1`, [o2])).n === 1);
ok("no refund on a cash order", Number(res.refund_amount) === 0 && !/refund/.test(after.payment_status));
ok("the flag clears", after.exception === null);
ok("admins hear the outcome", (await notifs("exception_resolved", o2)).length === adminCount);
ok("answering twice is harmless", (await fnv(`public.customer_resolve_exception($1::uuid, true)`, [ex.id])).already === true);
await as(ADMIN);
ok("packing proceeds after approval", (await fnv(`public.fulfil_order($1::uuid, 'ready')`, [o2])).status === "ready_for_pickup");

console.log("Unavailable item: prepaid refund and removal");
const o3 = await placeOrder([[invA, 2], [invB, 2]], "razorpay");
await as(null, "service_role");
await q(`select public.confirm_online_payment($1::uuid, 'ord_x', 'pay_x', 'sig', null)`, [o3]);
const paidNotifs = (await notifs("payment", o3)).length;
await q(`select public.confirm_online_payment($1::uuid, 'ord_x', 'pay_x', 'sig', null)`, [o3]);
ok("a repeated payment callback sends nothing twice", (await notifs("payment", o3)).length === paidNotifs && (await orderOf(o3)).payment_status === "paid");
const itemB = (await one(`select id, unit_price from order_items where order_id = $1 and inventory_id = $2`, [o3, invB]));
const totalBefore = Number((await orderOf(o3)).total); const stockB = await stock(invB);
await as(ADMIN);
const ex3 = await fnv(`public.admin_raise_item_exception($1::uuid, 0)`, [itemB.id]);
ok("zero available is an 'unavailable' exception", ex3.kind === "unavailable");
await as(CUST);
const res3 = await fnv(`public.customer_resolve_exception($1::uuid, true)`, [ex3.id]);
ok("the line is removed and the total drops by its value", Number(res3.total) === totalBefore - 2 * Number(itemB.unit_price) && (await one(`select count(*)::int n from order_items where id = $1`, [itemB.id])).n === 0);
ok("the refund due equals the difference and admins are told", Number(res3.refund_amount) === 2 * Number(itemB.unit_price) && (await notifs("refund_due", o3)).length === adminCount);
ok("the payment row is marked refund-required", (await one(`select refund_required from payments where order_id = $1`, [o3])).refund_required === true);
ok("both units return to stock", (await stock(invB)) === stockB + 2);

console.log("Unavailable item: customer declines, order cancelled");
const o4 = await placeOrder([[invA, 2]]);
await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'preparing')`, [o4]);
const itemA4 = (await one(`select id from order_items where order_id = $1`, [o4])).id;
const stockA4 = await stock(invA);
const ex4 = await fnv(`public.admin_raise_item_exception($1::uuid, 1)`, [itemA4]);
await as(CUST);
const res4 = await fnv(`public.customer_resolve_exception($1::uuid, false)`, [ex4.id]);
ok("declining cancels the order even though packing had started", res4.status === "declined" && (await orderOf(o4)).status === "cancelled");
ok("everything goes back to stock on cancel", (await stock(invA)) === stockA4 + 2);
ok("the exception is closed", (await one(`select status from order_exceptions where id = $1`, [ex4.id])).status === "declined");

console.log("Unavailable item: no reply, admin decides");
const o5 = await placeOrder([[invA, 2]]);
await as(ADMIN);
const itemA5 = (await one(`select id from order_items where order_id = $1`, [o5])).id;
const ex5 = await fnv(`public.admin_raise_item_exception($1::uuid, 1)`, [itemA5]);
await q(`update order_exceptions set expires_at = now() - interval '1 minute' where id = $1`, [ex5.id]);
await as(null, "service_role");
ok("the sweep expires it and tells admins", (await fnv(`public.expire_item_exceptions()`)) === 1 && (await notifs("exception_expired", o5)).length === adminCount);
await as(CUST);
ok("the customer can no longer approve an expired one", (await fnv(`public.customer_resolve_exception($1::uuid, true)`, [ex5.id])).already === true);
await as(ADMIN);
const adm5 = await fnv(`public.admin_resolve_exception($1::uuid, 'apply')`, [ex5.id]);
ok("the admin applies the available quantity and the customer is told", adm5.status === "approved" && (await orderOf(o5)).item_count === 1 && (await notifs("order_status", o5)).some((n) => /adjusted/.test(n.body)));
ok("the flag clears after the admin decision", (await orderOf(o5)).exception === null);

console.log("Rider arrival, handover and cancellation notice");
// Earlier orders are closed so the first offer a rider sees is the one this section packs.
await q(`update delivery_assignments set status = 'cancelled' where status in ('offered','accepted','picked_up')`);
await q(`update orders set status = 'delivered' where id in ($1, $2, $3)`, [o2, o3, o5]);
const o6 = await placeOrder([[invA, 2]]);
await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o6]);
await as(RIDER1); await q(`select public.rider_set_online(true, 26.6480, 74.0325)`);
const offer = (await fnv(`public.rider_assignments(array['offered'])`))[0];
ok("the packed order is offered", offer && offer.order.id === o6);
ok("arrival cannot be marked before accepting", /INVALID_STATE/.test((await err(`select public.rider_mark_arrived($1::uuid, 'pickup')`, [offer.id])) ?? ""));
await q(`select public.rider_respond_assignment($1::uuid, true)`, [offer.id]);
await as(RIDER2);
ok("another rider cannot mark arrival", /FORBIDDEN/.test((await err(`select public.rider_mark_arrived($1::uuid, 'pickup')`, [offer.id])) ?? ""));
await as(RIDER1);
await q(`select public.rider_mark_arrived($1::uuid, 'pickup')`, [offer.id]);
await q(`select public.rider_mark_arrived($1::uuid, 'pickup')`, [offer.id]);
const arr = await one(`select arrived_pickup_at, arrived_customer_at from delivery_assignments where id = $1`, [offer.id]);
ok("arrival at the store is recorded once and admins told once", arr.arrived_pickup_at !== null && (await notifs("rider_arrived", o6)).length === adminCount);
ok("customer arrival needs the pickup first", /INVALID_STATE/.test((await err(`select public.rider_mark_arrived($1::uuid, 'customer')`, [offer.id])) ?? ""));
await q(`update settings set value = 'true'::jsonb where key = 'handover_requires_scan'`);
ok("with scan-only handover the tap is refused", /HANDOVER_SCAN_REQUIRED/.test((await err(`select public.rider_pickup($1::uuid)`, [offer.id])) ?? ""));
await q(`select public.rider_scan_pickup($1::uuid)`, [o6]);
const ho = await one(`select status, handover_method, handed_over_by, handed_over_by_name, handed_over_at from delivery_assignments where id = $1`, [offer.id]);
ok("the rider's scan records the handover", ho.status === "picked_up" && ho.handover_method === "rider_scan" && ho.handed_over_by === RIDER1 && ho.handed_over_at !== null);
ok("the order is out for delivery", (await orderOf(o6)).status === "out_for_delivery");
await q(`select public.rider_mark_arrived($1::uuid, 'customer')`, [offer.id]);
ok("arrival at the customer is recorded", (await one(`select arrived_customer_at from delivery_assignments where id = $1`, [offer.id])).arrived_customer_at !== null);
await q(`update settings set value = 'false'::jsonb where key = 'handover_requires_scan'`);
await as(ADMIN);
await q(`select public.cancel_order($1::uuid, 'Customer called to cancel')`, [o6]);
ok("the rider on the road is told to bring it back", (await notifs("delivery_cancelled", o6)).length === 1 && (await notifs("delivery_cancelled", o6))[0].user_id === RIDER1 && /bring it back/.test((await notifs("delivery_cancelled", o6))[0].body));
ok("the assignment is closed", (await one(`select status from delivery_assignments where id = $1`, [offer.id])).status === "cancelled");

console.log("Handover by admin scan and by tap");
const o7 = await placeOrder([[invA, 2]]);
await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o7]);
await as(RIDER1);
const off7 = (await fnv(`public.rider_assignments(array['offered'])`))[0];
ok("the free rider gets the next order", off7 && off7.order.id === o7);
await q(`select public.rider_respond_assignment($1::uuid, true)`, [off7.id]);
await as(ADMIN); await q(`select public.scan_confirm_dispatch($1::uuid)`, [o7]);
const ho7 = await one(`select handover_method, handed_over_by_name from delivery_assignments where id = $1`, [off7.id]);
ok("an admin scan records the staff member who handed over", ho7.handover_method === "admin_scan" && ho7.handed_over_by_name === "Sameer Khan");
await q(`update delivery_assignments set status = 'delivered' where id = $1`, [off7.id]); await q(`update orders set status = 'delivered' where id = $1`, [o7]);
const o8 = await placeOrder([[invA, 2]]);
await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o8]);
await as(RIDER1);
const off8 = (await fnv(`public.rider_assignments(array['offered'])`))[0];
await q(`select public.rider_respond_assignment($1::uuid, true)`, [off8.id]);
ok("the tap is allowed when scan-only is off", (await fnv(`public.rider_pickup($1::uuid)`, [off8.id])).status === "picked_up");
ok("the tap is recorded as such", (await one(`select handover_method from delivery_assignments where id = $1`, [off8.id])).handover_method === "rider_tap");
ok("a repeated tap is harmless", (await fnv(`public.rider_pickup($1::uuid)`, [off8.id])).already === true);

console.log("Exception flags from dispatch and failed delivery");
const fr = await fnv(`public.rider_report_failed_delivery($1::uuid, 'customer_unreachable', null)`, [off8.id]);
ok("a failed delivery flags the order and returns it to the store", fr.order_status === "ready_for_pickup" && (await orderOf(o8)).exception === "delivery_failed");
ok("admins get exactly one failed-delivery notice each", (await notifs("delivery_failed", o8)).filter((n) => n.role !== "customer").length === adminCount);
await q(`update delivery_partners set is_online = false`);
await as(ADMIN); await fnv(`public.admin_order_alerts()`);
ok("the flag stays delivery_failed rather than no_rider", (await orderOf(o8)).exception === "delivery_failed");
const r1id = (await one(`select id from delivery_partners where user_id = $1`, [RIDER1])).id;
await q(`select public.admin_assign_rider($1::uuid, $2::uuid)`, [o8, r1id]);
ok("assigning a rider clears the flag", (await orderOf(o8)).exception === null);
const o9 = await placeOrder([[invA, 2]]);
await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o9]);
ok("packed with nobody online is flagged no_rider", (await orderOf(o9)).exception === "no_rider");
await as(RIDER2); await q(`select public.rider_set_online(true, 26.6481, 74.0323)`);
ok("the flag clears when an offer goes out", (await orderOf(o9)).exception === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
