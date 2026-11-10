// Inventory reservations and passbook (0048): reserve on place, finalise on delivery, release on cancel / reject / short item; idempotent retries; insufficient stock; append-only passbook. Run from the project folder:
// required") → "order now" or a monthly restock list → proposal → the buyer approves → an admin places it
// as a real order that the normal packing/rider/OTP flow delivers. Nothing is placed without the buyer's
// approval; unpriced items can never be approved; an admin can pause a buyer. Run from the project folder:
//   node scripts/test-wholesale.mjs "$PWD"
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
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
const fnv = async (sql, params) => (await one(`select ${sql} as r`, params)).r;
const ADMIN = "10000000-0000-4000-8000-000000000001", CUST = "30000000-0000-4000-8000-000000000002", RIDER1 = "40000000-0000-4000-8000-000000000001";

await q(`update settings set value = '{"open":"06:00","close":"24:00"}'::jsonb where key = 'business_hours'`);
await q(`update settings set value = 'true'::jsonb where key in ('business_open', 'auto_accept_orders', 'cod_enabled')`);
await q(`update delivery_partners set is_online = false, current_lat = null, current_lng = null`);
await q(`update delivery_assignments set status = 'cancelled' where status in ('offered','accepted','picked_up')`);
// Seed orders were inserted directly (no place_order), so they carry no stock_state; close them so dispatch only sees ours.
await q(`update orders set status = 'cancelled' where status not in ('delivered','completed','cancelled','rejected')`);
const addr = (await one(`select id from addresses where user_id = $1 order by is_default desc limit 1`, [CUST])).id;
const invs = await q(`select i.id, i.product_id, i.stock_qty, i.reserved_qty, i.selling_price from inventory i join products p on p.id = i.product_id where i.stock_qty > 60 and i.selling_price between 100 and 400 and p.stock_pool_id is null and i.is_active and p.is_active order by i.selling_price desc, i.id limit 2`);
const A = invs[0].id, B = invs[1].id;
const bal = async (inv) => one(`select stock_qty as available, reserved_qty as reserved, stock_qty + reserved_qty as physical from inventory where id = $1`, [inv]);
const pb = async (inv, kind) => q(`select * from inventory_passbook where inventory_id = $1 and ($2::text is null or kind = $2) order by id`, [inv, kind ?? null]);
const orderOf = async (id) => one(`select status, stock_state from orders where id = $1`, [id]);
async function placeOrder(lines, pay = "cod") {
  await as(CUST); await q(`select public.clear_cart()`);
  for (const [inv, n] of lines) await q(`select public.add_to_cart($1::uuid, $2)`, [inv, n]);
  return (await fnv(`public.place_order($1::uuid, $2::public.payment_method, 'standard', null)`, [addr, pay])).order_id;
}
async function deliver(o) {
  await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o]);
  await as(RIDER1); await q(`select public.rider_set_online(true, 26.6480, 74.0325)`);
  const off = (await fnv(`public.rider_assignments(array['offered'])`)).find((x) => x.order.id === o);
  await q(`select public.rider_respond_assignment($1::uuid, true)`, [off.id]); await q(`select public.rider_pickup($1::uuid)`, [off.id]);
  const otp = (await one(`select delivery_otp from order_secrets where order_id = $1`, [o])).delivery_otp;
  await q(`select public.verify_delivery_otp($1::uuid, $2, true, false)`, [off.id, otp]);
  return off.id;
}

console.log("Migration state");
ok("orders inserted outside place_order (seed) carry no stock state and are left alone", (await one(`select count(*)::int n from orders where stock_state is null`)).n === (await one(`select count(*)::int n from orders`)).n);
ok("reserved stock equals the open orders' lines", (await one(`select coalesce(sum(i.reserved_qty), 0)::int r, coalesce((select sum(oi.quantity) from order_items oi join orders o on o.id = oi.order_id where o.stock_state = 'reserved' and oi.inventory_id is not null), 0)::int l from inventory i`)).r === (await one(`select coalesce((select sum(oi.quantity) from order_items oi join orders o on o.id = oi.order_id where o.stock_state = 'reserved' and oi.inventory_id is not null), 0)::int l`)).l);
ok("the passbook is RLS-protected and admin-only", (await one(`select relrowsecurity rs from pg_class where relname = 'inventory_passbook'`)).rs === true && /is_admin/.test((await one(`select qual from pg_policies where tablename = 'inventory_passbook'`)).qual));

console.log("Reserve → deliver");
const a0 = await bal(A), b0 = await bal(B);
const o1 = await placeOrder([[A, 3], [B, 2]]);
let a1 = await bal(A), b1 = await bal(B);
ok("placing moves stock from available to reserved, physical unchanged", a1.available === a0.available - 3 && a1.reserved === a0.reserved + 3 && a1.physical === a0.physical && b1.available === b0.available - 2 && b1.reserved === b0.reserved + 2, JSON.stringify([a0, a1]));
ok("the order is marked reserved", (await orderOf(o1)).stock_state === "reserved");
let rows = await pb(A, "reserve");
const last = rows[rows.length - 1];
ok("the passbook row records the order, the deltas and both balances", last.order_id === o1 && last.delta_available === -3 && last.delta_reserved === 3 && last.available_before === a0.available && last.available_after === a1.available && last.reserved_before === a0.reserved && last.reserved_after === a1.reserved && last.physical_before === last.physical_after, JSON.stringify(last));
ok("the legacy movement row is still written for older screens", (await one(`select count(*)::int n from inventory_movements where inventory_id = $1 and reference_id = $2 and reason = 'order' and delta = -3`, [A, o1])).n === 1);
ok("exactly one passbook row per line, not two", (await one(`select count(*)::int n from inventory_passbook where order_id = $1`, [o1])).n === 2);
await deliver(o1);
const a2 = await bal(A);
ok("delivery removes the reserved quantity from physical stock, available untouched", a2.available === a1.available && a2.reserved === a1.reserved - 3 && a2.physical === a1.physical - 3, JSON.stringify([a1, a2]));
ok("the order is finalised", (await orderOf(o1)).status === "delivered" && (await orderOf(o1)).stock_state === "finalised");
ok("a 'deliver' passbook row links the order", (await pb(A, "deliver")).some((r) => r.order_id === o1 && r.delta_reserved === -3 && r.delta_available === 0));
ok("finalising again is a no-op (retry safe)", (await fnv(`public._order_finalise_stock($1::uuid)`, [o1])) === 0 && (await bal(A)).reserved === a2.reserved);
ok("releasing a delivered order changes nothing", (await fnv(`public._order_release_stock($1::uuid)`, [o1])) === 0 && (await bal(A)).available === a2.available);

console.log("Reserve → cancel");
const o2 = await placeOrder([[A, 4]]);
const a3 = await bal(A);
ok("reserved again", a3.reserved === a2.reserved + 4 && a3.available === a2.available - 4);
await as(CUST);
await q(`select public.cancel_order($1::uuid, 'Changed my mind')`, [o2]);
const a4 = await bal(A);
ok("cancelling returns the quantity to available and clears the reservation", a4.available === a2.available && a4.reserved === a2.reserved && a4.physical === a3.physical, JSON.stringify([a3, a4]));
ok("the order is marked released", (await orderOf(o2)).stock_state === "released");
ok("a 'release' passbook row is written with the reason", (await pb(A, "release")).some((r) => r.order_id === o2 && r.delta_available === 4 && r.delta_reserved === -4 && /Changed my mind/.test(r.note)));
ok("a second cancel is refused and moves nothing", /CANNOT_CANCEL/.test((await err(`select public.cancel_order($1::uuid)`, [o2])) ?? "") && (await bal(A)).available === a4.available);
ok("the internal release is idempotent too", (await fnv(`public._order_release_stock($1::uuid)`, [o2])) === 0 && (await bal(A)).reserved === a4.reserved);

console.log("Reject and item short");
const o3 = await placeOrder([[A, 2], [B, 5]]);
await as(ADMIN);
await q(`select public.fulfil_order($1::uuid, 'reject', 'Out of delivery area')`, [o3]);
ok("rejecting releases every line", (await bal(A)).available === a4.available && (await bal(B)).reserved === b0.reserved && (await orderOf(o3)).stock_state === "released");
const o4 = await placeOrder([[B, 5]]);
const b4 = await bal(B);
const item = await one(`select id from order_items where order_id = $1 and inventory_id = $2`, [o4, B]);
await as(ADMIN);
const x = await fnv(`public.admin_raise_item_exception($1::uuid, 3, 'Only 3 on the shelf')`, [item.id]);
await as(CUST); await q(`select public.customer_resolve_exception($1::uuid, true)`, [x.id]);
const b5 = await bal(B);
ok("an approved short item releases only the missing quantity", b5.available === b4.available + 2 && b5.reserved === b4.reserved - 2, JSON.stringify([b4, b5]));
ok("the exception release is in the passbook with the exception as reference", (await pb(B, "exception_release")).some((r) => r.order_id === o4 && r.delta_available === 2 && r.delta_reserved === -2 && r.reference_id === x.id));
ok("the order still holds the reduced reservation", (await orderOf(o4)).stock_state === "reserved" && (await one(`select quantity from order_items where id = $1`, [item.id])).quantity === 3);
await deliver(o4);
ok("delivering the reduced order takes 3 out of physical stock", (await bal(B)).physical === b5.physical - 3 && (await bal(B)).reserved === b5.reserved - 3);

console.log("Insufficient stock and concurrency");
await as(ADMIN);
const scarce = await one(`select i.id from inventory i join products p on p.id = i.product_id where i.is_active and p.is_active and p.stock_pool_id is null and i.id not in ($1, $2) and i.stock_qty >= 5 and i.selling_price >= 100 and i.max_order_qty >= 3 order by i.stock_qty, i.id limit 1`, [A, B]);
await q(`select public.adjust_stock($1::uuid, $2, 'correction', 'Set to 5 for the test')`, [scarce.id, 5 - (await bal(scarce.id)).available]);
ok("adjusting to a known figure is recorded as a correction", (await bal(scarce.id)).available === 5 && (await pb(scarce.id, "correction")).length >= 1);
const o5 = await placeOrder([[scarce.id, 3]]);
ok("the first customer reserves 3 of 5", (await bal(scarce.id)).available === 2 && (await bal(scarce.id)).reserved >= 3);
const e = await err(`select public.add_to_cart($1::uuid, 3)`, [scarce.id]);
const ins = e ?? (await err(`select public.place_order($1::uuid, 'cod'::public.payment_method, 'standard', null)`, [addr]));
ok("a second order for 3 is refused: only 2 are available", /INSUFFICIENT_STOCK|ITEMS_UNAVAILABLE|ONLY_AVAILABLE|MAX_QTY|stock/i.test(ins ?? ""), ins);
ok("the refusal moved nothing", (await bal(scarce.id)).available === 2);
await as(ADMIN);
ok("stock can never go negative by a manual change either", /NEGATIVE_STOCK/.test((await err(`select public.adjust_stock($1::uuid, -10, 'damage')`, [scarce.id])) ?? ""));
await as(CUST); await q(`select public.cancel_order($1::uuid)`, [o5]);
ok("cancelling the scarce order restores 5", (await bal(scarce.id)).available === 5);

console.log("Passbook is append-only");
await as(ADMIN);
const anyRow = (await q(`select id from inventory_passbook order by id desc limit 1`))[0];
ok("passbook rows cannot be updated", /PASSBOOK_IMMUTABLE/.test((await err(`update inventory_passbook set note = 'x' where id = $1`, [anyRow.id])) ?? ""));
ok("passbook rows cannot be deleted", /PASSBOOK_IMMUTABLE/.test((await err(`delete from inventory_passbook where id = $1`, [anyRow.id])) ?? ""));
ok("a manual adjustment writes a passbook row with actor and note", (await one(`select count(*)::int n from inventory_passbook where inventory_id = $1 and kind = 'correction' and actor_id = $2 and note = 'Set to 5 for the test'`, [scarce.id, ADMIN])).n === 1);
const ov = await fnv(`public.admin_inventory_overview(null, null, null, 500, 0)`);
const rowA = ov.rows.find((r) => r.id === A);
ok("the admin overview reports available, reserved and physical per listing", rowA && rowA.available === (await bal(A)).available && rowA.reserved === (await bal(A)).reserved && rowA.physical === rowA.available + rowA.reserved && typeof ov.totals.physical === "number");
const book = await fnv(`public.admin_inventory_passbook($1::uuid, null, null, 50, 0)`, [A]);
ok("the passbook read returns the listing's movements newest first with order numbers", book.total >= 4 && book.rows[0].id > book.rows[1].id && book.rows.some((r) => r.order_number));
await as(CUST);
ok("customers cannot read the passbook or the overview", /FORBIDDEN/.test((await err(`select public.admin_inventory_passbook()`)) ?? "") && /FORBIDDEN/.test((await err(`select public.admin_inventory_overview()`)) ?? ""));
ok("stock never went negative anywhere", (await one(`select count(*)::int n from inventory where stock_qty < 0 or reserved_qty < 0`)).n === 0);
ok("every passbook row balances: before + delta = after", (await one(`select count(*)::int n from inventory_passbook where available_before + delta_available <> available_after or reserved_before + delta_reserved <> reserved_after`)).n === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
