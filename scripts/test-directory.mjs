// Local directory checks (0040): publish rules, public visibility, listing requests, admin review.
// Loads every migration + seed into PGlite. Run from the project folder:
//   node scripts/test-directory.mjs "$PWD"
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
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); } };
const ADMIN = "10000000-0000-4000-8000-000000000001", CUST = "30000000-0000-4000-8000-000000000002";
async function asRole(role, uid, sql, params) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
  await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [role]);
  await db.exec(`set role ${role}`);
  try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec(`reset role`); }
}
const admin = (sql, p) => asRole("authenticated", ADMIN, sql, p);
const SUBMIT = `select public.submit_business_listing($1, $2, $3, $4, $5) r`;
const submit = (o = {}) => asRole("anon", null, SUBMIT, [o.name ?? "Test Sweets", o.category ?? "bakery", "Owner", o.phone ?? "9876500001", o.address ?? "Sadar Bazaar"]);

console.log("Empty start");
ok("no business is seeded", (await db.query(`select count(*)::int c from public.local_businesses`)).rows[0].c === 0);

console.log("Listing requests");
ok("a visitor can send a request", (await submit()).rows?.[0]?.r?.received === true);
ok("a request publishes nothing", (await db.query(`select count(*)::int c from public.local_businesses`)).rows[0].c === 0);
ok("a bad number is refused", /10-digit/.test((await submit({ phone: "123" })).error ?? ""));
ok("a bad category is refused", /hotel, restaurant or bakery/.test((await submit({ category: "casino" })).error ?? ""));
await submit({ phone: "9876500002" }); await submit({ phone: "9876500002" }); await submit({ phone: "9876500002" });
ok("one phone cannot flood the queue", /already have your request/.test((await submit({ phone: "9876500002" })).error ?? ""));
ok("visitors cannot read requests", /permission denied/.test((await asRole("anon", null, `select * from public.business_listing_requests`)).error ?? ""));
ok("customers see no owner details", (await asRole("authenticated", CUST, `select * from public.business_listing_requests`)).rows?.length === 0);
const req = (await admin(`select id from public.business_listing_requests order by created_at limit 1`)).rows[0].id;
ok("a customer cannot review", /FORBIDDEN/.test((await asRole("authenticated", CUST, `select public.admin_review_listing($1::uuid, true)`, [req])).error ?? ""));
ok("a visitor cannot review", /permission denied/.test((await asRole("anon", null, `select public.admin_review_listing($1::uuid, true)`, [req])).error ?? ""));
const bid = (await admin(`select public.admin_review_listing($1::uuid, true, 'called') r`, [req])).rows?.[0]?.r;
const made = (await db.query(`select * from public.local_businesses where id = $1`, [bid])).rows[0];
ok("approval makes a draft, never a public page", made?.status === "draft" && made.slug === "test-sweets", JSON.stringify(made?.status));
ok("a request can't be reviewed twice", /already been reviewed/.test((await admin(`select public.admin_review_listing($1::uuid, true)`, [req])).error ?? ""));

console.log("Publish rules");
const publish = () => admin(`update public.local_businesses set status = 'published' where id = $1`, [bid]);
const firstTry = (await publish()).error ?? "";
ok("an incomplete profile can't be published, and says why", /BUSINESS_INCOMPLETE: Still needed: description.*contact check/.test(firstTry), firstTry);
await admin(`update public.local_businesses set description = $2, contact_verified_at = null where id = $1`, [bid, "A family bakery in Sadar Bazaar selling cakes and baked goods."]);
ok("an unverified contact blocks publishing", /BUSINESS_INCOMPLETE.*contact check/.test((await publish()).error ?? ""));
await admin(`update public.local_businesses set contact_verified_at = now(), accepts_delivery = true where id = $1`, [bid]);
ok("delivery needs coverage, charge and time", /BUSINESS_INCOMPLETE.*delivery coverage/.test((await publish()).error ?? ""));
await admin(`update public.local_businesses set delivery_coverage = 'Merta City', delivery_charge = '₹30', delivery_eta = '45 minutes' where id = $1`, [bid]);
ok("a complete profile publishes", !(await publish()).error);
ok("only hotels can offer rooms", /rooms_only_hotels/.test((await admin(`update public.local_businesses set offers_rooms = true where id = $1`, [bid])).error ?? ""));

console.log("Visibility");
await admin(`insert into public.business_menu_items (business_id, name, price) values ($1, 'Plain cake', 300)`, [bid]);
ok("visitors see a published profile", (await asRole("anon", null, `select name from public.local_businesses`)).rows?.length === 1);
ok("visitors see its menu", (await asRole("anon", null, `select name from public.business_menu_items`)).rows?.length === 1);
ok("a visitor cannot edit a profile", /permission denied/.test((await asRole("anon", null, `update public.local_businesses set name = 'x'`)).error ?? ""));
const cust = await asRole("authenticated", CUST, `update public.local_businesses set name = 'x' returning id`);
ok("a customer cannot edit a profile", cust.rows?.length === 0, JSON.stringify(cust));
ok("a customer cannot add menu items", /row-level security/.test((await asRole("authenticated", CUST, `insert into public.business_menu_items (business_id, name) values ($1, 'x')`, [bid])).error ?? ""));
await admin(`update public.local_businesses set status = 'draft' where id = $1`, [bid]);
ok("a draft is hidden", (await asRole("anon", null, `select id from public.local_businesses`)).rows?.length === 0);
ok("a draft's menu is hidden", (await asRole("anon", null, `select id from public.business_menu_items`)).rows?.length === 0);
await publish();
const other = (await admin(`insert into public.local_businesses (slug, category, name) values ('dup-one', 'bakery', 'Dup') returning id`)).rows[0].id;
ok("a duplicate can't be published", /BUSINESS_INCOMPLETE.*not a duplicate/.test((await admin(`update public.local_businesses set duplicate_of = $2, status = 'published', description = repeat('x', 50), address_line = 'x', phone = '9', contact_verified_at = now() where id = $1`, [other, bid])).error ?? ""));
ok("the page address must be clean", /check/.test((await admin(`insert into public.local_businesses (slug, category, name) values ('Bad Slug!', 'hotel', 'x')`)).error ?? ""));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
