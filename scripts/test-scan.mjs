// QR / barcode scanning checks (0034): identity, lookup, stock in grams and packs, mixed 500 g + 1 kg orders,
// packing, repeated scans, unauthorised access, cancellation and delivery. Loads every migration + seed into
// PGlite. Run from a folder with @electric-sql/pglite installed:
//   node scripts/test-scan.mjs "$PWD"
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { randomUUID as key } from "node:crypto";
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
const as = async (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
const rls = async (uid, sql, params) => { await as(uid); await db.exec(`set role authenticated`); try { return (await db.query(sql, params)).rows; } finally { await db.exec(`reset role`); } };
const CUST = "30000000-0000-4000-8000-000000000002", ADMIN = "10000000-0000-4000-8000-000000000001";
const fnv = async (sql, params) => (await one(`select ${sql} as r`, params)).r;

await q(`update settings set value = '{"open":"00:00","close":"23:59"}'::jsonb where key = 'business_hours'`);
await q(`update settings set value = 'true'::jsonb where key = 'business_open'`);
const vegCat = (await one(`select id from categories where slug = 'vegetables'`)).id;
async function product(name, value, unit, label, price, stock, slug) {
  const p = await one(`insert into products (name, slug, category_id, weight_value, weight_unit, pack_label, mrp) values ($1, $2, $3, $4, $5, $6, $7) returning id, sku, scan_code`, [name, slug, vegCat, value, unit, label, price]);
  const i = await one(`insert into inventory (product_id, selling_price, mrp, stock_qty, max_order_qty) values ($1, $2, $2, $3, 50) returning id`, [p.id, price, stock]);
  return { ...p, inv: i.id };
}
const addr = (await one(`select id from addresses where user_id = $1 limit 1`, [CUST])).id;
const stockOf = async (inv) => (await one(`select stock_qty, status from inventory where id = $1`, [inv]));
async function placeOrder(lines, pay = "cod") {
  await as(CUST); await q(`select public.clear_cart()`);
  for (const [inv, n] of lines) await q(`select public.add_to_cart($1::uuid, $2)`, [inv, n]);
  return (await fnv(`public.place_order($1::uuid, $2::public.payment_method, 'standard', null)`, [addr, pay])).order_id;
}

await as(ADMIN);
const tom5 = await product("Test Tomato", 500, "g", "500 g", 200, 4, "test-tomato-500-g");
const tom1 = await product("Test Tomato", 1, "kg", "1 kg", 380, 3, "test-tomato-1-kg");
const oil = await product("Test Oil", 1, "l", "1 L", 300, 10, "test-oil-1-l");
const beans = await product("Test Beans", 250, "g", "250 g", 150, 20, "test-beans-250-g");

console.log("Codes");
ok("every product has a SKU and a scan code", (await one(`select count(*)::int n from products where sku is null or scan_code is null`)).n === 0);
ok("sizes of one product have different codes", tom5.scan_code !== tom1.scan_code && tom5.sku !== tom1.sku);
await q(`update products set scan_code = 'P-HACK', sku = 'X' where id = $1`, [tom5.id]);
const kept = await one(`select sku, scan_code from products where id = $1`, [tom5.id]);
ok("a printed code cannot be changed", kept.scan_code === tom5.scan_code && kept.sku === tom5.sku);
ok("scan code carries no price or name", /^P-[0-9A-F]{16}$/.test(tom5.scan_code));

console.log("Loose stock setup keeps the grams on the shelf");
ok("confirmation needed to change stock type", /CONFIRMATION_REQUIRED/.test(await err(`select public.admin_set_stock_mode($1::uuid, 'loose')`, [tom5.id]) ?? ""));
await q(`select public.admin_set_stock_mode($1::uuid, 'loose', true)`, [tom5.id]);
await q(`select public.admin_set_stock_mode($1::uuid, 'loose', true)`, [tom1.id]);
ok("oil in litres cannot be loose", /NOT_SOLD_BY_WEIGHT/.test(await err(`select public.admin_set_stock_mode($1::uuid, 'loose', true)`, [oil.id]) ?? ""));
const pool = (await one(`select stock_pool_id id from products where id = $1`, [tom5.id])).id;
ok("both sizes share one pool", (await one(`select stock_pool_id id from products where id = $1`, [tom1.id])).id === pool);
const bal = async () => Number((await one(`select balance_g b from stock_pools where id = $1`, [pool])).b);
ok("4 x 500 g + 3 x 1 kg = 5,000 g", (await bal()) === 5000, String(await bal()));
ok("500 g size shows 10 packs", (await stockOf(tom5.inv)).stock_qty === 10);
ok("1 kg size shows 5 packs", (await stockOf(tom1.inv)).stock_qty === 5);

console.log("Product lookup");
const r1 = await fnv(`public.scan_resolve($1)`, [tom5.scan_code]);
ok("found by scan code", r1.kind === "product" && r1.product.id === tom5.id);
ok("shows selected size, price, available and reserved", r1.product.pack_label === "500 g" && Number(r1.product.selling_price) === 200 && r1.product.available_packs === 10 && r1.product.pool.reserved_g === 0);
ok("lists both sizes, selected one marked", r1.product.variants.length === 2 && r1.product.variants.find((v) => v.selected).id === tom5.id);
ok("found through the printed link", (await fnv(`public.scan_resolve($1)`, [`https://mertadeal.com/q/${tom5.scan_code}`])).kind === "product");
ok("found by SKU typed by hand", (await fnv(`public.scan_resolve($1)`, [tom1.sku.toLowerCase()])).product.id === tom1.id);
await q(`select public.admin_set_product_barcode($1::uuid, '8901234567890')`, [oil.id]);
ok("found by existing barcode", (await fnv(`public.scan_resolve('8901234567890')`)).product.id === oil.id);
ok("a barcode cannot sit on two products", /BARCODE_IN_USE/.test(await err(`select public.admin_set_product_barcode($1::uuid, '8901234567890')`, [beans.id]) ?? ""));
ok("a bad barcode is refused", /INVALID_BARCODE/.test(await err(`select public.admin_set_product_barcode($1::uuid, 'abc')`, [beans.id]) ?? ""));
ok("unknown code says unknown", (await fnv(`public.scan_resolve('NOT-A-CODE')`)).kind === "unknown");
ok("looking a product up changes nothing", (await bal()) === 5000 && (await one(`select count(*)::int n from inventory_movements where inventory_id = $1 and reason <> 'stock_type_change'`, [tom5.inv])).n === 0);

console.log("Receiving and correcting stock");
const stock = (args) => `public.scan_stock_action(${args})`;
const act = async (k, pid, action, qty, unit, extra = {}) => fnv(stock(`$1::uuid, $2::uuid, $3, $4::numeric, $5, $6, $7, $8, $9`), [k, pid, action, qty, unit, extra.direction ?? null, extra.reason ?? null, extra.note ?? null, extra.confirmed ?? true]);
const actErr = async (k, pid, action, qty, unit, extra = {}) => err(`select ${stock(`$1::uuid, $2::uuid, $3, $4::numeric, $5, $6, $7, $8, $9`)}`, [k, pid, action, qty, unit, extra.direction ?? null, extra.reason ?? null, extra.note ?? null, extra.confirmed ?? true]);

ok("needs confirmation", /CONFIRMATION_REQUIRED/.test(await actErr(key(), tom5.id, "receive", 1, "kg", { confirmed: false }) ?? ""));
ok("needs a quantity", /QUANTITY_REQUIRED/.test(await actErr(key(), tom5.id, "receive", 0, "kg") ?? ""));
ok("loose refuses packs", /UNIT_NOT_ALLOWED/.test(await actErr(key(), tom5.id, "receive", 3, "packs") ?? ""));
ok("prepacked refuses kg", /UNIT_NOT_ALLOWED/.test(await actErr(key(), oil.id, "receive", 3, "kg") ?? ""));
ok("prepacked refuses half a pack", /WHOLE_PACKS_REQUIRED/.test(await actErr(key(), oil.id, "receive", 1.5, "packs") ?? ""));
ok("fractions of a gram refused", /WHOLE_GRAMS_REQUIRED/.test(await actErr(key(), tom5.id, "receive", 0.0005, "kg") ?? ""));
ok("nothing moved by refused actions", (await bal()) === 5000);

const k1 = key();
const rec = await act(k1, tom5.id, "receive", 2.5, "kg");
ok("2.5 kg received as 2,500 g", (await bal()) === 7500 && rec.balance_after === 7500 && rec.balance_unit === "g");
ok("both sizes rise together", (await stockOf(tom5.inv)).stock_qty === 15 && (await stockOf(tom1.inv)).stock_qty === 7);
const rep = await act(k1, tom5.id, "receive", 2.5, "kg");
ok("repeated request changes nothing", rep.replayed === true && (await bal()) === 7500);
ok("repeated request leaves one movement", (await one(`select count(*)::int n from inventory_movements where request_key = $1`, [k1])).n === 1);
await act(key(), tom1.id, "receive", 500, "g");
ok("500 g entered in grams", (await bal()) === 8000);
await act(key(), oil.id, "receive", 5, "packs");
ok("prepacked counted in packs", (await stockOf(oil.inv)).stock_qty === 15);
ok("prepacked has no gram balance", (await fnv(`public.scan_product($1::uuid)`, [oil.id])).pool === null);
ok("wastage needs a reason", /REASON_REQUIRED/.test(await actErr(key(), tom5.id, "wastage", 1, "kg") ?? ""));
await act(key(), tom5.id, "wastage", 1, "kg", { reason: "Spoiled", note: "Crate 3" });
ok("wastage removes 1,000 g", (await bal()) === 7000);
ok("adjust needs a direction", /DIRECTION_REQUIRED/.test(await actErr(key(), tom5.id, "adjust", 1, "kg", { reason: "Count" }) ?? ""));
ok("adjust needs a reason", /REASON_REQUIRED/.test(await actErr(key(), tom5.id, "adjust", 1, "kg", { direction: "add" }) ?? ""));
await act(key(), tom5.id, "adjust", 2, "kg", { direction: "remove", reason: "Shelf count" });
ok("adjust removes 2,000 g", (await bal()) === 5000);
ok("stock cannot go below zero", /NEGATIVE_STOCK/.test(await actErr(key(), tom5.id, "wastage", 99, "kg", { reason: "x" }) ?? ""));
const hist = await fnv(`public.scan_stock_history($1::uuid)`, [tom1.id]);
const w = hist.find((h) => h.reason === "wastage");
ok("history is shared across sizes", hist.some((h) => h.pack_label === "500 g") && hist.some((h) => h.pack_label === "1 kg"));
ok("history has staff, date, reason and quantity", w && w.staff && w.at && /Spoiled/.test(w.note) && Number(w.quantity) === 1 && w.unit === "kg" && Number(w.delta_grams) === -1000, JSON.stringify(w));
ok("every stock action is in the audit log", (await one(`select count(*)::int n from audit_logs where action like 'stock.%'`)).n >= 5);

console.log("Mixed 500 g and 1 kg order");
const mixed = await placeOrder([[tom5.inv, 2], [tom1.inv, 2]]);
await as(ADMIN);
ok("2 x 500 g + 2 x 1 kg takes 3,000 g", (await bal()) === 2000, String(await bal()));
ok("pack counts follow the balance", (await stockOf(tom5.inv)).stock_qty === 4 && (await stockOf(tom1.inv)).stock_qty === 2);
const after = await fnv(`public.scan_product($1::uuid)`, [tom5.id]);
ok("reserved shows the 3,000 g in the order", Number(after.pool.reserved_g) === 3000 && after.reserved_packs === 2);
const mv = await one(`select delta_grams, actor_name, balance_unit from inventory_movements where reference_id = $1 and inventory_id = $2`, [mixed, tom1.inv]);
ok("order movement recorded in grams", Number(mv.delta_grams) === -2000 && mv.balance_unit === "g");

await as(CUST); await q(`select public.clear_cart()`);
await q(`select public.add_to_cart($1::uuid, 2)`, [tom5.inv]); await q(`select public.add_to_cart($1::uuid, 2)`, [tom1.inv]);
const sum = await fnv(`public.cart_summary($1::uuid)`, [addr]);
ok("cart flags sizes that together exceed the balance", sum.issues.length === 2 && sum.issues.every((i) => i.reason === "stock"), JSON.stringify(sum.issues));
ok("order refused when the balance cannot cover it", /ITEMS_UNAVAILABLE/.test(await err(`select public.place_order($1::uuid, 'cod', 'standard', null)`, [addr]) ?? ""));
await as(ADMIN);
ok("refused order took nothing", (await bal()) === 2000);
await q(`update inventory set stock_qty = stock_qty - 1 where id = $1`, [tom1.inv]);
ok("a direct sale of one size also draws the shared balance", (await bal()) === 1000 && (await stockOf(tom5.inv)).stock_qty === 2);
ok("selling more than the balance is refused", /INSUFFICIENT_STOCK/.test(await err(`update inventory set stock_qty = stock_qty - 5 where id = $1`, [tom1.inv]) ?? ""));
await q(`update inventory set stock_qty = stock_qty + 1 where id = $1`, [tom1.inv]);

console.log("Order code and packing");
const o = await one(`select scan_code, order_number from orders where id = $1`, [mixed]);
ok("order code is unique and private", /^O-[0-9A-F]{16}$/.test(o.scan_code));
const ro = await fnv(`public.scan_resolve($1)`, [o.scan_code]);
ok("scanning opens the order for staff", ro.kind === "order" && ro.order.id === mixed && ro.order.lines.length === 2);
ok("order number typed by hand works", (await fnv(`public.scan_resolve($1)`, [o.order_number])).order.id === mixed);
const scan = async (code, k = key()) => fnv(`public.pack_scan($1::uuid, $2::uuid, $3)`, [k, mixed, code]);
ok("packing must be started first", /NOT_PACKABLE/.test(await err(`select public.pack_scan($1::uuid, $2::uuid, $3)`, [key(), mixed, tom5.scan_code]) ?? ""));
const st = await fnv(`public.pack_start($1::uuid)`, [mixed]);
ok("start moves the order to packing", st.status === "preparing");
const balBefore = await bal();
const s1k = key();
const s1 = await scan(tom5.scan_code, s1k);
ok("correct label counted", s1.result === "ok" && s1.order.lines.find((l) => l.pack_label === "500 g").packed_qty === 1, JSON.stringify(s1));
const s1r = await scan(tom5.scan_code, s1k);
ok("retry of the same scan does not count twice", s1r.replayed === true && s1r.order.lines.find((l) => l.pack_label === "500 g").packed_qty === 1);
await scan(tom5.sku);
const ex = await scan(tom5.scan_code);
ok("extra scan flagged, not counted", ex.result === "extra" && ex.order.lines.find((l) => l.pack_label === "500 g").packed_qty === 2);
const wr = await scan(oil.scan_code);
ok("wrong product flagged", wr.result === "wrong_product" && /Test Oil/.test(wr.message));
const un = await scan("GARBAGE");
ok("unknown label flagged", un.result === "unknown");
const beansOrder = await placeOrder([[beans.inv, 1]]);
await as(ADMIN);
const tom5Only = await placeOrder([[tom5.inv, 1]]);
await as(ADMIN);
await q(`select public.pack_start($1::uuid)`, [tom5Only]);
const ww = await fnv(`public.pack_scan($1::uuid, $2::uuid, $3)`, [key(), tom5Only, tom1.scan_code]);
ok("wrong weight flagged with what is needed", ww.result === "wrong_weight" && /500 g/.test(ww.message), ww.message);
const inc = await fnv(`public.pack_complete($1::uuid, $2::uuid, true)`, [key(), mixed]);
ok("missing items block packing", inc.ok === false && inc.missing.length === 1 && inc.missing[0].missing === 2, JSON.stringify(inc));
ok("the old Packed button cannot skip missing items", /PACK_INCOMPLETE/.test(await err(`select public.fulfil_order($1::uuid, 'ready')`, [mixed]) ?? ""));
await scan(tom1.scan_code);
const und = await fnv(`public.pack_undo($1::uuid, $2::uuid, $3::uuid)`, [key(), mixed, (await one(`select id from order_items where order_id = $1 and product_id = $2`, [mixed, tom1.id])).id]);
ok("one can be taken back out", und.lines.find((l) => l.pack_label === "1 kg").packed_qty === 0);
await scan(tom1.scan_code); await scan(tom1.scan_code);
ok("confirmation needed to finish", /CONFIRMATION_REQUIRED/.test(await err(`select public.pack_complete($1::uuid, $2::uuid, false)`, [key(), mixed]) ?? ""));
const ck = key();
const done = await fnv(`public.pack_complete($1::uuid, $2::uuid, true)`, [ck, mixed]);
ok("packing confirmed", done.ok === true && done.order.packed_by_name && ["ready_for_pickup"].includes(done.order.status), JSON.stringify(done).slice(0, 200));
ok("confirming twice is harmless", (await fnv(`public.pack_complete($1::uuid, $2::uuid, true)`, [ck, mixed])).already === true);
ok("packing changed no stock (only the second order's 500 g left)", (await bal()) === balBefore - 500, String(await bal()));
ok("no stock movement came from packing", (await one(`select count(*)::int n from inventory_movements where reference_id = $1`, [mixed])).n === 2);
ok("wrong scans are kept for review", done.order.flags.length >= 3);
ok("cannot scan into a packed order", /NOT_PACKABLE/.test(await err(`select public.pack_scan($1::uuid, $2::uuid, $3)`, [key(), mixed, tom5.scan_code]) ?? ""));

console.log("Cancellation");
const balC = await bal();
await as(CUST);
await as(ADMIN);
await q(`select public.pack_scan($1::uuid, $2::uuid, $3)`, [key(), tom5Only, tom5.scan_code]);
await q(`select public.cancel_order($1::uuid, 'Customer called')`, [tom5Only]);
ok("cancel mid-packing restores the grams once", (await bal()) === balC + 500, String(await bal()));
ok("cancelled order cannot be scanned", /NOT_PACKABLE/.test(await err(`select public.pack_scan($1::uuid, $2::uuid, $3)`, [key(), tom5Only, tom5.scan_code]) ?? ""));
ok("cancelled order cannot be marked packed", /NOT_PACKABLE/.test(await err(`select public.pack_complete($1::uuid, $2::uuid, true)`, [key(), tom5Only]) ?? ""));
ok("second cancel refused, no second restock", /CANNOT_CANCEL/.test(await err(`select public.cancel_order($1::uuid, 'again')`, [tom5Only]) ?? "") && (await bal()) === balC + 500);
ok("cancelled order cannot be dispatched", /./.test(await err(`select public.scan_confirm_dispatch($1::uuid)`, [tom5Only]) ?? ""));

console.log("Delivery");
await q(`update delivery_assignments set status = 'cancelled' where order_id = $1 and status = 'offered'`, [mixed]);
const riders = await q(`select dp.id, dp.user_id from delivery_partners dp where dp.status = 'active' and not exists (select 1 from delivery_assignments a where a.rider_id = dp.id and a.status in ('accepted','picked_up')) order by dp.id limit 2`);
const [R, OTHER] = riders;
ok("cannot dispatch before a rider accepts", /NO_RIDER_ACCEPTED/.test(await err(`select public.scan_confirm_dispatch($1::uuid)`, [mixed]) ?? ""));
const a1 = await fnv(`public.scan_assign_rider($1::uuid, $2::uuid)`, [mixed, R.id]);
const a2 = await fnv(`public.scan_assign_rider($1::uuid, $2::uuid)`, [mixed, R.id]);
ok("assigning twice makes one offer", a1.already === false && a2.already === true && (await one(`select count(*)::int n from delivery_assignments where order_id = $1 and status = 'offered'`, [mixed])).n === 1);
const asg = (await one(`select id from delivery_assignments where order_id = $1 and status = 'offered'`, [mixed])).id;
await as(OTHER.user_id);
ok("another rider cannot open the order", /NOT_ASSIGNED/.test(await err(`select public.scan_resolve($1)`, [o.scan_code]) ?? ""));
ok("another rider cannot pick it up", /NOT_ASSIGNED/.test(await err(`select public.rider_scan_pickup($1::uuid)`, [mixed]) ?? ""));
await as(R.user_id);
const rv = await fnv(`public.scan_resolve($1)`, [o.scan_code]);
ok("assigned rider can open it", rv.kind === "rider_order" && rv.order.assignment_id === asg);
const rvText = JSON.stringify(rv);
ok("rider scan shows no customer details", !/address|phone|full_name|customer/i.test(rvText), rvText);
ok("rider cannot look up products", /FORBIDDEN/.test(await err(`select public.scan_resolve($1)`, [tom5.scan_code]) ?? ""));
await q(`select public.rider_respond_assignment($1::uuid, true)`, [asg]);
await as(ADMIN);
const d1 = await fnv(`public.scan_confirm_dispatch($1::uuid)`, [mixed]);
ok("staff scan confirms dispatch", d1.ok === true && d1.order.status === "out_for_delivery", JSON.stringify(d1).slice(0, 160));
ok("confirming dispatch twice is harmless", (await fnv(`public.scan_confirm_dispatch($1::uuid)`, [mixed])).already === true);
ok("a scan does not deliver", (await one(`select status from orders where id = $1`, [mixed])).status === "out_for_delivery");
await as(R.user_id);
ok("rider pickup scan after dispatch is harmless", (await fnv(`public.rider_scan_pickup($1::uuid)`, [mixed])).already === true);
ok("wrong OTP does not deliver", (await fnv(`public.verify_delivery_otp($1::uuid, '0000', true)`, [asg])).ok === false);
const otp = (await one(`select delivery_otp from order_secrets where order_id = $1`, [mixed])).delivery_otp;
ok("COD needs cash confirmed", (await fnv(`public.verify_delivery_otp($1::uuid, $2, false)`, [asg, otp])).needs_cash === true);
ok("no cash entry before collection", (await one(`select count(*)::int n from cod_collections where order_id = $1`, [mixed])).n === 0);
const dl = await fnv(`public.verify_delivery_otp($1::uuid, $2, true)`, [asg, otp]);
ok("right OTP delivers", dl.ok === true && (await one(`select status from orders where id = $1`, [mixed])).status === "delivered");
const again = await fnv(`public.verify_delivery_otp($1::uuid, $2, true)`, [asg, otp]);
ok("repeat OTP is harmless", again.already === true);
const cod = await q(`select amount from cod_collections where order_id = $1`, [mixed]);
ok("cash recorded once, for the order total", cod.length === 1 && Number(cod[0].amount) === Number((await one(`select total from orders where id = $1`, [mixed])).total));
await q(`select public._complete_delivery($1::uuid, 'otp')`, [asg]);
ok("even a replayed completion cannot add a second entry", (await one(`select count(*)::int n from cod_collections where order_id = $1`, [mixed])).n === 1);
await as(ADMIN);
ok("delivered order shows its cash entry", Number((await fnv(`public.scan_order_detail($1::uuid)`, [mixed])).cod.amount) > 0);
ok("delivered order cannot be dispatched again", /NO_RIDER_ACCEPTED/.test(await err(`select public.scan_confirm_dispatch($1::uuid)`, [mixed]) ?? ""));
ok("rider loses the order once delivered", (await as(R.user_id), /NOT_ASSIGNED/.test(await err(`select public.scan_resolve($1)`, [o.scan_code]) ?? "")));

console.log("Packing an order before dispatch rules");
await as(ADMIN);
const early = await placeOrder([[beans.inv, 1]]);
await as(ADMIN);
await q(`select public.scan_assign_rider($1::uuid, $2::uuid)`, [early, OTHER.id]);
const ea = (await one(`select id from delivery_assignments where order_id = $1 and status = 'offered'`, [early])).id;
await as(OTHER.user_id); await q(`select public.rider_respond_assignment($1::uuid, true)`, [ea]);
ok("rider cannot take an unpacked order by scan", /ORDER_NOT_PACKED/.test(await err(`select public.rider_scan_pickup($1::uuid)`, [early]) ?? ""));
await as(ADMIN);
ok("staff cannot dispatch an unpacked order by scan", /ORDER_NOT_PACKED/.test(await err(`select public.scan_confirm_dispatch($1::uuid)`, [early]) ?? ""));

console.log("Unauthorised access");
const guest = (await one(`insert into auth.users (id, phone, raw_user_meta_data, is_anonymous) values (gen_random_uuid(), null, '{}'::jsonb, true) returning id`)).id;
const calls = [
  [`public.scan_resolve($1)`, [tom5.scan_code]], [`public.scan_product($1::uuid)`, [tom5.id]], [`public.scan_order_detail($1::uuid)`, [mixed]],
  [`public.scan_stock_history($1::uuid)`, [tom5.id]], [`public.admin_set_stock_mode($1::uuid, 'pack', true)`, [tom5.id]], [`public.admin_set_product_barcode($1::uuid, '12345678')`, [tom5.id]],
  [`public.scan_stock_action($1::uuid, $2::uuid, 'receive', 1, 'kg', null, null, null, true)`, [key(), tom5.id]],
  [`public.pack_start($1::uuid)`, [beansOrder]], [`public.pack_scan($1::uuid, $2::uuid, 'x')`, [key(), beansOrder]], [`public.pack_undo($1::uuid, $2::uuid, $2::uuid)`, [key(), beansOrder]],
  [`public.pack_complete($1::uuid, $2::uuid, true)`, [key(), beansOrder]], [`public.scan_assign_rider($1::uuid, $2::uuid)`, [beansOrder, R.id]], [`public.scan_confirm_dispatch($1::uuid)`, [beansOrder]],
];
for (const [who, uid] of [["customer", CUST], ["guest", guest]]) {
  await as(uid);
  let refused = 0;
  for (const [sql, params] of calls) if (/FORBIDDEN/.test(await err(`select ${sql}`, params) ?? "")) refused++;
  ok(`${who} refused on all ${calls.length} scan actions`, refused === calls.length, `${refused}/${calls.length}`);
}
await as(CUST);
ok("customer gets the same refusal for a code that does not exist", /FORBIDDEN/.test(await err(`select public.scan_resolve('NOPE')`) ?? ""));
await as(R.user_id);
let riderRefused = 0;
for (const [sql, params] of calls.slice(1)) if (/FORBIDDEN/.test(await err(`select ${sql}`, params) ?? "")) riderRefused++;
ok("rider refused on all staff-only actions", riderRefused === calls.length - 1, `${riderRefused}/${calls.length - 1}`);
await as(ADMIN);
const newAdmin = (await one(`insert into auth.users (id, raw_user_meta_data) values (gen_random_uuid(), '{}') returning id`)).id;
await q(`update profiles set role = 'admin', is_active = false where id = $1`, [newAdmin]).catch(() => {});
await as(ADMIN); await q(`select public.admin_set_user_role($1::uuid, 'admin')`, [newAdmin]).catch(() => {});
await q(`update profiles set is_active = false where id = $1`, [newAdmin]);
await as(newAdmin);
ok("deactivated admin refused", /FORBIDDEN/.test(await err(`select public.scan_resolve($1)`, [tom5.scan_code]) ?? ""));
ok("customers cannot read stock pools", (await rls(CUST, `select * from stock_pools`)).length === 0);
ok("customers cannot read packing events", (await rls(CUST, `select * from order_pack_events`)).length === 0);
ok("customers cannot read cash entries", (await rls(CUST, `select * from cod_collections`)).length === 0);
ok("customers cannot write stock pools", /./.test(await (async () => { await as(CUST); await db.exec(`set role authenticated`); try { const r = await db.query(`update stock_pools set balance_g = 999999`); return r.affectedRows === 0 ? "blocked" : null; } catch (e) { return e.message; } finally { await db.exec(`reset role`); } })() ?? ""));
ok("internal helpers are not callable by users", /permission denied/.test((await (async () => { await as(CUST); await db.exec(`set role authenticated`); try { await db.query(`select public._pool_sync($1::uuid)`, [pool]); return ""; } catch (e) { return e.message; } finally { await db.exec(`reset role`); } })())));

console.log("Labels");
await as(ADMIN);
const lab = await fnv(`public.admin_label_products($1::uuid[], null, true)`, [[tom5.id, oil.id]]);
ok("labels carry name, size, SKU and code, no price", lab.length === 2 && lab.every((l) => l.sku && l.scan_code && l.pack_label && !("selling_price" in l)));
ok("loose sizes are marked loose", lab.find((l) => l.id === tom5.id).loose === true && lab.find((l) => l.id === oil.id).loose === false);
ok("unlisted products are left out by default", (await fnv(`public.admin_label_products(null, 'vegetables', true)`)).every((l) => l.listed));
ok("customer cannot list labels", /FORBIDDEN/.test((await (async () => { await as(CUST); return err(`select public.admin_label_products(null, null, true)`); })()) ?? ""));
await as(ADMIN);

console.log("Prepacked sizes stay separate; switching back keeps the grams");
await as(ADMIN);
const balS = await bal(); const t1 = (await stockOf(tom1.inv)).stock_qty;
await q(`select public.admin_set_stock_mode($1::uuid, 'pack', true)`, [tom1.id]);
ok("detached size keeps its packs", (await stockOf(tom1.inv)).stock_qty === t1);
ok("its grams leave the shared balance", (await bal()) === balS - t1 * 1000);
await act(key(), tom1.id, "receive", 2, "packs");
ok("detached size now takes packs", (await stockOf(tom1.inv)).stock_qty === t1 + 2);
ok("and does not touch the other size", (await bal()) === balS - t1 * 1000);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
