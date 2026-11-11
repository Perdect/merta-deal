// Cake options (0049): sizes in pounds sort by real weight; a product may offer an eggless version (per-unit
// extra) and a message on the cake; both ride on the cart line and the order line, the extra is part of the
// line price, quantity taps never clear a message, and what a product does not offer is refused. Run from
// the project folder:
//   node scripts/test-cake-options.mjs "$PWD"
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
await q(`update orders set status = 'cancelled' where status not in ('delivered','completed','cancelled','rejected')`);
const addr = (await one(`select id from addresses where user_id = $1 order by is_default desc limit 1`, [CUST])).id;

// A cake family: three sizes in pounds, eggless at ₹30 extra, message accepted; plus a plain snack that offers nothing.
const cat = (await one(`insert into categories (name, slug, icon, sort_order) values ('Bakery', 'bakery-cakes', 'cake', 99) returning id`)).id;
const mk = async (name, slug, lb, label, mrp, price, opts) => {
  const p = (await one(`insert into products (name, slug, category_id, weight_value, weight_unit, pack_label, mrp, image_url, eggless_option, eggless_extra, cake_message)
    values ($1, $2, $3, $4, 'lb', $5, $6, '/x.webp', $7, $8, $9) returning id`, [name, slug, cat, lb, label, mrp, opts.eggless, opts.extra, opts.message])).id;
  const i = (await one(`insert into inventory (product_id, selling_price, mrp, stock_qty, max_order_qty) values ($1, $2, $3, 20, 4) returning id`, [p, price, mrp])).id;
  return { p, i };
};
const cake = { eggless: true, extra: 30, message: true };
await mk("Chocolate Truffle Cake", "choco-truffle-half-lb", 0.5, "Half Pound", 300, 280, cake);
const one_lb = await mk("Chocolate Truffle Cake", "choco-truffle-1-lb", 1, "1 Pound", 550, 520, cake);
await mk("Chocolate Truffle Cake", "choco-truffle-2-lb", 2, "2 Pound", 1050, 990, cake);
const bun = await mk("Plain Bun", "plain-bun", 0.25, "Pack of 4", 40, 35, { eggless: false, extra: 0, message: false });

console.log("Weights in pounds");
ok("pack_grams knows pounds (1 lb = 453.592 g)", Number(await fnv(`public.pack_grams(1, 'lb')`)) === 453.592 && Number(await fnv(`public.pack_grams(2, 'kg')`)) === 2000);
const opts = await fnv(`public.product_pack_options($1::uuid)`, [one_lb.p]);
ok("the three sizes are one family, smallest first", opts.length === 3 && opts.map((v) => v.pack_label).join(",") === "Half Pound,1 Pound,2 Pound");
ok("each size carries its own price, never derived", opts.map((v) => Number(v.selling_price)).join(",") === "280,520,990");
await as(null);
const detail = await fnv(`public.product_detail('choco-truffle-1-lb')`);
ok("product_detail exposes the cake options to the (anonymous) product page", detail.eggless_option === true && Number(detail.eggless_extra) === 30 && detail.cake_message === true && detail.variants.length === 3);
const bunDetail = await fnv(`public.product_detail('plain-bun')`);
ok("a product that offers nothing says so", bunDetail.eggless_option === false && bunDetail.cake_message === false);
ok("the cake note is a public setting with a default", (await fnv(`public.public_settings()`)).cake_variance_note?.length > 10);

console.log("Cart line options");
await as(CUST); await q(`select public.clear_cart()`);
let r = await fnv(`public.add_to_cart($1::uuid, 1, false, true, $2)`, [one_lb.i, "  Happy   Birthday\tRiya  "]);
ok("eggless + message are saved; the message is one clean line", r.eggless === true && r.cake_message === "Happy Birthday Riya");
let sum = await fnv(`public.cart_summary($1::uuid)`, [addr]);
let line = sum.items.find((i) => i.inventory_id === one_lb.i);
ok("the eggless extra is part of the line's unit price (520 + 30)", Number(line.unit_price) === 550 && Number(line.eggless_extra) === 30 && Number(line.line_total) === 550);
ok("the MRP carries the same extra, so savings are not inflated", Number(line.unit_mrp) === 580 && Number(sum.item_savings) === 30);
ok("the subtotal includes the extra", Number(sum.subtotal) === 550);
r = await fnv(`public.add_to_cart($1::uuid, 2)`, [one_lb.i]);
ok("a quantity-only tap keeps both options", r.quantity === 2 && r.eggless === true && r.cake_message === "Happy Birthday Riya");
sum = await fnv(`public.cart_summary($1::uuid)`, [addr]); line = sum.items.find((i) => i.inventory_id === one_lb.i);
ok("two cakes: the extra counts per cake", Number(line.line_total) === 1100 && Number(sum.subtotal) === 1100);
r = await fnv(`public.add_to_cart($1::uuid, 2, false, false, '')`, [one_lb.i]);
ok("eggless off and an empty message clear both", r.eggless === false && r.cake_message === null && Number((await fnv(`public.cart_summary($1::uuid)`, [addr])).subtotal) === 1040);
r = await fnv(`public.add_to_cart($1::uuid, 2, false, null, 'Congrats')`, [one_lb.i]);
ok("a message alone leaves eggless as it was", r.eggless === false && r.cake_message === "Congrats");
ok("a message over 40 characters is refused", /MESSAGE_TOO_LONG/.test(await err(`select public.add_to_cart($1::uuid, 2, false, null, $2)`, [one_lb.i, "x".repeat(41)]) ?? ""));
ok("a message of exactly 40 characters is fine", (await fnv(`public.add_to_cart($1::uuid, 2, false, null, $2)`, [one_lb.i, "y".repeat(40)])).cake_message.length === 40);
ok("eggless is refused on a product that does not offer it", /OPTION_UNAVAILABLE/.test(await err(`select public.add_to_cart($1::uuid, 1, false, true, null)`, [bun.i]) ?? ""));
ok("a message is refused on a product that does not accept one", /OPTION_UNAVAILABLE/.test(await err(`select public.add_to_cart($1::uuid, 1, false, null, 'Hi')`, [bun.i]) ?? ""));
r = await fnv(`public.add_to_cart($1::uuid, 1, false, false, '')`, [bun.i]);
ok("explicit 'no options' is fine on such a product", r.ok === true && r.eggless === false && r.cake_message === null);
ok("control characters never reach the line", (await fnv(`public.add_to_cart($1::uuid, 2, false, true, $2)`, [one_lb.i, "Hi\u0007\u001b there\n"])).cake_message === "Hi there");
await q(`update products set eggless_option = false where id = $1`, [one_lb.p]);
r = await fnv(`public.add_to_cart($1::uuid, 2)`, [one_lb.i]);
ok("an option the product stopped offering is dropped quietly on the next tap", r.eggless === false && r.cake_message === "Hi there");
await q(`update products set eggless_option = true where id = $1`, [one_lb.p]);
await fnv(`public.add_to_cart($1::uuid, 2, false, true, 'Hi there')`, [one_lb.i]);

console.log("Order lines");
const stock0 = (await one(`select stock_qty from inventory where id = $1`, [one_lb.i])).stock_qty;
const placed = await fnv(`public.place_order($1::uuid, 'cod', 'standard', null)`, [addr]);
const oi = await one(`select * from order_items where order_id = $1 and inventory_id = $2`, [placed.order_id, one_lb.i]);
ok("the order line carries eggless and the message", oi.eggless === true && oi.cake_message === "Hi there");
ok("the order line's unit price includes the extra and the line total follows", Number(oi.unit_price) === 550 && Number(oi.unit_mrp) === 580 && Number(oi.line_total) === 1100);
const o = await one(`select subtotal, total, item_count from orders where id = $1`, [placed.order_id]);
ok("the order subtotal is cart subtotal (1100 + 35 bun)", Number(o.subtotal) === 1135);
ok("stock is reserved per cake, not per rupee", (await one(`select stock_qty, reserved_qty from inventory where id = $1`, [one_lb.i])).reserved_qty === 2 && (await one(`select stock_qty from inventory where id = $1`, [one_lb.i])).stock_qty === stock0 - 2);
await as(ADMIN);
const pack = await fnv(`public._pack_lines($1::uuid)`, [placed.order_id]);
const pl = pack.find((l) => l.product_id === one_lb.p);
ok("the packing slip lines show the baker what to do", pl.eggless === true && pl.cake_message === "Hi there" && pl.pack_label === "1 Pound");
await q(`select public.fulfil_order($1::uuid, 'ready')`, [placed.order_id]);
await as(RIDER1); await q(`select public.rider_set_online(true, 26.6480, 74.0325)`);
const offer = (await fnv(`public.rider_assignments(array['offered'])`)).find((x) => x.order.id === placed.order_id);
const ri = offer?.items.find((i) => i.name === "Chocolate Truffle Cake");
ok("the rider's item list carries the options too", Boolean(ri) && ri.eggless === true && ri.cake_message === "Hi there");
await q(`select public.rider_respond_assignment($1::uuid, true)`, [offer.id]); await q(`select public.rider_pickup($1::uuid)`, [offer.id]);
const otp = (await one(`select delivery_otp from order_secrets where order_id = $1`, [placed.order_id])).delivery_otp;
await q(`select public.verify_delivery_otp($1::uuid, $2, true, false)`, [offer.id, otp]);
ok("delivered: the reservation is finalised", (await one(`select status, stock_state from orders where id = $1`, [placed.order_id])).stock_state === "finalised");

console.log("Reorder");
await as(CUST); await q(`select public.clear_cart()`);
await fnv(`public.reorder($1::uuid)`, [placed.order_id]);
sum = await fnv(`public.cart_summary($1::uuid)`, [addr]); line = sum.items.find((i) => i.inventory_id === one_lb.i);
ok("reorder brings the cake back with eggless and the message", line && line.eggless === true && line.cake_message === "Hi there" && Number(line.unit_price) === 550);
await q(`update products set cake_message = false where id = $1`, [one_lb.p]);
await q(`select public.clear_cart()`); await fnv(`public.reorder($1::uuid)`, [placed.order_id]);
line = (await fnv(`public.cart_summary($1::uuid)`, [addr])).items.find((i) => i.inventory_id === one_lb.i);
ok("reorder drops an option the product no longer offers instead of failing", line && line.eggless === true && line.cake_message === null);

console.log("Guards");
ok("order_items refuses a message longer than 40 characters at the table", /cake_message_len|check/i.test(await err(`insert into order_items (order_id, product_id, product_name, quantity, unit_price, unit_mrp, line_total, cake_message) values ($1, $2, 'x', 1, 1, 1, 1, $3)`, [placed.order_id, one_lb.p, "z".repeat(41)]) ?? ""));
ok("a negative eggless extra is refused", /nonneg|check/i.test(await err(`update products set eggless_extra = -1 where id = $1`, [one_lb.p]) ?? ""));
ok("no public object name mentions a store", (await one(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('_cake_message_clean') and p.proname ilike '%store%'`)).n === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
