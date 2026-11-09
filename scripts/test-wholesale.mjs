// Wholesale for kirana shops (0045): registration → admin approval → wholesale products with case sizes,
// MOQ and a price (or "quote required") → monthly restock list → proposal → the shop approves → an admin
// places it as a real order that the normal packing/rider/OTP flow delivers. Nothing is placed without
// the shop's approval; unpriced items can never be approved. Run from the project folder:
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
const ADMIN = "10000000-0000-4000-8000-000000000001", CUST = "30000000-0000-4000-8000-000000000002", OTHER = "30000000-0000-4000-8000-000000000001";
const RIDER1 = "40000000-0000-4000-8000-000000000001";
const dstr = (v) => typeof v === "string" ? v.slice(0, 10) : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

await q(`update settings set value = '{"open":"06:00","close":"24:00"}'::jsonb where key = 'business_hours'`);
await q(`update settings set value = 'true'::jsonb where key in ('business_open', 'auto_accept_orders', 'cod_enabled')`);
await q(`update delivery_partners set is_online = false, current_lat = null, current_lng = null`);
await q(`update delivery_assignments set status = 'cancelled' where status in ('offered','accepted','picked_up')`);
await q(`update orders set status = 'cancelled' where status not in ('delivered','completed','cancelled','rejected')`);
await q(`delete from notifications`);
const addr = (await one(`select id from addresses where user_id = $1 order by is_default desc limit 1`, [CUST])).id;
const prodA = await one(`select p.id, p.name, i.id as inv, i.stock_qty, i.selling_price from products p join inventory i on i.product_id = p.id where i.stock_qty >= 60 and i.is_active and p.is_active order by i.stock_qty desc limit 1`);
const prodB = await one(`select p.id, p.name, i.id as inv, i.stock_qty from products p join inventory i on i.product_id = p.id where i.stock_qty >= 24 and i.is_active and p.is_active and p.id <> $1 order by i.stock_qty desc limit 1`, [prodA.id]);

console.log("Registration");
await as(null);
ok("anonymous visitors cannot register", /AUTH_REQUIRED|permission/i.test((await err(`select public.register_kirana_shop('Shop', 'Owner', '9876500001')`)) ?? ""));
await as(CUST);
ok("a bad phone is refused", /valid 10-digit/.test((await err(`select public.register_kirana_shop('Jain Kirana', 'Rakesh', '12345')`)) ?? ""));
ok("a bad GSTIN is refused", /GSTIN/.test((await err(`select public.register_kirana_shop('Jain Kirana', 'Rakesh', '9876500001', 'BAD')`)) ?? ""));
ok("someone else's address is refused", /saved addresses/.test((await err(`select public.register_kirana_shop('Jain Kirana', 'Rakesh', '9876500001', null, (select id from addresses where user_id = $1 limit 1))`, [OTHER])) ?? ""));
const shop = await fnv(`public.register_kirana_shop('Jain Kirana', 'Rakesh Jain', '+91 98765 00001', '08ABCDE1234F1Z5', $1::uuid, 'Atta, oil and tea every month')`, [addr]);
ok("the shop is registered as pending", shop.status === "pending" && shop.phone === "9876500001" && shop.gstin === "08ABCDE1234F1Z5", JSON.stringify(shop));
ok("admins are notified", (await one(`select count(*)::int c from notifications where type = 'kirana_shop' and user_id = $1`, [ADMIN])).c === 1);
const me0 = await fnv(`public.my_kirana_shop()`);
ok("the owner sees the pending shop and no list", me0.shop.status === "pending" && me0.list === null);
ok("a pending shop cannot save a list", /approved before/.test((await err(`select public.save_wholesale_list(5, '[]'::jsonb)`)) ?? ""));
ok("re-submitting updates the same shop", (await fnv(`public.register_kirana_shop('Jain Kirana Store Merta', 'Rakesh Jain', '9876500001', null, $1::uuid)`, [addr])).id === shop.id);

console.log("Admin setup");
ok("a customer cannot approve a shop", /FORBIDDEN/.test((await err(`select public.admin_review_kirana_shop($1::uuid, 'approved')`, [shop.id])) ?? ""));
await as(ADMIN);
const approved = await fnv(`public.admin_review_kirana_shop($1::uuid, 'approved', 'Welcome')`, [shop.id]);
ok("the admin approves the shop", approved.status === "approved" && approved.reviewed_at);
ok("the owner is told", (await one(`select count(*)::int c from notifications where type = 'kirana_shop' and user_id = $1`, [CUST])).c === 1);
ok("case size must be at least 1", /Case size/.test((await err(`select public.admin_set_wholesale_product($1::uuid, 0)`, [prodA.id])) ?? ""));
ok("max below min is refused", /Maximum/.test((await err(`select public.admin_set_wholesale_product($1::uuid, 12, 2, 1)`, [prodA.id])) ?? ""));
const wA = await fnv(`public.admin_set_wholesale_product($1::uuid, 12, 1, 10, null, true)`, [prodA.id]);
ok("a product can be listed without a price (quote required)", wA.price_per_case === null && wA.case_size === 12);
const wB = await fnv(`public.admin_set_wholesale_product($1::uuid, 6, 2, null, 540, true)`, [prodB.id]);
ok("a product with a case price", Number(wB.price_per_case) === 540 && wB.moq_cases === 2);

console.log("Catalogue");
await as(null);
let cat = await fnv(`public.wholesale_catalogue()`);
ok("the public catalogue lists both products without prices", cat.length === 2 && cat.every((c) => c.price_per_case === null) && cat.find((c) => c.product_id === prodA.id).quote_required === true, JSON.stringify(cat.map((c) => [c.name, c.price_per_case])));
await as(OTHER);
ok("another customer sees no prices either", (await fnv(`public.wholesale_catalogue()`)).every((c) => c.price_per_case === null));
await as(CUST);
cat = await fnv(`public.wholesale_catalogue()`);
const cB = cat.find((c) => c.product_id === prodB.id);
ok("the approved shop sees the wholesale price and stock in cases", Number(cB.price_per_case) === 540 && Number(cB.unit_price) === 90 && cB.in_stock_cases === Math.floor(prodB.stock_qty / 6), JSON.stringify(cB));

console.log("Monthly list");
ok("below MOQ is refused", /Minimum for/.test((await err(`select public.save_wholesale_list(5, $1::jsonb)`, [JSON.stringify([{ product_id: prodB.id, cases: 1 }])])) ?? ""));
ok("above max is refused", /Maximum for/.test((await err(`select public.save_wholesale_list(5, $1::jsonb)`, [JSON.stringify([{ product_id: prodA.id, cases: 11 }])])) ?? ""));
ok("an empty list is refused", /at least one/.test((await err(`select public.save_wholesale_list(5, '[]'::jsonb)`)) ?? ""));
const list = await fnv(`public.save_wholesale_list(5, $1::jsonb, 'Monthly restock')`, [JSON.stringify([{ product_id: prodA.id, cases: 2 }, { product_id: prodB.id, cases: 3 }])]);
ok("the list is saved with the next restock date in the future", list.restock_day === 5 && dstr(list.next_run_date) > dstr(new Date(Date.now() - 86400000)) && list.snapshot.has_unpriced === true && Number(list.snapshot.subtotal) === 1620, JSON.stringify(list));
const me1 = await fnv(`public.my_kirana_shop()`);
ok("the owner's page shows the list items", me1.list.items.length === 2);

console.log("Proposal and review");
const prop = await fnv(`public.propose_wholesale_order()`);
ok("a proposal is raised for the next restock date", prop.status === "proposed" && prop.restock_date === list.next_run_date && prop.has_unpriced === true && prop.items.length === 2, JSON.stringify(prop));
ok("review now is idempotent", (await fnv(`public.propose_wholesale_order()`)).id === prop.id);
ok("it cannot be approved while an item needs a quote", /waiting for a wholesale price/.test((await err(`select public.shop_review_wholesale_order($1::uuid, 'approve')`, [prop.id])) ?? ""));
await as(OTHER);
ok("another customer cannot touch it", /not found/.test((await err(`select public.shop_review_wholesale_order($1::uuid, 'approve')`, [prop.id])) ?? ""));
await as(ADMIN);
ok("an admin cannot place an unapproved proposal", /shop has approved/.test((await err(`select public.admin_confirm_wholesale_order($1::uuid)`, [prop.id])) ?? ""));
await q(`select public.admin_set_wholesale_product($1::uuid, 12, 1, 10, 1800, true)`, [prodA.id]);
await as(CUST);
ok("the shop can drop a line and approve with edited quantities", (await fnv(`public.shop_review_wholesale_order($1::uuid, 'approve', $2::jsonb, 'Deliver before noon')`, [prop.id, JSON.stringify([{ product_id: prodA.id, cases: 1 }, { product_id: prodB.id, cases: 4 }])])).status === "approved");
const appr = await one(`select status, subtotal, has_unpriced, items, approved_at from wholesale_orders where id = $1`, [prop.id]);
ok("the approved order carries today's prices", Number(appr.subtotal) === 1800 + 4 * 540 && appr.has_unpriced === false && appr.approved_at, JSON.stringify(appr.subtotal));
ok("admins are told to confirm", (await one(`select count(*)::int c from notifications where type = 'wholesale_approved' and user_id = $1`, [ADMIN])).c === 1);
ok("a second approval is refused", /already been approved/.test((await err(`select public.shop_review_wholesale_order($1::uuid, 'approve')`, [prop.id])) ?? ""));
ok("no real order exists yet", (await one(`select count(*)::int c from orders where channel = 'wholesale'`)).c === 0);

console.log("Admin places it");
await as(CUST);
ok("a customer cannot place it", /FORBIDDEN/.test((await err(`select public.admin_confirm_wholesale_order($1::uuid)`, [prop.id])) ?? ""));
await as(ADMIN);
const stockA0 = Number((await one(`select stock_qty from inventory where id = $1`, [prodA.inv])).stock_qty);
const stockB0 = Number((await one(`select stock_qty from inventory where id = $1`, [prodB.inv])).stock_qty);
await q(`update settings set value = '50'::jsonb where key = 'wholesale_delivery_fee'`);
const placed = await fnv(`public.admin_confirm_wholesale_order($1::uuid, 'Confirmed on the phone')`, [prop.id]);
const o = await one(`select * from orders where id = $1`, [placed.order_id]);
ok("a real order is created on the wholesale channel", o.channel === "wholesale" && o.kirana_shop_id === shop.id && o.user_id === CUST && o.status === "confirmed" && o.payment_method === "cod", JSON.stringify([o.channel, o.status]));
ok("amounts: subtotal + fee + GST on the fee", Number(o.subtotal) === 3960 && Number(o.delivery_fee) === 50 && Number(o.tax_amount) === 9 && Number(o.total) === 4019 && Number(placed.total) === 4019, JSON.stringify([o.subtotal, o.delivery_fee, o.tax_amount, o.total]));
ok("items are expanded to units at the case price", (await one(`select count(*)::int c, sum(quantity)::int u from order_items where order_id = $1`, [o.id])).u === 12 + 24 && o.item_count === 36);
ok("stock is deducted", Number((await one(`select stock_qty from inventory where id = $1`, [prodA.inv])).stock_qty) === stockA0 - 12 && Number((await one(`select stock_qty from inventory where id = $1`, [prodB.inv])).stock_qty) === stockB0 - 24);
ok("the wholesale order is marked placed", (await one(`select status, order_id from wholesale_orders where id = $1`, [prop.id])).status === "placed");
ok("the list moved to next month", dstr((await one(`select next_run_date from wholesale_lists where id = $1`, [list.id])).next_run_date) > dstr(list.next_run_date));
ok("the shop owner is told with the order number", (await one(`select count(*)::int c from notifications where type = 'order_placed' and user_id = $1 and title like '%' || $2 || '%'`, [CUST, o.order_number])).c === 1);
ok("placing twice is refused", /this one is placed/.test((await err(`select public.admin_confirm_wholesale_order($1::uuid)`, [prop.id])) ?? ""));

console.log("Normal fulfilment delivers it");
await q(`select public.fulfil_order($1::uuid, 'ready')`, [o.id]);
await as(RIDER1); await q(`select public.rider_set_online(true, 26.6480, 74.0325)`);
const off = (await fnv(`public.rider_assignments(array['offered'])`))[0];
ok("a rider is offered the wholesale order", off && (await one(`select order_id from delivery_assignments where id = $1`, [off.id])).order_id === o.id);
await q(`select public.rider_respond_assignment($1::uuid, true)`, [off.id]); await q(`select public.rider_pickup($1::uuid)`, [off.id]);
const otp = (await one(`select delivery_otp from order_secrets where order_id = $1`, [o.id])).delivery_otp;
await q(`select public.verify_delivery_otp($1::uuid, $2, true, false)`, [off.id, otp]);
ok("delivered with OTP like any order", (await one(`select status from orders where id = $1`, [o.id])).status === "delivered");

console.log("Skip, cancel, cron");
await as(CUST);
const prop2 = await fnv(`public.propose_wholesale_order()`);
const skipped = await fnv(`public.shop_review_wholesale_order($1::uuid, 'skip', null, 'Stock left over')`, [prop2.id]);
ok("the shop can skip a month", skipped.status === "declined" && dstr((await one(`select next_run_date from wholesale_lists where id = $1`, [list.id])).next_run_date) > dstr(prop2.restock_date));
const prop3 = await fnv(`public.propose_wholesale_order()`);
await as(ADMIN);
ok("an admin can cancel a proposal", (await fnv(`public.admin_cancel_wholesale_order($1::uuid, 'Out of stock this month')`, [prop3.id])).status === "cancelled");
await q(`update wholesale_lists set next_run_date = current_date + 1 where id = $1`, [list.id]);
const gen = await fnv(`public.generate_wholesale_proposals()`);
ok("the cron raises proposals within the lead time", gen.raised === 1 && (await one(`select count(*)::int c from wholesale_orders where list_id = $1 and status = 'proposed'`, [list.id])).c === 1, JSON.stringify(gen));
ok("the owner is asked to review", (await one(`select count(*)::int c from notifications where type = 'wholesale_review' and user_id = $1`, [CUST])).c >= 1);
ok("running it again raises nothing new", (await fnv(`public.generate_wholesale_proposals()`)).raised === 0);
await q(`update wholesale_orders set restock_date = current_date - 2 where list_id = $1 and status = 'proposed'`, [list.id]);
await q(`update wholesale_lists set next_run_date = current_date - 2 where id = $1`, [list.id]);
const gen2 = await fnv(`public.generate_wholesale_proposals()`);
ok("a proposal nobody approved lapses and the list moves on", gen2.expired === 1 && dstr((await one(`select next_run_date from wholesale_lists where id = $1`, [list.id])).next_run_date) > dstr(new Date()));
const ov = await fnv(`public.admin_wholesale_overview()`);
ok("the admin overview lists the shop, orders and products", ov.shops.length === 1 && ov.orders.length >= 4 && ov.products.length === 2 && ov.counts.pending_shops === 0, JSON.stringify(ov.counts));
await q(`select public.admin_review_kirana_shop($1::uuid, 'suspended', 'Unpaid bill')`, [shop.id]);
await as(CUST);
ok("a suspended shop cannot propose", /approved first/.test((await err(`select public.propose_wholesale_order()`)) ?? ""));
await as(ADMIN);
await q(`select public.admin_remove_wholesale_product($1::uuid)`, [prodA.id]);
ok("removing a wholesale product also drops it from lists", (await one(`select count(*)::int c from wholesale_list_items where product_id = $1`, [prodA.id])).c === 0);

console.log("Access");
ok("wholesale prices are admin-only at the table level", (await one(`select count(*)::int c from pg_policies where tablename = 'wholesale_products'`)).c === 1 && (await one(`select relrowsecurity rs from pg_class where relname = 'kirana_shops'`)).rs === true);
ok("anonymous visitors can read the catalogue but nothing else", (await one(`select has_function_privilege('anon', 'public.wholesale_catalogue()', 'execute') a, has_function_privilege('anon', 'public.register_kirana_shop(text,text,text,text,uuid,text)', 'execute') b`)).a === true && (await one(`select has_function_privilege('anon', 'public.register_kirana_shop(text,text,text,text,uuid,text)', 'execute') b`)).b === false);
ok("internal helpers are not callable by customers", (await one(`select has_function_privilege('authenticated', 'public._wholesale_snapshot(jsonb)', 'execute') p`)).p === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
