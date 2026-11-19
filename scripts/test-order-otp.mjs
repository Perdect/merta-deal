// OTP before an order (0057): with `order_mobile_otp_required` on, an order for a guest profile is refused
// in the database, whatever the app did; a signed-in customer orders as before; off, nothing changes.
// Loads every migration + seed into PGlite. Run from the project folder:
//   node scripts/test-order-otp.mjs "$PWD"
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
// The migration must be safe to run twice (it is applied by hand in production).
await exec("0057 again", read("supabase/migrations/0057_order_mobile_otp.sql"));
console.log(`loaded ${migrations.length} migrations + seed`);

let pass = 0, fail = 0;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); } };
const as = async (uid, role) => { await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]); await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [role ?? (uid ? "authenticated" : "anon")]); };
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
const CUST = "30000000-0000-4000-8000-000000000002";
const GUEST = "30000000-0000-4000-8000-00000000b001", MEMBER = "30000000-0000-4000-8000-00000000b002";

await q(`update settings set value = '{"open":"00:00","close":"23:59"}'::jsonb where key = 'business_hours'`);
await q(`update settings set value = 'true'::jsonb where key in ('business_open', 'auto_accept_orders', 'cod_enabled')`);
const stock = await one(`select id from inventory where stock_qty > 30 and selling_price between 100 and 400 order by selling_price desc, id limit 1`);
const addrRow = await one(`select * from addresses where user_id = $1 order by is_default desc limit 1`, [CUST]);
async function newCustomer(id, name, phone, guest) {
  await q(`insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values ($1, $2, '{}'::jsonb, now(), now()) on conflict (id) do nothing`, [id, `${name.toLowerCase()}@example.test`]);
  await q(`insert into profiles (id, role, full_name, phone, referral_code, is_active) values ($1::uuid, 'customer', $2, $3, upper(substr(md5($4), 1, 8)), true) on conflict (id) do nothing`, [id, name, phone, id]);
  await q(`update profiles set is_guest = $2 where id = $1`, [id, guest]);
  await q(`insert into addresses (user_id, type, full_name, phone, house, street, area, city, state, pincode, lat, lng, is_default, zone_id)
           values ($1, 'home', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12)`,
    [id, name, phone, addrRow.house, addrRow.street, addrRow.area, addrRow.city, addrRow.state, addrRow.pincode, addrRow.lat, addrRow.lng, addrRow.zone_id]);
}
await newCustomer(GUEST, "Guest", "9876502001", true);
await newCustomer(MEMBER, "Meena", "9876502002", false);

const place = async (uid) => {
  await as(uid); await q(`select public.clear_cart()`); await q(`select public.add_to_cart($1::uuid, 2)`, [stock.id]);
  return await err(`select public.place_order((select id from addresses where user_id = $1 and is_default limit 1), 'cod'::public.payment_method, 'standard'::public.delivery_type)`, [uid]);
};
const orders = async (uid) => Number((await one(`select count(*) c from orders where user_id = $1`, [uid])).c);
const reserved = async () => Number((await one(`select reserved_qty from inventory where id = $1`, [stock.id])).reserved_qty);

const row = await one(`select value, is_public, "group" from settings where key = 'order_mobile_otp_required'`);
ok("the setting exists, is public, and starts off", row && row.value === false && row.is_public === true && row.group === "orders", JSON.stringify(row));

let e = await place(GUEST);
ok("off: a guest can order as before", e === null && (await orders(GUEST)) === 1, e ?? "");

await q(`update settings set value = 'true'::jsonb where key = 'order_mobile_otp_required'`);
const heldBefore = await reserved();
e = await place(GUEST);
ok("on: a guest's order is refused", /MOBILE_NOT_VERIFIED/.test(e ?? ""), e ?? "(no error)");
ok("on: no order row is left behind", (await orders(GUEST)) === 1);
ok("on: no stock stays reserved for the refused order", (await reserved()) === heldBefore, `${await reserved()} vs ${heldBefore}`);
ok("on: the guest's cart is still there to finish after the OTP", Number((await one(`select count(*) c from cart_items ci join carts c on c.id = ci.cart_id where c.user_id = $1`, [GUEST])).c) > 0);

e = await place(MEMBER);
ok("on: a signed-in customer orders normally", e === null && (await orders(MEMBER)) === 1, e ?? "");

// The guest confirms the number: the app signs them in to a real account. Here that is the profile no longer being a guest.
await q(`update profiles set is_guest = false where id = $1`, [GUEST]);
e = await place(GUEST);
ok("on: the same person can order once verified", e === null && (await orders(GUEST)) === 2, e ?? "");

await q(`update profiles set is_guest = true where id = $1`, [GUEST]);
// A copy of one of this customer's own order rows, as retail and as wholesale: only the channel differs.
const copy = (channel, number) => err(`insert into orders select (jsonb_populate_record(null::orders, to_jsonb(o) || jsonb_build_object('id', gen_random_uuid(), 'order_number', $2::text, 'channel', $3::text))).* from orders o where o.user_id = $1 limit 1`, [GUEST, number, channel]);
e = await copy("retail", "T-RETAIL-1");
ok("on: a retail order row for a guest is refused however it is inserted", /MOBILE_NOT_VERIFIED/.test(e ?? ""), e ?? "(no error)");
e = await copy("wholesale", "T-WHOLESALE-1");
ok("on: a wholesale order row is not held up by this rule", !/MOBILE_NOT_VERIFIED/.test(e ?? ""), e ?? "");

await q(`update settings set value = 'false'::jsonb where key = 'order_mobile_otp_required'`);
e = await place(GUEST);
ok("off again: a guest can order again", e === null, e ?? "");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
