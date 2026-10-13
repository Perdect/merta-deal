// Security, rider-flow, product-save and search-visibility checks (0023–0025). Loads every migration + seed into PGlite.
// Run from a folder with @electric-sql/pglite installed:
//   node scripts/test-security.mjs "$PWD"
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
for (const f of migrations) {
  const sql = read(`supabase/migrations/${f}`).replace(/create extension if not exists "(pgcrypto|unaccent)"[^;]*;/g, "");
  await exec(f, sql);
}
await exec("seed", read("supabase/seed.sql"));
// Production order: data already exists when 0019 runs, so apply it again after the seed.
await exec("0019 after seed", read("supabase/migrations/0019_cart_limits.sql"));
// …and the later migrations that redefine 0019 functions, so the final state matches production.
await exec("0024 after 0019", read("supabase/migrations/0024_product_save_keeps_stock.sql"));
console.log(`loaded ${migrations.length} migrations + seed`);

let pass = 0, fail = 0;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); } };
const as = async (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
// Run a query as the 'authenticated' DB role so RLS applies (the harness user is a superuser).
const rls = async (uid, sql, params) => { await as(uid); await db.exec(`set role authenticated`); try { return (await db.query(sql, params)).rows; } finally { await db.exec(`reset role`); } };
const CUST = '30000000-0000-4000-8000-000000000002', STORE_OWNER = '20000000-0000-4000-8000-000000000001', ADMIN = '10000000-0000-4000-8000-000000000001', STORE = 'd0000000-0000-4000-8000-000000000001';
const newUser = async (meta, anon = false) => (await one(`insert into auth.users (id, phone, raw_user_meta_data, is_anonymous) values (gen_random_uuid(), null, $1::jsonb, $2) returning id`, [JSON.stringify(meta), anon])).id;

console.log("Sign-up can never grant a staff role");
for (const role of ['admin', 'super_admin', 'rider', 'store_owner', 'store_staff']) {
  const u = await newUser({ full_name: 'Probe', role });
  const p = await one(`select role from profiles where id = $1`, [u]);
  ok(`metadata role '${role}' → customer`, p.role === 'customer', JSON.stringify(p));
}
const u0 = await newUser({ role: 'rider' });
ok("no rider row auto-created from metadata", (await one(`select count(*)::int n from delivery_partners where user_id = $1`, [u0])).n === 0);

console.log("Customers cannot raise their own privileges");
const cust2 = await newUser({ full_name: 'Customer Two' });
await as(cust2);
await q(`update profiles set role = 'admin', wallet_balance = 9999, is_active = true where id = $1`, [cust2]);
ok("profile role update ignored", (await one(`select role, wallet_balance from profiles where id = $1`, [cust2])).role === 'customer');
const ghost = await one(`insert into auth.users (id, raw_user_meta_data) values (gen_random_uuid(), '{}') returning id`);
await q(`delete from profiles where id = $1`, [ghost.id]);
await as(ghost.id);
await q(`insert into profiles (id, role, full_name, wallet_balance) values ($1, 'super_admin', 'x', 500)`, [ghost.id]);
const g = await one(`select role, wallet_balance from profiles where id = $1`, [ghost.id]);
ok("self-inserted profile forced to customer", g.role === 'customer' && Number(g.wallet_balance) === 0, JSON.stringify(g));

console.log("Rider application → admin approval");
await as(cust2);
await q(`insert into delivery_partners (user_id, vehicle_type, status, is_online, total_earnings, rating_avg) values ($1, 'bike', 'active', true, 5000, 5)`, [cust2]);
const app = await one(`select id, status, is_online, total_earnings, rating_avg from delivery_partners where user_id = $1`, [cust2]);
ok("self-inserted rider row forced to pending/offline/zero", app.status === 'pending' && app.is_online === false && Number(app.total_earnings) === 0 && Number(app.rating_avg) === 0, JSON.stringify(app));
ok("applicant keeps the customer role", (await one(`select role from profiles where id = $1`, [cust2])).role === 'customer');
ok("admins notified of the application", (await one(`select count(*)::int n from notifications where type = 'rider_registered' and data->>'rider_id' = $1`, [app.id])).n >= 1);
await q(`update delivery_partners set status = 'active' where id = $1`, [app.id]);
ok("applicant cannot approve themselves", (await one(`select status from delivery_partners where id = $1`, [app.id])).status === 'pending');
ok("pending applicant cannot go online", /./.test(await err(`select public.rider_set_online(true, 26.65, 74.03)`) ?? ""));
const someoneElse = await newUser({ full_name: 'Victim' });
await q(`insert into delivery_partners (user_id, vehicle_type) values ($1, 'bike')`, [someoneElse]).catch(() => {});
ok("cannot file an application for another user", (await one(`select count(*)::int n from delivery_partners where user_id = $1`, [someoneElse])).n === 0);
const guest = await newUser({}, true);
await as(guest);
ok("guest (anonymous) session cannot apply", /ACCOUNT_REQUIRED/.test(await err(`insert into delivery_partners (user_id, vehicle_type) values ($1, 'bike')`, [guest]) ?? ""));
await as(ADMIN);
await q(`update delivery_partners set status = 'active' where id = $1`, [app.id]);
ok("admin approval grants the rider role", (await one(`select role from profiles where id = $1`, [cust2])).role === 'rider');

console.log("Deactivated admin loses access");
const admin2 = await newUser({ full_name: 'Admin Two' });
await as(ADMIN); await q(`update profiles set role = 'admin' where id = $1`, [admin2]);
await as(admin2); ok("active admin passes is_admin()", (await one(`select public.is_admin() a`)).a === true);
await as(ADMIN); await q(`update profiles set is_active = false where id = $1`, [admin2]);
await as(admin2); ok("deactivated admin fails is_admin()", (await one(`select public.is_admin() a`)).a === false);
ok("deactivated admin cannot run admin RPCs", /FORBIDDEN/.test(await err(`select public.admin_rider_balances()`) ?? ""));

console.log("Rider privacy and isolation");
await as(CUST); await q(`select public.clear_cart()`);
const inv = (await one(`select i.id from inventory i where i.store_id = $1 and i.is_active and i.stock_qty > 20 and i.selling_price > 100 limit 1`, [STORE])).id;
await q(`select public.add_to_cart($1::uuid, 2)`, [inv]);
const addr = (await one(`select id from addresses where user_id = $1 limit 1`, [CUST])).id;
const order = (await one(`select public.place_order($1::uuid, 'cod', 'standard', null) as r`, [addr])).r.order_id;
await as(STORE_OWNER);
for (const step of ['accept', 'preparing']) await q(`select public.store_update_order($1::uuid, $2)`, [order, step]);
const asg = (await one(`select public.store_update_order($1::uuid, 'ready') as r`, [order])).r.assignment_id;
const riderUser = (await one(`select dp.user_id from delivery_assignments a join delivery_partners dp on dp.id = a.rider_id where a.id = $1`, [asg])).user_id;
const otherRider = (await one(`select user_id from delivery_partners where status = 'active' and user_id <> $1 limit 1`, [riderUser])).user_id;

await as(riderUser);
const offered = (await one(`select public.rider_assignments(array['offered']) r`)).r.find((x) => x.id === asg);
ok("offer shows the area", Boolean(offered?.order.address.area), JSON.stringify(offered?.order.address));
ok("offer hides name, phone, house and instructions", offered && !offered.order.address.phone && !offered.order.address.full_name && !offered.order.address.house && offered.order.delivery_instructions == null);
ok("offer drop point rounded to ~100 m", offered && Math.abs(offered.drop_lat * 1000 - Math.round(offered.drop_lat * 1000)) < 1e-6);
ok("offered rider cannot read the order row", (await rls(riderUser, `select id from orders where id = $1`, [order])).length === 0);
ok("other rider cannot respond to this offer", /./.test((await as(otherRider), await err(`select public.rider_respond_assignment($1::uuid, true)`, [asg])) ?? ""));
await as(riderUser);
await q(`select public.rider_respond_assignment($1::uuid, true)`, [asg]);
const accepted = (await one(`select public.rider_assignments(array['accepted']) r`)).r.find((x) => x.id === asg);
ok("accepted delivery shows full address and phone", Boolean(accepted?.order.address.phone && accepted?.order.address.house), JSON.stringify(accepted?.order.address));
ok("assigned rider can read the order row", (await rls(riderUser, `select id from orders where id = $1`, [order])).length === 1);
ok("assigned rider can read the items", (await rls(riderUser, `select id from order_items where order_id = $1`, [order])).length >= 1);
ok("other rider cannot read the order row", (await rls(otherRider, `select id from orders where id = $1`, [order])).length === 0);
ok("other rider cannot read the assignment", (await rls(otherRider, `select id from delivery_assignments where id = $1`, [asg])).length === 0);
ok("other rider cannot read the customer's addresses", (await rls(otherRider, `select id from addresses where user_id = $1`, [CUST])).length === 0);
ok("other rider cannot pick up", /./.test((await as(otherRider), await err(`select public.rider_pickup($1::uuid)`, [asg])) ?? ""));
await as(riderUser); await q(`select public.rider_pickup($1::uuid)`, [asg]);
const otp = (await one(`select delivery_otp from order_secrets where order_id = $1`, [order])).delivery_otp;
ok("rider cannot read the OTP table", (await rls(riderUser, `select delivery_otp from order_secrets where order_id = $1`, [order])).length === 0);
ok("other rider cannot complete with the right OTP", /./.test((await as(otherRider), await err(`select public.verify_delivery_otp($1::uuid, $2, true)`, [asg, otp])) ?? "") );
await as(riderUser);
ok("COD needs cash confirmation", (await one(`select public.verify_delivery_otp($1::uuid, $2, false) r`, [asg, otp])).r.ok === false);
const done = (await one(`select public.verify_delivery_otp($1::uuid, $2, true) r`, [asg, otp])).r;
ok("delivery completes with OTP + cash", done.ok === true, JSON.stringify(done));
const again = await err(`select public.verify_delivery_otp($1::uuid, $2, true)`, [asg, otp]);
const againR = again ? null : (await one(`select public.verify_delivery_otp($1::uuid, $2, true) r`, [asg, otp])).r;
ok("repeat completion is rejected or a no-op", again !== null || againR?.ok === false || againR?.already === true, again ?? JSON.stringify(againR));
ok("exactly one earning row", (await one(`select count(*)::int n from rider_earnings where assignment_id = $1`, [asg])).n === 1);
const st = await one(`select o.status, p.status pay, a.status asg from orders o join payments p on p.order_id = o.id join delivery_assignments a on a.order_id = o.id where o.id = $1 and a.id = $2`, [order, asg]);
ok("order/payment/assignment consistent: delivered / cod_collected / delivered", st.status === 'delivered' && st.pay === 'cod_collected' && st.asg === 'delivered', JSON.stringify(st));
await as(CUST);
ok("customer tracking shows delivered", (await one(`select public.order_tracking($1::uuid) r`, [order])).r.order?.status === 'delivered' || (await one(`select public.order_tracking($1::uuid) r`, [order])).r.status === 'delivered');
const hist = (await (as(riderUser), one(`select public.rider_assignments(array['delivered']) r`))).r.find((x) => x.id === asg);
ok("history keeps area but drops phone", hist && hist.order.address.area && !hist.order.address.phone, JSON.stringify(hist?.order.address));
ok("after delivery the rider can no longer read the order row", (await rls(riderUser, `select id from orders where id = $1`, [order])).length === 0);

console.log("Customer isolation");
ok("customer sees own orders only", (await rls(cust2, `select id from orders where id = $1`, [order])).length === 0);
ok("customer cannot read others' addresses", (await rls(cust2, `select id from addresses where user_id = $1`, [CUST])).length === 0);
ok("customer cannot update an order directly", (await (async () => { await rls(cust2, `update orders set status = 'cancelled' where id = $1`, [order]); return (await one(`select status from orders where id = $1`, [order])).status === 'delivered'; })()));
ok("customer cannot run admin RPCs", /FORBIDDEN/.test((await as(CUST), await err(`select public.admin_rider_balances()`)) ?? ""));

console.log("Internal helpers are not callable from outside");
const asRole = async (role, uid, sql, params) => { await as(uid ?? ''); await db.exec(`set role ${role}`); try { await db.query(sql, params); return null; } catch (e) { return e.message; } finally { await db.exec(`reset role`); } };
ok("visitor (anon) cannot call notify_user", /permission denied/.test(await asRole('anon', null, `select public.notify_user($1::uuid, 'x', 'Pay now', 'phish')`, [CUST]) ?? ""));
ok("customer cannot call notify_user", /permission denied/.test(await asRole('authenticated', cust2, `select public.notify_user($1::uuid, 'x', 'Pay now', 'phish')`, [CUST]) ?? ""));
ok("customer cannot call notify_store", /permission denied/.test(await asRole('authenticated', cust2, `select public.notify_store($1::uuid, 'x', 't', 'b')`, [STORE]) ?? ""));
ok("customer cannot write audit rows", /permission denied/.test(await asRole('authenticated', cust2, `select public.audit('x', 'y', 'z')`) ?? ""));
ok("customer cannot use admin_notify_user", /FORBIDDEN/.test(await asRole('authenticated', CUST, `select public.admin_notify_user($1::uuid, 'x', 't', 'b')`, [cust2]) ?? ""));
ok("admin can use admin_notify_user", (await asRole('authenticated', ADMIN, `select public.admin_notify_user($1::uuid, 'test', 'Hello', 'From admin')`, [cust2])) === null);
ok("admin can use admin_audit", (await asRole('authenticated', ADMIN, `select public.admin_audit('test.action', 'test', '1')`)) === null);
ok("internal callers still notify (place_order path)", (await one(`select count(*)::int n from notifications where data->>'order_id' = $1`, [order])).n >= 1);

console.log("Store payout details: owner only");
const staffUser = await newUser({ full_name: 'Store Staff' });
await q(`insert into store_staff (store_id, user_id, is_active) values ($1, $2, true)`, [STORE, staffUser]).catch((e) => console.log("    (staff insert: " + e.message + ")"));
const before = await one(`select bank_account_number, upi_id from stores where id = $1`, [STORE]);
await as(staffUser); await q(`update stores set bank_account_number = '999999999', upi_id = 'thief@upi', tagline = 'staff edit' where id = $1`, [STORE]);
const after = await one(`select bank_account_number, upi_id, tagline from stores where id = $1`, [STORE]);
ok("staff cannot change bank account / UPI", after.bank_account_number === before.bank_account_number && after.upi_id === before.upi_id, JSON.stringify(after));
await as(STORE_OWNER); await q(`update stores set upi_id = 'owner.new@upi' where id = $1`, [STORE]);
ok("owner can change UPI", (await one(`select upi_id from stores where id = $1`, [STORE])).upi_id === 'owner.new@upi');

console.log("Rejection, reassignment and a failed handover");
const mkReady = async () => {
  await as(CUST); await q(`select public.clear_cart()`);
  await q(`select public.add_to_cart($1::uuid, 1)`, [inv]);
  const o = (await one(`select public.place_order($1::uuid, 'cod', 'standard', null) as r`, [addr])).r.order_id;
  await as(STORE_OWNER);
  for (const step of ['accept', 'preparing']) await q(`select public.store_update_order($1::uuid, $2)`, [o, step]);
  const a = (await one(`select public.store_update_order($1::uuid, 'ready') as r`, [o])).r.assignment_id;
  return { o, a };
};
const R1 = await mkReady();
const r1User = (await one(`select dp.user_id from delivery_assignments a join delivery_partners dp on dp.id = a.rider_id where a.id = $1`, [R1.a])).user_id;
await as(r1User);
const rej = (await one(`select public.rider_respond_assignment($1::uuid, false) r`, [R1.a])).r;
ok("rider can reject an offer", rej.ok === true && rej.status === 'rejected', JSON.stringify(rej));
const next = await one(`select a.id, dp.user_id from delivery_assignments a join delivery_partners dp on dp.id = a.rider_id where a.order_id = $1 and a.status = 'offered'`, [R1.o]);
ok("order re-offered to a different rider", next && next.user_id !== r1User, JSON.stringify(next));
ok("rejecting rider can no longer act on it", /INVALID_STATE/.test(await err(`select public.rider_respond_assignment($1::uuid, true)`, [R1.a]) ?? ""));
await as(next.user_id); await q(`select public.rider_respond_assignment($1::uuid, true)`, [next.id]); await q(`select public.rider_pickup($1::uuid)`, [next.id]);
console.log("    (customer unreachable → no rider-side 'failed delivery' action exists; support cancels)");
await as(ADMIN);
const canc = await err(`select public.cancel_order($1::uuid, 'Customer not reachable at the door (test)')`, [R1.o]);
const after2 = await one(`select o.status, (select status from delivery_assignments where id = $2) asg, (select status from payments where order_id = o.id) pay from orders o where o.id = $1`, [R1.o, next.id]);
ok("admin can cancel an out-for-delivery order", canc === null && after2.status === 'cancelled', canc ?? JSON.stringify(after2));
ok("the rider's assignment is closed (rider freed)", after2.asg === 'cancelled', JSON.stringify(after2));
ok("no earning for a cancelled handover", (await one(`select count(*)::int n from rider_earnings where assignment_id = $1`, [next.id])).n === 0);
await as(next.user_id);
ok("rider cannot complete a cancelled order", /./.test(await err(`select public.verify_delivery_otp($1::uuid, '0000', true)`, [next.id]) ?? (await one(`select (public.verify_delivery_otp($1::uuid, '0000', true)->>'ok') r`, [next.id])).r === 'false' ? 'x' : ''));

console.log("Product form saves (0024): stock and visibility are never clobbered");
await as(STORE_OWNER);
const cat = (await one(`select id from categories where parent_id is not null limit 1`)).id;
const up = (args) => one(`select public.upsert_store_product($1::uuid, $2, $3::uuid, '', 500, 'g', '500 g', $4, $5, $6, 5, null, null, false, true, $7::uuid, 5, $8) r`, [STORE, args.name ?? 'Regression Test Dal', cat, args.mrp ?? 100, args.sp ?? 90, args.stock, args.pid ?? null, args.active ?? null]).then((x) => x.r);
const created = await up({ stock: 20 });
let pinv = await one(`select stock_qty, is_active from inventory where id = $1`, [created.inventory_id]);
ok("new listing: opening stock 20, visible by default", pinv.stock_qty === 20 && pinv.is_active === true, JSON.stringify(pinv));
await q(`select public.adjust_stock($1::uuid, -3, 'order', 'sold while form open')`, [created.inventory_id]);
await up({ pid: created.product_id, stock: null, sp: 85 });
pinv = await one(`select stock_qty, selling_price from inventory where id = $1`, [created.inventory_id]);
ok("edit save with no stock keeps the live count (17, not the stale 20)", pinv.stock_qty === 17 && Number(pinv.selling_price) === 85, JSON.stringify(pinv));
await q(`update inventory set is_active = false where id = $1`, [created.inventory_id]);
await up({ pid: created.product_id, stock: null, sp: 80 });
ok("editing a hidden product keeps it hidden", (await one(`select is_active from inventory where id = $1`, [created.inventory_id])).is_active === false);
await up({ pid: created.product_id, stock: null, active: true });
ok("form can switch visibility on explicitly", (await one(`select is_active from inventory where id = $1`, [created.inventory_id])).is_active === true);
const hiddenNew = await up({ name: 'Regression Hidden Item', stock: 5, active: false });
ok("new listing can start hidden", (await one(`select is_active from inventory where id = $1`, [hiddenNew.inventory_id])).is_active === false);
ok("negative stock rejected", /INVALID_STOCK/.test(await err(`select public.upsert_store_product($1::uuid, 'Neg', $2::uuid, '', 1, 'g', '1 g', 10, 9, -1)`, [STORE, cat]) ?? ""));
ok("price above MRP rejected", /PRICE_ABOVE_MRP/.test(await err(`select public.upsert_store_product($1::uuid, 'Bad price', $2::uuid, '', 1, 'g', '1 g', 10, 12, 1)`, [STORE, cat]) ?? ""));
await as(cust2);
ok("a customer cannot write another store's products", /FORBIDDEN/.test(await err(`select public.upsert_store_product($1::uuid, 'Hack', $2::uuid, '', 1, 'g', '1 g', 10, 9, 1)`, [STORE, cat]) ?? ""));
await as(staffUser);
ok("store staff can save products (no stock overwrite)", (await err(`select public.upsert_store_product($1::uuid, 'Regression Test Dal', $2::uuid, '', 500, 'g', '500 g', 100, 70, null, 5, null, null, false, true, $3::uuid, 5, null)`, [STORE, cat, created.product_id])) === null && (await one(`select stock_qty from inventory where id = $1`, [created.inventory_id])).stock_qty === 17);

console.log("Hidden products stay out of shopper search (0025)");
await as(STORE_OWNER);
const qa = await up({ name: 'Zzqa Hidden Probe', stock: 4, active: false });
const anonSearch = async (term) => { await db.exec(`set role anon`); try { return (await one(`select public.search_products(p_query => $1) r`, [term])).r; } finally { await db.exec(`reset role`); } };
const anonSuggest = async (term) => { await db.exec(`set role anon`); try { return (await one(`select public.search_suggest($1, 8) r`, [term])).r; } finally { await db.exec(`reset role`); } };
ok("hidden product not in shopper search", !(await anonSearch('Zzqa Hidden Probe')).items.some((x) => x.name === 'Zzqa Hidden Probe'));
ok("hidden product not in typeahead", !(await anonSuggest('Zzqa Hidden')).products.some((x) => x.name === 'Zzqa Hidden Probe'));
await as(STORE_OWNER); await q(`update inventory set is_active = true where id = $1`, [qa.inventory_id]);
ok("visible product appears in shopper search", (await anonSearch('Zzqa Hidden Probe')).items.some((x) => x.name === 'Zzqa Hidden Probe'));
await q(`update inventory set is_active = false where id = $1`, [qa.inventory_id]);
await as(STORE_OWNER);
ok("store catalog picker still finds unlisted products", (await one(`select public.search_products(p_query => 'Zzqa Hidden Probe', p_include_unlisted => true) r`)).r.items.some((x) => x.name === 'Zzqa Hidden Probe'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
