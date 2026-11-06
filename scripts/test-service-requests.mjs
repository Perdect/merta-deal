// Service request checks (0039): who can submit and read, validation, repeat limits, admin notice, admin updates.
// Loads every migration + seed into PGlite. Run from the project folder:
//   node scripts/test-service-requests.mjs "$PWD"
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
/** Runs one statement as a database role with the matching JWT claims; returns rows or the error text. */
async function asRole(role, uid, sql, params) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
  await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [role]);
  await db.exec(`set role ${role}`);
  try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec(`reset role`); }
}
const SUBMIT = `select public.submit_service_request(p_kind => $1, p_name => $2, p_phone => $3, p_item_type => $4, p_drop => $5, p_pickup => $6, p_quantity => $7, p_preferred_at => $8::timestamptz, p_urgency => $9) r`;
const submit = (o = {}) => asRole("anon", null, SUBMIT, [o.kind ?? "pickup_drop", o.name ?? "Asha", o.phone ?? "9876500001", o.item ?? "Documents", o.drop ?? "Station Road", "pickup" in o ? o.pickup : "Gandhi Chowk", o.quantity ?? null, o.at ?? null, o.urgency ?? "asap"]);
const rejects = async (name, o, re) => { const r = await submit(o); ok(name, re.test(r.error ?? ""), JSON.stringify(r)); };

console.log("Public submission");
const first = await submit();
ok("a visitor can submit a pickup and drop request", /^SR-\d{5}$/.test(first.rows?.[0]?.r?.request_number ?? ""), JSON.stringify(first));
ok("a gift order needs no pickup", /^SR-/.test((await submit({ kind: "gift_order", phone: "9876500002", pickup: null, item: "Birthday gift" })).rows?.[0]?.r?.request_number ?? ""));
await rejects("pickup and drop needs a pickup location", { pickup: null, phone: "9876500003" }, /pickup location/);
await rejects("bulk needs a quantity", { kind: "bulk_quote", phone: "9876500003", urgency: "scheduled", at: new Date(Date.now() + 864e5).toISOString() }, /how many/);
await rejects("a scheduled request needs a time", { urgency: "scheduled", phone: "9876500003" }, /date and time/);
await rejects("a past time is refused", { urgency: "scheduled", phone: "9876500003", at: "2020-01-01T00:00:00Z" }, /already passed/);
await rejects("a bad mobile number is refused", { phone: "12345" }, /10-digit/);
await rejects("an unknown kind is refused", { kind: "free_money" }, /Choose what you need/);
await rejects("an empty name is refused", { name: " " }, /your name/);

console.log("Repeat limits");
for (let i = 0; i < 4; i++) await submit({ phone: "9876500009" });
ok("up to the limit is accepted", /^SR-/.test((await submit({ phone: "9876500009" })).rows?.[0]?.r?.request_number ?? ""));
await rejects("one phone cannot exceed the hourly limit", { phone: "9876500009" }, /already have your request/);
await db.query(`update public.settings set value = '1'::jsonb where key = 'service_request_global_hourly_limit'`);
await rejects("the ceiling for all visitors holds", { phone: "9876500010" }, /already have your request/);
await db.query(`update public.settings set value = '60'::jsonb where key = 'service_request_global_hourly_limit'`);

console.log("Privacy");
ok("a visitor cannot read requests", /permission denied/.test((await asRole("anon", null, `select * from public.service_requests`)).error ?? ""));
ok("a customer sees none", (await asRole("authenticated", CUST, `select * from public.service_requests`)).rows?.length === 0);
ok("a customer cannot insert directly", /permission denied/.test((await asRole("authenticated", CUST, `insert into public.service_requests (kind, customer_name, customer_phone, item_type, drop_location) values ('gift_order', 'x', '9876500011', 'x', 'x')`)).error ?? ""));
ok("a customer cannot update directly", /permission denied/.test((await asRole("authenticated", CUST, `update public.service_requests set status = 'completed'`)).error ?? ""));
const seen = await asRole("authenticated", ADMIN, `select id, status from public.service_requests order by created_at limit 1`);
ok("an admin can read them", seen.rows?.length === 1, JSON.stringify(seen));
const pub = await asRole("anon", null, `select public.public_settings() r`);
ok("the limits stay private, the page facts are public", pub.rows && !("service_request_hourly_limit" in pub.rows[0].r) && "pickup_drop_min_charge" in pub.rows[0].r && "fssai_license_no" in pub.rows[0].r, JSON.stringify(Object.keys(pub.rows?.[0]?.r ?? {})));

console.log("Admin");
const n = (await db.query(`select count(*)::int c from public.notifications where type = 'service_request'`)).rows[0].c;
const admins = (await db.query(`select count(*)::int c from public.profiles where role in ('admin','super_admin') and is_active`)).rows[0].c;
ok("admins are told, and the notice has no phone number", n > 0 && n % admins === 0 && !(await db.query(`select body from public.notifications where type = 'service_request'`)).rows.some((r) => /98765/.test(r.body)), `${n}/${admins}`);
const id = seen.rows[0].id;
const UPD = `select public.admin_update_service_request($1::uuid, $2, $3::numeric, $4)`;
ok("a customer cannot update through the function", /FORBIDDEN/.test((await asRole("authenticated", CUST, UPD, [id, "confirmed", 50, "x"])).error ?? ""));
ok("a visitor has no access to it", /permission denied/.test((await asRole("anon", null, UPD, [id, "confirmed", 50, "x"])).error ?? ""));
ok("an admin updates status, charge and note", !(await asRole("authenticated", ADMIN, UPD, [id, "confirmed", 50, "Rider Suresh"])).error);
const row = (await db.query(`select status, quoted_charge, admin_note, handled_by from public.service_requests where id = $1`, [id])).rows[0];
ok("the update and handler are recorded", row.status === "confirmed" && Number(row.quoted_charge) === 50 && row.admin_note === "Rider Suresh" && row.handled_by === ADMIN, JSON.stringify(row));
ok("a negative charge is refused", /negative/.test((await asRole("authenticated", ADMIN, UPD, [id, "confirmed", -1, null])).error ?? ""));
ok("a bad status is refused", /valid status/.test((await asRole("authenticated", ADMIN, UPD, [id, "paid", 1, null])).error ?? ""));
ok("the change is in the audit log", (await db.query(`select 1 from public.audit_logs where action = 'service_request.update' and entity_id = $1`, [id])).rows.length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
