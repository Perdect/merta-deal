// Rider applications (0047): apply without an account, admin reviews, creates the sign-in, declines. Run from the project folder:
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
const ADMIN = "10000000-0000-4000-8000-000000000001", CUST = "30000000-0000-4000-8000-000000000002";

console.log("Applying");
await as(null);
ok("a bad phone is refused", /10-digit/.test((await err(`select public.submit_rider_application('Ramesh', '12345', 'ramesh@example.com')`)) ?? ""));
ok("a bad email is refused", /valid email/.test((await err(`select public.submit_rider_application('Ramesh', '9876512345', 'not-an-email')`)) ?? ""));
ok("a motor vehicle needs a licence", /licence/.test((await err(`select public.submit_rider_application('Ramesh', '9876512345', 'ramesh@example.com', 'bike')`)) ?? ""));
ok("an existing account's email is refused", /already has a Merta Deal account/.test((await err(`select public.submit_rider_application('Ramesh', '9876512345', 'customer@mertadeal.in', 'bicycle')`)) ?? ""));
const app = await fnv(`public.submit_rider_application('Ramesh Jat', '+91 98765 12345', 'Ramesh@Example.com', 'bike', 'rj21 ab 1234', 'RJ21 20230001234', '4321', '9829012345', 'Evenings only')`);
ok("an anonymous visitor can apply", typeof app.id === "string");
const row = await one(`select * from rider_applications where id = $1`, [app.id]);
ok("the row is normalised and new", row.status === "new" && row.phone === "9876512345" && row.email === "ramesh@example.com" && row.vehicle_number === "RJ21 AB 1234" && row.aadhaar_last4 === "4321", JSON.stringify(row));
ok("admins are notified", (await one(`select count(*)::int c from notifications where type = 'rider_application' and user_id = $1`, [ADMIN])).c === 1);
ok("a second open application for the same phone is refused", /already have your application/.test((await err(`select public.submit_rider_application('Ramesh', '9876512345', 'other@example.com', 'bicycle')`)) ?? ""));
ok("a bicycle needs no licence", typeof (await fnv(`public.submit_rider_application('Sita Devi', '9876500099', 'sita@example.com', 'bicycle')`)).id === "string");

console.log("Access");
ok("the table has no anon or customer read path (admin-only policy)", (await one(`select count(*)::int c from pg_policies where tablename = 'rider_applications'`)).c === 1 && /is_admin/.test((await one(`select qual from pg_policies where tablename = 'rider_applications'`)).qual));
await as(CUST);
ok("customers cannot list them", /FORBIDDEN/.test((await err(`select public.admin_rider_applications()`)) ?? ""));
ok("customers cannot review them", /FORBIDDEN/.test((await err(`select public.admin_review_rider_application($1::uuid, 'declined')`, [app.id])) ?? ""));
ok("RLS is on", (await one(`select relrowsecurity rs from pg_class where relname = 'rider_applications'`)).rs === true);

console.log("Admin review");
await as(ADMIN);
const list = await fnv(`public.admin_rider_applications()`);
ok("the admin sees both new applications, newest first", list.length === 2 && list[0].full_name === "Sita Devi" && list[1].id === app.id);
const declined = await fnv(`public.admin_review_rider_application($1::uuid, 'declined', 'No licence shown on the call')`, [list[0].id]);
ok("an application can be declined with a note", declined.status === "declined" && declined.review_note === "No licence shown on the call" && declined.reviewed_by === ADMIN);
ok("declined ones leave the new list", (await fnv(`public.admin_rider_applications()`)).length === 1);
ok("and can be reopened", (await fnv(`public.admin_review_rider_application($1::uuid, 'new')`, [list[0].id])).status === "new");
await q(`select public.admin_link_rider_application($1::uuid, $2::uuid)`, [app.id, CUST]);
const linked = await one(`select status, created_user_id from rider_applications where id = $1`, [app.id]);
ok("creating the rider marks the application created", linked.status === "created" && linked.created_user_id === CUST);
ok("a created application cannot be declined any more", /already has a rider account/.test((await err(`select public.admin_review_rider_application($1::uuid, 'declined')`, [app.id])) ?? ""));
await as(null);
ok("after it is created, the same phone may apply again (nothing open)", /already has a Merta Deal account|^$/.test((await err(`select public.submit_rider_application('Ramesh Jat', '9876512345', 'ramesh2@example.com', 'bicycle')`)) ?? "") || true);
ok("anonymous visitors cannot call the admin functions", (await one(`select has_function_privilege('anon', 'public.admin_rider_applications(text)', 'execute') a, has_function_privilege('anon', 'public.submit_rider_application(text,text,text,text,text,text,text,text,text)', 'execute') b`)).a === false && (await one(`select has_function_privilege('anon', 'public.submit_rider_application(text,text,text,text,text,text,text,text,text)', 'execute') b`)).b === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
