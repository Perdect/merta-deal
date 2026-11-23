// Costs, prices, rider pay and settlements (0037): goods receipts in packs / cartons / kg with landed costs and
// moving average, loose-produce variant costs, order-line cost snapshots, price history, below-cost guard,
// bulk preview/apply and scheduled changes, rate cards and quotes frozen at accept, compensation for failed
// and cancelled deliveries, adjustments, payouts with an explicit COD offset, duplicate events, profit report,
// and who may see costs. Loads every migration + seed into PGlite. Run from the project folder:
//   node scripts/test-finance.mjs "$PWD"
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
const pot5 = await product("Fin Potato", 500, "g", "500 g", 30, 0, "fin-potato-500-g");
const pot1 = await product("Fin Potato", 1, "kg", "1 kg", 55, 0, "fin-potato-1-kg");
await q(`select public.admin_set_stock_mode($1::uuid, 'loose', true)`, [pot5.id]);
await q(`select public.admin_set_stock_mode($1::uuid, 'loose', true)`, [pot1.id]);
const cost = async (id) => (await one(`select public.product_cost($1::uuid) c`, [id])).c;

console.log("Goods receipt: packs, cartons, kilograms, landed cost, moving average");
const sup = (await one(`insert into suppliers (name, phone) values ('Fin Traders', '9000000001') returning id`)).id;
const po = (await one(`insert into purchase_orders (supplier_id, status, created_by_name) values ($1, 'ordered', 'Sameer') returning id, po_number`, [sup]));
const pol1 = (await one(`insert into purchase_order_lines (po_id, product_id, qty, unit, units_per_carton, unit_price) values ($1, $2, 2, 'carton', 12, 1680) returning id`, [po.id, oil.id])).id;
ok("PO totals come from its lines", near((await one(`select total from purchase_orders where id = $1`, [po.id])).total, 3360));
const grn = (await one(`insert into goods_receipts (po_id, supplier_id, freight, invoice_no) values ($1, $2, 240, 'INV-1') returning id, grn_number`, [po.id, sup]));
await q(`insert into goods_receipt_lines (grn_id, po_line_id, product_id, qty, unit, units_per_carton, unit_cost, batch_no) values ($1, $2, $3, 2, 'carton', 12, 1680, 'B1')`, [grn.id, pol1, oil.id]);
await q(`insert into goods_receipt_lines (grn_id, product_id, qty, unit, unit_cost, batch_no) values ($1, $2, 50, 'kg', 24, 'B2')`, [grn.id, pot1.id]);
const g0 = await one(`select subtotal, total from goods_receipts where id = $1`, [grn.id]);
ok("GRN totals include freight", near(g0.subtotal, 3360 + 1200) && near(g0.total, 4560 + 240));
ok("a GRN without a slip has no net weight", (await one(`select net_weight_kg from goods_receipts where id = $1`, [grn.id])).net_weight_kg == null);
await q(`update goods_receipts set weighbridge_slip_no = '4521', vehicle_no = 'RJ21GA1234', gross_weight_kg = 1250.500, tare_weight_kg = 1200.700 where id = $1`, [grn.id]);
ok("weighbridge net weight is derived from gross and tare", near((await one(`select net_weight_kg from goods_receipts where id = $1`, [grn.id])).net_weight_kg, 49.8, 0.001));
ok("nobody but cost-authorised admins can post", /FORBIDDEN/.test((await (async () => { await as(CUST); const e = await err(`select public.post_goods_receipt($1::uuid)`, [grn.id]); await as(ADMIN); return e; })()) ?? ""));
const posted = await fnv(`public.post_goods_receipt($1::uuid)`, [grn.id]);
ok("posting adds stock: 2 cartons of 12 = 24 packs", posted.lines === 2 && (await one(`select stock_qty from inventory where id = $1`, [oil.inv])).stock_qty === 24);
ok("loose produce lands in the shared pool in grams", (await one(`select balance_g from stock_pools where id = (select stock_pool_id from products where id = $1)`, [pot1.id])).balance_g === 50000);
// Freight 240 split by line value: oil 3360/4560 → 176.84; per pack (3360 + 176.84) / 24 = 147.37
ok("landed pack cost includes its share of freight", near(await cost(oil.id), (3360 + 240 * 3360 / 4560) / 24, 0.02));
// potato: (1200 + 63.16) / 50 kg = 25.26 per kg → 500 g = 12.63, 1 kg = 25.26
ok("loose cost per kg carries freight share", near((await one(`select avg_cost_per_kg from stock_pools where id = (select stock_pool_id from products where id = $1)`, [pot1.id])).avg_cost_per_kg, (1200 + 240 * 1200 / 4560) / 50, 0.02));
ok("500 g variant cost is half the kilogram cost, before any price decision", near(await cost(pot5.id), (await cost(pot1.id)) / 2, 0.01));
ok("last purchase price is remembered on the product", near((await one(`select last_purchase_price from products where id = $1`, [oil.id])).last_purchase_price, 1680));
ok("posting twice changes nothing", (await fnv(`public.post_goods_receipt($1::uuid)`, [grn.id])).already === true && (await one(`select stock_qty from inventory where id = $1`, [oil.inv])).stock_qty === 24);
ok("a posted receipt is locked", /GRN_POSTED/.test((await err(`update goods_receipt_lines set qty = 99 where grn_id = $1`, [grn.id])) ?? ""));
ok("the PO is marked received", (await one(`select status from purchase_orders where id = $1`, [po.id])).status === "received");
ok("stock ledger has the receipt", (await one(`select count(*)::int n from inventory_movements where reason = 'grn' and reference_id = $1`, [grn.id])).n === 2);
// Second receipt at a higher price: moving average
const grn2 = (await one(`insert into goods_receipts (supplier_id) values ($1) returning id`, [sup])).id;
await q(`insert into goods_receipt_lines (grn_id, product_id, qty, unit, unit_cost) values ($1, $2, 24, 'pack', 160)`, [grn2, oil.id]);
await q(`select public.post_goods_receipt($1::uuid)`, [grn2]);
const c1 = (3360 + 240 * 3360 / 4560) / 24;
ok("a dearer receipt moves the average, old cost stays on the first GRN", near(await cost(oil.id), (24 * c1 + 24 * 160) / 48, 0.02) && near((await one(`select landed_unit_cost from goods_receipt_lines where grn_id = $1`, [grn.id])).landed_unit_cost, c1, 0.02));
ok("goods received but unpaid: supplier balance open", (await one(`select payment_status, total - paid_amount due from goods_receipts where id = $1`, [grn.id])).payment_status === "unpaid");
const pay = await fnv(`public.record_supplier_payment($1::uuid, 2000, 'UPI-1')`, [grn.id]);
ok("a part payment leaves the rest due", near(pay.due, 4800 - 2000) && (await one(`select payment_status from goods_receipts where id = $1`, [grn.id])).payment_status === "partial");
ok("cannot overpay", /AMOUNT_ABOVE_DUE/.test((await err(`select public.record_supplier_payment($1::uuid, 99999)`, [grn.id])) ?? ""));
ok("costs are invisible to customers and riders", await (async () => { await as(CUST); const r = await fnv(`public.admin_product_costs(array[$1::uuid])`, [oil.id]); await as(ADMIN); return JSON.stringify(r) === "{}"; })());
ok("admins see cost and margin", Number((await fnv(`public.admin_product_costs(array[$1::uuid])`, [oil.id]))[oil.id].margin) > 0);

console.log("Selling prices");
await q(`update settings set value = '"super_admin"'::jsonb where key = 'cost_visibility_roles'`);
await as(OPS);
ok("a plain admin cannot see costs when visibility is super admins only", JSON.stringify(await fnv(`public.admin_product_costs(array[$1::uuid])`, [oil.id])) === "{}");
await q(`update settings set value = '"admin"'::jsonb where key = 'cost_visibility_roles'`);
await as(ADMIN);
ok("price below cost is refused", /BELOW_COST/.test((await err(`select public.admin_set_price($1::uuid, 100, 180, 'clearance')`, [oil.id])) ?? ""));
const sp = await fnv(`public.admin_set_price($1::uuid, 100, 180, 'clearance', true)`, [oil.id]);
ok("…unless confirmed, and the confirmation is recorded", sp.below_cost === true && (await one(`select count(*)::int n from audit_logs where action = 'price.below_cost_confirmed'`)).n === 1);
const ph = await one(`select old_price, new_price, below_cost, reason, changed_by_name from price_history where product_id = $1 order by created_at desc limit 1`, [oil.id]);
ok("price history keeps old, new, reason and who", near(ph.old_price, 180) && near(ph.new_price, 100) && ph.below_cost === true && ph.reason === "clearance" && ph.changed_by_name === "Sameer Khan");
ok("price above MRP is refused", /PRICE_ABOVE_MRP/.test((await err(`select public.admin_set_price($1::uuid, 200, 180)`, [oil.id])) ?? ""));
ok("negative or zero price is refused", /INVALID_PRICE/.test((await err(`select public.admin_set_price($1::uuid, 0)`, [oil.id])) ?? ""));
await q(`select public.admin_set_price($1::uuid, 180, 180, 'back to list')`, [oil.id]);
const prev = await fnv(`public.admin_price_preview($1::jsonb, 'percent', 10)`, [JSON.stringify({ ids: [oil.id, pot5.id] })]);
ok("bulk preview shows before/after without changing anything", prev.length === 2 && prev.every((r) => near(r.new_price, Number(r.price) * 1.1)) && near((await one(`select selling_price from inventory where id = $1`, [oil.inv])).selling_price, 180));
const applied = await fnv(`public.admin_price_apply($1::jsonb, 'percent', 10, 'festive', null, false)`, [JSON.stringify({ ids: [oil.id, pot5.id] })]);
ok("bulk apply changes both and audits once", applied.count === 2 && near((await one(`select selling_price from inventory where id = $1`, [oil.inv])).selling_price, 198) && (await one(`select count(*)::int n from audit_logs where action = 'price.bulk'`)).n === 1);
ok("bulk apply below cost needs confirmation", /BELOW_COST/.test((await err(`select public.admin_price_apply($1::jsonb, 'set', 1, 'oops')`, [JSON.stringify({ ids: [oil.id] })])) ?? ""));
const sched = await fnv(`public.admin_price_apply($1::jsonb, 'set', 175, 'weekend', now() + interval '1 hour', false)`, [JSON.stringify({ ids: [oil.id] })]);
ok("a future change is scheduled, not applied", sched.scheduled === true && near((await one(`select selling_price from inventory where id = $1`, [oil.inv])).selling_price, 198));
await q(`update scheduled_price_changes set effective_at = now() - interval '1 minute' where status = 'scheduled'`);
ok("due changes apply on the next sweep", (await fnv(`public.apply_due_price_changes()`)) === 1 && near((await one(`select selling_price from inventory where id = $1`, [oil.inv])).selling_price, 175));
ok("500 g and 1 kg keep independent selling prices", near((await one(`select selling_price from inventory where id = $1`, [pot5.inv])).selling_price, 33) && near((await one(`select selling_price from inventory where id = $1`, [pot1.inv])).selling_price, 55));

console.log("Order lines snapshot cost");
async function placeOrder(lines, pay = "cod") {
  await as(CUST); await q(`select public.clear_cart()`);
  for (const [inv, n] of lines) await q(`select public.add_to_cart($1::uuid, $2)`, [inv, n]);
  return (await fnv(`public.place_order($1::uuid, $2::public.payment_method, 'standard', null)`, [addr, pay])).order_id;
}
const o1 = await placeOrder([[oil.inv, 1], [pot5.inv, 2]]);
const oiRows = await q(`select product_id, unit_cost from order_items where order_id = $1`, [o1]);
ok("each line carries the cost at placement", oiRows.length === 2 && near(oiRows.find((r) => r.product_id === oil.id).unit_cost, await cost(oil.id), 0.01) && near(oiRows.find((r) => r.product_id === pot5.id).unit_cost, await cost(pot5.id), 0.01));
const grn3 = (await one(`insert into goods_receipts (supplier_id) values ($1) returning id`, [sup])).id;
await as(ADMIN); await q(`insert into goods_receipt_lines (grn_id, product_id, qty, unit, unit_cost) values ($1, $2, 100, 'pack', 300)`, [grn3, oil.id]); await q(`select public.post_goods_receipt($1::uuid)`, [grn3]);
ok("a later purchase does not rewrite the order's cost", near((await one(`select unit_cost from order_items where order_id = $1 and product_id = $2`, [o1, oil.id])).unit_cost, oiRows.find((r) => r.product_id === oil.id).unit_cost, 0.0001));

console.log("Rider rate card, quote at accept, earning once");
await as(ADMIN);
const card = await fnv(`public.admin_save_rate_card('Test card', $1::jsonb, null, true)`, [JSON.stringify({ base: 25, included_km: 2, per_km: 6, zone_rates: [], weight_supplement: { min_kg: 5, amount: 10 }, peak: [{ start: "00:00", end: "23:59", amount: 5 }], failed_attempt: 12, cancelled_after_pickup: 15, return_trip: 8, incentives: [] })]);
ok("a new card version is active and the old one kept", card.version === 2 && (await one(`select count(*)::int n from rider_rate_cards`)).n === 2 && (await one(`select count(*)::int n from rider_rate_cards where is_active`)).n === 1);
await as(OPS);
ok("only a super admin changes rates", /SUPER_ADMIN_REQUIRED/.test((await err(`select public.admin_save_rate_card('x', '{"base":1}'::jsonb)`)) ?? ""));
await as(ADMIN);
const calc = await fnv(`public.rider_pay_calc($1::jsonb, 4.2, 6, null, now())`, [JSON.stringify({ base: 25, included_km: 2, per_km: 6, weight_supplement: { min_kg: 5, amount: 10 }, peak: [{ start: "00:00", end: "23:59", amount: 5 }] })]);
ok("calculator: base + 3 km beyond 2 (4.2 rounds up) + heavy + peak", near(calc.amount, 25 + 3 * 6 + 10 + 5) && calc.lines.length === 4);
ok("calculator: no pin means no distance pay, stated", (await fnv(`public.rider_pay_calc($1::jsonb, null, 0, null, now())`, [JSON.stringify({ base: 25, per_km: 6 })])).lines.some((l) => /no map pin/i.test(l.label)));
const o2 = await placeOrder([[oil.inv, 2]]);
await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o2]);
await as(RIDER1); await q(`select public.rider_set_online(true, 26.6480, 74.0325)`);
const offer = (await fnv(`public.rider_assignments(array['offered'])`))[0];
const quote = await fnv(`public.rider_pay_quote($1::uuid)`, [o2]);
const acc = await fnv(`public.rider_respond_assignment($1::uuid, true)`, [offer.id]);
const a2 = await one(`select earning, quoted_breakdown, rate_card_id from delivery_assignments where id = $1`, [offer.id]);
ok("the quote is frozen on the assignment at accept, with the card", near(acc.earning, quote.amount) && near(a2.earning, quote.amount) && a2.rate_card_id === card.id && a2.quoted_breakdown.lines.length >= 1);
await as(ADMIN); await q(`select public.admin_save_rate_card('Later card', $1::jsonb, null, true)`, [JSON.stringify({ base: 99, per_km: 0 })]);
await as(RIDER1); await q(`select public.rider_pickup($1::uuid)`, [offer.id]);
const otp = await doorCode(o2);
await q(`select public.verify_delivery_otp($1::uuid, $2, true)`, [offer.id, otp]);
const e2 = await q(`select kind, amount, status, rate_card_id from rider_earnings where assignment_id = $1`, [offer.id]);
ok("the earning uses the frozen quote, not the card changed mid-delivery", e2.length === 1 && near(e2[0].amount, quote.amount) && e2[0].rate_card_id === card.id && e2[0].status === "pending");
ok("a repeated completion does not pay twice", (await fnv(`public.verify_delivery_otp($1::uuid, $2, true)`, [offer.id, otp])).already === true && (await one(`select count(*)::int n from rider_earnings where assignment_id = $1`, [offer.id])).n === 1);
const o2total = Number((await one(`select total from orders where id = $1`, [o2])).total);
ok("COD collected is cash due, not income", near((await fnv(`public.rider_earnings_history(10)`)).totals.cash_due, cashBase + o2total) && (await fnv(`public.rider_earnings_history(10)`)).earnings[0].kind === "delivery");

console.log("Failed attempt and cancellation compensation");
await as(ADMIN); await q(`update rider_rate_cards set is_active = false`); await q(`update rider_rate_cards set is_active = true where id = $1`, [card.id]);
const o3 = await placeOrder([[oil.inv, 2]]);
await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o3]);
await as(RIDER1);
const off3 = (await fnv(`public.rider_assignments(array['offered'])`))[0];
await q(`select public.rider_respond_assignment($1::uuid, true)`, [off3.id]);
await q(`select public.rider_pickup($1::uuid)`, [off3.id]);
const failed = await fnv(`public.rider_report_failed_delivery($1::uuid, 'customer_unreachable', null)`, [off3.id]);
ok("a failed attempt after pickup earns the card's compensation once", near(failed.compensation, 12) && (await one(`select count(*)::int n from rider_earnings where assignment_id = $1 and kind = 'failed_attempt'`, [off3.id])).n === 1);
const o4 = await placeOrder([[oil.inv, 2]]);
await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o4]);
await as(RIDER1);
const off4 = (await fnv(`public.rider_assignments(array['offered'])`))[0];
await q(`select public.rider_respond_assignment($1::uuid, true)`, [off4.id]); await q(`select public.rider_pickup($1::uuid)`, [off4.id]);
await as(ADMIN); await q(`select public.cancel_order($1::uuid, 'Customer called')`, [o4]);
ok("cancelled after pickup compensates the rider", near((await one(`select amount from rider_earnings where assignment_id = $1 and kind = 'cancelled_after_pickup'`, [off4.id])).amount, 15));
const o5 = await placeOrder([[oil.inv, 2]]);
await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o5]);
await as(RIDER1);
const off5 = (await fnv(`public.rider_assignments(array['offered'])`))[0];
await q(`select public.rider_respond_assignment($1::uuid, true)`, [off5.id]);
await as(ADMIN); await q(`select public.cancel_order($1::uuid, 'Before pickup')`, [o5]);
ok("cancelled before pickup pays nothing", (await one(`select count(*)::int n from rider_earnings where assignment_id = $1`, [off5.id])).n === 0);

console.log("Adjustments and settlement with COD offset");
await as(ADMIN);
ok("an adjustment needs a reason", /REASON_REQUIRED/.test((await err(`select public.admin_rider_adjustment($1::uuid, 20, '')`, [r1])) ?? ""));
await q(`select public.admin_rider_adjustment($1::uuid, -5, 'Late by 40 min')`, [r1]);
const bal = (await fnv(`public.admin_rider_balances()`)).find((b) => b.rider_id === r1);
const expectedPayable = Number(quote.amount) + 12 + 15 - 5;
ok("payable = delivery + compensations + adjustment; cash is separate", near(bal.payable, expectedPayable) && near(bal.cash_due, cashBase + o2total));
ok("offset above cash due is refused", /AMOUNT_ABOVE_DUE/.test((await err(`select public.admin_create_rider_payout($1::uuid, null, 100000)`, [r1])) ?? ""));
const po1 = await fnv(`public.admin_create_rider_payout($1::uuid, 'weekly', 10)`, [r1]);
ok("payout records gross, offset and net, and the cash side as a remittance", near(po1.gross, expectedPayable) && near(po1.cod_offset, 10) && near(po1.amount, expectedPayable - 10) && (await one(`select count(*)::int n from rider_cash_remittances where rider_id = $1 and reference like 'Offset in payout%'`, [r1])).n === 1);
ok("cash due dropped by the offset only", near((await fnv(`public._rider_cash($1::uuid)`, [r1])).due, cashBase + o2total - 10));
await q(`select public.admin_settle_rider_payout($1::uuid, 'paid', 'UPI-REF-1')`, [po1.payout_id]);
ok("settling marks every included earning paid", (await one(`select count(*)::int n from rider_earnings where rider_id = $1 and status <> 'paid'`, [r1])).n === 0);
await as(RIDER1);
const hist = await fnv(`public.rider_earnings_history(50)`);
ok("the rider sees the breakdown per delivery and the settlement", hist.earnings.some((e) => e.kind === "delivery" && e.breakdown && e.breakdown.lines) && hist.payouts.length === 1 && near(hist.payouts[0].cod_offset, 10));

console.log("Profit report");
await as(ADMIN);
const rep = await fnv(`public.admin_profit_report(current_date - 1, current_date + 1)`);
ok("sales, COGS and gross profit are reported with the method stated", rep.costing_method === "moving_average" && Number(rep.sales) > 0 && Number(rep.cogs) > 0 && near(rep.gross_profit, Number(rep.sales) - Number(rep.cogs)));
ok("rider costs and supplier balance are separate lines", near(rep.rider_costs, expectedPayable) && near(rep.supplier_balance, (4800 - 2000) + 24 * 160 + 100 * 300));
ok("contribution is labelled as not net profit", rep.notes.some((n) => /not net profit/.test(n)));
await as(CUST);
ok("customers cannot read the profit report", /FORBIDDEN/.test((await err(`select public.admin_profit_report(current_date, current_date)`)) ?? ""));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
