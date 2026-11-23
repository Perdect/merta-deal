// UPI on delivery checks (0041): rider records UPI, the amount stays on the rider until an admin confirms it,
// wrong confirmations are refused, not received turns it back into cash, repeat calls are harmless.
// Loads every migration + seed into PGlite. Run from the project folder:
//   node scripts/test-upi.mjs "$PWD"
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

const placeCod = async (inv, n = 2) => { await as(CUST); await q(`select public.clear_cart()`); await q(`select public.add_to_cart($1::uuid, $2)`, [inv, n]); return (await fnv(`public.place_order($1::uuid, 'cod'::public.payment_method, 'standard', null)`, [addr])).order_id; };
async function toDoor(o) {
  await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o]);
  await as(RIDER1); await q(`select public.rider_set_online(true, 26.6480, 74.0325)`);
  const off = (await fnv(`public.rider_assignments(array['offered'])`))[0];
  await q(`select public.rider_respond_assignment($1::uuid, true)`, [off.id]); await q(`select public.rider_pickup($1::uuid)`, [off.id]);
  return { id: off.id, otp: await doorCode(o) };
}
const due = async () => Number((await one(`select (public._rider_cash($1::uuid) ->> 'due') d`, [r1])).d);
const stock2 = await one(`select id, selling_price from inventory where stock_qty > 20 and selling_price between 100 and 400 order by selling_price desc, id limit 1`);
const pub = await fnv(`public.public_settings()`);
ok("UPI details are public and switched on", pub.upi_on_delivery_enabled === true && pub.upi_id === "8875020202@hdfc" && pub.upi_payee_name === "DESHWALI MINERALS", JSON.stringify(pub.upi_id));

console.log("Rider records UPI");
const start = await due();
const o1 = await placeCod(stock2.id); const total1 = Number((await one(`select total from orders where id = $1`, [o1])).total); const d1 = await toDoor(o1);
ok("no payment recorded means no OTP check", (await fnv(`public.verify_delivery_otp($1::uuid, $2)`, [d1.id, d1.otp])).needs_cash === true);
ok("cash and UPI together are refused", (await fnv(`public.verify_delivery_otp($1::uuid, $2, true, true)`, [d1.id, d1.otp])).needs_cash === true);
ok("a wrong OTP does not record UPI", (await fnv(`public.verify_delivery_otp($1::uuid, '0000', false, true)`, [d1.id])).ok === false || d1.otp === "0000");
ok("UPI with the right OTP delivers", (await fnv(`public.verify_delivery_otp($1::uuid, $2, false, true)`, [d1.id, d1.otp])).status === "delivered");
ok("a repeat is harmless", (await fnv(`public.verify_delivery_otp($1::uuid, $2, false, true)`, [d1.id, d1.otp])).already === true);
const k1 = await one(`select collected_mode, upi_verified_at from cod_collections where order_id = $1`, [o1]);
ok("recorded as UPI, not yet confirmed", k1.collected_mode === "upi" && k1.upi_verified_at === null);
ok("unconfirmed UPI stays on the rider's balance", near(await due(), start + total1), String(await due()));
ok("admins are told", (await one(`select count(*)::int c from notifications where type = 'upi_to_confirm'`)).c > 0);

console.log("Confirming");
await as(CUST);
ok("a customer cannot confirm", /FORBIDDEN/.test((await err(`select public.admin_confirm_upi($1::uuid, true, 'REF12345')`, [o1])) ?? ""));
ok("a customer cannot see the list", /FORBIDDEN/.test((await err(`select public.admin_pending_upi()`)) ?? ""));
await as(RIDER1);
ok("a rider cannot confirm", /FORBIDDEN/.test((await err(`select public.admin_confirm_upi($1::uuid, true, 'REF12345')`, [o1])) ?? ""));
await as(ADMIN);
ok("it is listed for the admin", (await fnv(`public.admin_pending_upi()`)).some((p) => p.order_id === o1));
ok("received needs a reference", /reference/.test((await err(`select public.admin_confirm_upi($1::uuid, true, null)`, [o1])) ?? ""));
await q(`select public.admin_confirm_upi($1::uuid, true, 'REF12345')`, [o1]);
ok("confirming clears it from the rider", near(await due(), start), String(await due()));
ok("it leaves the list", !(await fnv(`public.admin_pending_upi()`)).some((p) => p.order_id === o1));
ok("it cannot be confirmed twice", /already confirmed/.test((await err(`select public.admin_confirm_upi($1::uuid, true, 'REF99999')`, [o1])) ?? ""));
ok("the audit log has it", (await one(`select count(*)::int c from audit_logs where action = 'upi.confirm' and entity_id = $1`, [o1])).c === 1);

console.log("Not received, reused reference, cash");
const o2 = await placeCod(stock2.id); const total2 = Number((await one(`select total from orders where id = $1`, [o2])).total); const d2 = await toDoor(o2);
await q(`select public.verify_delivery_otp($1::uuid, $2, false, true)`, [d2.id, d2.otp]);
await as(ADMIN);
ok("a reference can't be used on two orders", /already used/.test((await err(`select public.admin_confirm_upi($1::uuid, true, 'REF12345')`, [o2])) ?? ""));
await q(`select public.admin_confirm_upi($1::uuid, false)`, [o2]);
ok("not received becomes cash the rider owes", near(await due(), start + total2) && (await one(`select collected_mode m from cod_collections where order_id = $1`, [o2])).m === "cash");
ok("nothing left to confirm on it", /no UPI payment/.test((await err(`select public.admin_confirm_upi($1::uuid, true, 'REF55555')`, [o2])) ?? ""));
const o3 = await placeCod(stock2.id); const total3 = Number((await one(`select total from orders where id = $1`, [o3])).total); const d3 = await toDoor(o3);
await q(`select public.verify_delivery_otp($1::uuid, $2, true)`, [d3.id, d3.otp]);
ok("cash works exactly as before", near(await due(), start + total2 + total3) && (await one(`select collected_mode m from cod_collections where order_id = $1`, [o3])).m === "cash");

console.log("Switched off");
await q(`update settings set value = 'false'::jsonb where key = 'upi_on_delivery_enabled'`);
const o4 = await placeCod(stock2.id); const d4 = await toDoor(o4);
ok("when switched off, a rider cannot record UPI", (await fnv(`public.verify_delivery_otp($1::uuid, $2, false, true)`, [d4.id, d4.otp])).needs_cash === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
