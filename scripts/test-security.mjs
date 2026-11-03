// Security, rider-flow, product-save, search-visibility, grouped-category, failed-delivery, cash hand-over,
// quick-commerce (auto-confirm, re-dispatch), strict category filter and single-operator checks (0023–0030). Loads every migration + seed into PGlite. Run from a folder with @electric-sql/pglite installed:
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
console.log(`loaded ${migrations.length} migrations + seed`);

let pass = 0, fail = 0;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); } };
const as = async (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
// Run a query as the 'authenticated' DB role so RLS applies (the harness user is a superuser).
const rls = async (uid, sql, params) => { await as(uid); await db.exec(`set role authenticated`); try { return (await db.query(sql, params)).rows; } finally { await db.exec(`reset role`); } };
const CUST = '30000000-0000-4000-8000-000000000002', ADMIN = '10000000-0000-4000-8000-000000000001';
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
const inv = (await one(`select i.id from inventory i where i.is_active and i.stock_qty > 40 and i.selling_price >= 200 limit 1`)).id;
await q(`select public.add_to_cart($1::uuid, 2)`, [inv]);
const addr = (await one(`select id from addresses where user_id = $1 limit 1`, [CUST])).id;
const order = (await one(`select public.place_order($1::uuid, 'cod', 'standard', null) as r`, [addr])).r.order_id;
await as(ADMIN);
for (const step of ['preparing']) await q(`select public.fulfil_order($1::uuid, $2)`, [order, step]);
const asg = (await one(`select public.fulfil_order($1::uuid, 'ready') as r`, [order])).r.assignment_id;
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
ok("customer cannot call notify_admins", /permission denied/.test(await asRole('authenticated', cust2, `select public.notify_admins('x', 't', 'b')`) ?? ""));
ok("customer cannot write audit rows", /permission denied/.test(await asRole('authenticated', cust2, `select public.audit('x', 'y', 'z')`) ?? ""));
ok("customer cannot use admin_notify_user", /FORBIDDEN/.test(await asRole('authenticated', CUST, `select public.admin_notify_user($1::uuid, 'x', 't', 'b')`, [cust2]) ?? ""));
ok("admin can use admin_notify_user", (await asRole('authenticated', ADMIN, `select public.admin_notify_user($1::uuid, 'test', 'Hello', 'From admin')`, [cust2])) === null);
ok("admin can use admin_audit", (await asRole('authenticated', ADMIN, `select public.admin_audit('test.action', 'test', '1')`)) === null);
ok("internal callers still notify (place_order path)", (await one(`select count(*)::int n from notifications where data->>'order_id' = $1`, [order])).n >= 1);

console.log("Business settings (0030): admin only");
const openBefore = (await one(`select value from settings where key = 'business_open'`)).value;
await rls(cust2, `update settings set value = 'false' where key = 'business_open'`).catch(() => []);
ok("customer cannot change business settings", JSON.stringify((await one(`select value from settings where key = 'business_open'`)).value) === JSON.stringify(openBefore));
await as(ADMIN); await q(`update settings set value = 'false' where key = 'business_open'`);
await as(CUST); await q(`select public.clear_cart()`); await q(`select public.add_to_cart($1::uuid, 1)`, [inv]);
ok("orders are refused while the business is closed", /CLOSED/.test(await err(`select public.place_order($1::uuid, 'cod', 'standard', null)`, [addr]) ?? ""));
await as(ADMIN); await q(`update settings set value = 'true' where key = 'business_open'`);
ok("pickup point is configured", Boolean((await one(`select public.pickup_point() p`)).p.lat));

console.log("Rejection, reassignment and a failed handover");
const mkReady = async () => {
  await as(CUST); await q(`select public.clear_cart()`);
  await q(`select public.add_to_cart($1::uuid, 1)`, [inv]);
  const o = (await one(`select public.place_order($1::uuid, 'cod', 'standard', null) as r`, [addr])).r.order_id;
  await as(ADMIN);
  for (const step of ['preparing']) await q(`select public.fulfil_order($1::uuid, $2)`, [o, step]);
  const a = (await one(`select public.fulfil_order($1::uuid, 'ready') as r`, [o])).r.assignment_id;
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
await as(ADMIN);
const cat = (await one(`select id from categories where parent_id is not null limit 1`)).id;
const up = (args) => one(`select public.upsert_product($1, $2::uuid, '', 500, 'g', '500 g', $3, $4, $5, 5, null, null, false, true, $6::uuid, 5, $7) r`, [args.name ?? 'Regression Test Dal', cat, args.mrp ?? 100, args.sp ?? 90, args.stock, args.pid ?? null, args.active ?? null]).then((x) => x.r);
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
ok("negative stock rejected", /INVALID_STOCK/.test(await err(`select public.upsert_product('Neg', $1::uuid, '', 1, 'g', '1 g', 10, 9, -1)`, [cat]) ?? ""));
ok("price above MRP rejected", /PRICE_ABOVE_MRP/.test(await err(`select public.upsert_product('Bad price', $1::uuid, '', 1, 'g', '1 g', 10, 12, 1)`, [cat]) ?? ""));
await as(cust2);
ok("a customer cannot write products", /FORBIDDEN/.test(await err(`select public.upsert_product('Hack', $1::uuid, '', 1, 'g', '1 g', 10, 9, 1)`, [cat]) ?? ""));
await as(riderUser);
ok("a rider cannot write products", /FORBIDDEN/.test(await err(`select public.upsert_product('Hack', $1::uuid, '', 1, 'g', '1 g', 10, 9, 1)`, [cat]) ?? ""));
ok("a rider cannot adjust stock", /FORBIDDEN/.test(await err(`select public.adjust_stock($1::uuid, 1)`, [created.inventory_id]) ?? ""));

console.log("Hidden products stay out of shopper search (0025)");
await as(ADMIN);
const qa = await up({ name: 'Zzqa Hidden Probe', stock: 4, active: false });
const anonSearch = async (term) => { await db.exec(`set role anon`); try { return (await one(`select public.search_products(p_query => $1) r`, [term])).r; } finally { await db.exec(`reset role`); } };
const anonSuggest = async (term) => { await db.exec(`set role anon`); try { return (await one(`select public.search_suggest($1, 8) r`, [term])).r; } finally { await db.exec(`reset role`); } };
ok("hidden product not in shopper search", !(await anonSearch('Zzqa Hidden Probe')).items.some((x) => x.name === 'Zzqa Hidden Probe'));
ok("hidden product not in typeahead", !(await anonSuggest('Zzqa Hidden')).products.some((x) => x.name === 'Zzqa Hidden Probe'));
await as(ADMIN); await q(`update inventory set is_active = true where id = $1`, [qa.inventory_id]);
ok("visible product appears in shopper search", (await anonSearch('Zzqa Hidden Probe')).items.some((x) => x.name === 'Zzqa Hidden Probe'));
await q(`update inventory set is_active = false where id = $1`, [qa.inventory_id]);
await as(ADMIN);
ok("admin catalogue picker still finds unlisted products", (await one(`select public.search_products(p_query => 'Zzqa Hidden Probe', p_include_unlisted => true) r`)).r.items.some((x) => x.name === 'Zzqa Hidden Probe'));

console.log("Grouped category tiles (0026)");
const anonQ = async (sql, params) => { await db.exec(`set role anon`); try { return (await one(sql, params)).r; } finally { await db.exec(`reset role`); } };
const tot = async (slug) => (await anonQ(`select public.search_products(p_category_slug => $1) r`, [slug])).total;
const [dal, pul, both, grocery] = [await tot('dal'), await tot('pulses'), await tot('dal,pulses'), await tot('grocery')];
ok("dal,pulses returns both categories' products", both === dal + pul && both > 0, JSON.stringify({ dal, pul, both }));
ok("single slug unchanged (parent includes children)", grocery >= both, JSON.stringify({ grocery }));
ok("spaces in the list are tolerated", (await tot('dal, pulses')) === both);
ok("unknown slug in a list is ignored", (await tot('dal,nope')) === dal);

console.log("Failed delivery and cash hand-over (0027)");
const F = await mkReady();
const fUser = (await one(`select dp.user_id from delivery_assignments a join delivery_partners dp on dp.id = a.rider_id where a.id = $1`, [F.a])).user_id;
const fRider = (await one(`select rider_id from delivery_assignments where id = $1`, [F.a])).rider_id;
await as(fUser); await q(`select public.rider_respond_assignment($1::uuid, true)`, [F.a]); await q(`select public.rider_pickup($1::uuid)`, [F.a]);
const otherR = (await one(`select user_id from delivery_partners where status = 'active' and user_id <> $1 limit 1`, [fUser])).user_id;
await as(otherR);
ok("another rider cannot report this delivery", /FORBIDDEN/.test(await err(`select public.rider_report_failed_delivery($1::uuid, 'customer_unreachable')`, [F.a]) ?? ""));
await as(fUser);
ok("unknown reason rejected", /INVALID_REASON/.test(await err(`select public.rider_report_failed_delivery($1::uuid, 'bored')`, [F.a]) ?? ""));
ok("'other' needs a description", /REASON_REQUIRED/.test(await err(`select public.rider_report_failed_delivery($1::uuid, 'other', 'x')`, [F.a]) ?? ""));
const fr = (await one(`select public.rider_report_failed_delivery($1::uuid, 'customer_unreachable', 'Called 3 times') r`, [F.a])).r;
const fa = await one(`select a.status, a.failure_reason, o.status as order_status from delivery_assignments a join orders o on o.id = a.order_id where a.id = $1`, [F.a]);
ok("failed attempt closes the assignment with the reason", fa.status === 'cancelled' && /Customer not reachable: Called 3 times/.test(fa.failure_reason), JSON.stringify(fa));
ok("order returns to ready for pickup", fr.ok === true && fa.order_status === 'ready_for_pickup', JSON.stringify(fr));
ok("no earning for a failed attempt", (await one(`select count(*)::int n from rider_earnings where assignment_id = $1`, [F.a])).n === 0);
ok("rider is free again (no active delivery)", (await one(`select count(*)::int n from delivery_assignments where rider_id = $1 and status in ('accepted','picked_up')`, [fRider])).n === 0);
ok("reporting twice is rejected", /INVALID_STATE/.test(await err(`select public.rider_report_failed_delivery($1::uuid, 'customer_unreachable')`, [F.a]) ?? ""));
ok("customer and admins notified", (await one(`select count(distinct user_id)::int n from notifications where type = 'delivery_failed' and data->>'order_id' = $1`, [F.o])).n >= 2);
await as(ADMIN);
const re = (await one(`select public.admin_assign_rider($1::uuid, $2::uuid) r`, [F.o, fRider])).r;
const newAsg = (await one(`select id from delivery_assignments where order_id = $1 and status in ('offered','accepted') order by created_at desc limit 1`, [F.o])).id;
ok("admin can reassign after a failed attempt", Boolean(newAsg), JSON.stringify(re));
await as(fUser);
const st0 = await one(`select status from delivery_assignments where id = $1`, [newAsg]);
if (st0.status === 'offered') await q(`select public.rider_respond_assignment($1::uuid, true)`, [newAsg]);
await q(`select public.rider_pickup($1::uuid)`, [newAsg]);
const otpF = (await one(`select delivery_otp from order_secrets where order_id = $1`, [F.o])).delivery_otp;
ok("second attempt delivers", (await one(`select public.verify_delivery_otp($1::uuid, $2, true) r`, [newAsg, otpF])).r.ok === true);
const cod = Number((await one(`select total from orders where id = $1`, [F.o])).total);
const statsAfter = (await one(`select public.rider_dashboard_stats() r`)).r;
const due0 = Number(statsAfter.cash_due);
ok("rider sees cash to hand over (includes this COD)", due0 >= cod, JSON.stringify({ due0, cod }));
ok("rider cannot record their own hand-over", /FORBIDDEN/.test(await err(`select public.admin_record_cash_remittance($1::uuid, 10)`, [fRider]) ?? ""));
await as(ADMIN);
ok("cannot record more than is due", /AMOUNT_ABOVE_DUE/.test(await err(`select public.admin_record_cash_remittance($1::uuid, $2)`, [fRider, due0 + 1]) ?? ""));
ok("zero/negative amounts rejected", /INVALID_AMOUNT/.test(await err(`select public.admin_record_cash_remittance($1::uuid, 0)`, [fRider]) ?? ""));
const rec = (await one(`select public.admin_record_cash_remittance($1::uuid, $2, 'UPI 1234', 'end of day') r`, [fRider, cod])).r;
ok("admin records cash received; balance drops", rec.ok === true && Math.abs(Number(rec.due) - (due0 - cod)) < 0.01, JSON.stringify(rec));
const bal = (await one(`select public.admin_rider_balances() r`)).r.find((x) => x.rider_id === fRider);
ok("admin balances show cash collected / remitted / due", bal && Number(bal.cash_remitted) >= cod && Math.abs(Number(bal.cash_due) - (due0 - cod)) < 0.01, JSON.stringify(bal));
ok("hand-over is audited", (await one(`select count(*)::int n from audit_logs where action = 'rider.cash_received' and entity_id = $1`, [fRider])).n >= 1);
ok("rider can read own hand-over records only", (await rls(fUser, `select id from rider_cash_remittances where rider_id = $1`, [fRider])).length >= 1 && (await rls(otherR, `select id from rider_cash_remittances where rider_id = $1`, [fRider])).length === 0);

console.log("Category filter never falls back to the whole catalogue (0029)");
const all = (await anonQ(`select public.search_products() r`)).total;
ok("unknown category returns nothing (not the whole catalogue)", (await tot('no-such-category')) === 0 && all > 0, JSON.stringify({ all }));
ok("empty slug list returns nothing", (await tot(',')) === 0);
const cats = await q(`select c.slug, (select count(*)::int from v_product_cards v where v.category_id = c.id and v.inventory_id is not null) own from categories c where c.parent_id is null and c.is_active`);
for (const c of cats.slice(0, 4)) {
  const r = await anonQ(`select public.search_products(p_category_slug => $1, p_page_size => 60) r`, [c.slug]);
  const outside = await one(`with recursive t as (select id from categories where slug = $1 union select c.id from categories c join t on c.parent_id = t.id)
    select count(*)::int n from jsonb_to_recordset($2::jsonb) x(category_id uuid) where x.category_id not in (select id from t)`, [c.slug, JSON.stringify(r.items)]);
  ok(`/${c.slug}: every result belongs to ${c.slug} or its sub-categories`, outside.n === 0, JSON.stringify({ total: r.total, outside: outside.n }));
}
const g2 = (await anonQ(`select public.search_products(p_category_slug => 'grocery', p_page => 2, p_page_size => 5) r`)).items;
ok("page 2 of a category stays in that category", (await one(`select count(*)::int n from products p join categories c on c.id = p.category_id left join categories pc on pc.id = c.parent_id where p.id = any($1::uuid[]) and 'grocery' not in (c.slug, coalesce(pc.slug, ''))`, [g2.map((x) => x.id)])).n === 0);

console.log("Quick-commerce flow: auto-confirm, real ETA, missed offers re-offered (0028)");
const placeCod = async (method = 'cod') => {
  await as(CUST); await q(`select public.clear_cart()`);
  await q(`select public.add_to_cart($1::uuid, 1)`, [inv]);
  const etaMax = (await one(`select public.cart_summary($1::uuid, 'standard') r`, [addr])).r.eta_max_minutes;
  const o = (await one(`select public.place_order($1::uuid, $2::payment_method, 'standard', null) as r`, [addr, method])).r;
  return { ...o, etaMax };
};
const Q1 = await placeCod();
const q1 = await one(`select status, eta_minutes, extract(epoch from promised_at - created_at)/60 as mins from orders where id = $1`, [Q1.order_id]);
ok("COD order is confirmed the moment it is placed", q1.status === 'confirmed', JSON.stringify(q1));
ok("promised time = window shown at checkout (no extra prep minutes)", q1.eta_minutes === Q1.etaMax && Math.round(Number(q1.mins)) === Q1.etaMax, JSON.stringify({ ...q1, etaMax: Q1.etaMax }));
ok("history: placed → confirmed (automatic)", JSON.stringify((await q(`select status::text s, note from order_status_history where order_id = $1 order by created_at, status`, [Q1.order_id])).map((r) => r.s)) === '["placed","confirmed"]');
const n1 = await q(`select type, title from notifications where user_id = $1 and data->>'order_id' = $2 and type in ('order_placed','order_status')`, [CUST, Q1.order_id]);
ok("customer gets one combined 'Order confirmed' message (no duplicate)", n1.length === 1 && n1[0].title === 'Order confirmed', JSON.stringify(n1));
await as(CUST);
ok("customer can still cancel before packing", (await one(`select public.cancel_order($1::uuid, 'changed my mind') r`, [Q1.order_id])).r.ok === true);

const Q2 = await placeCod();
const stockBefore = (await one(`select stock_qty from inventory where id = $1`, [inv])).stock_qty;
await as(ADMIN);
ok("admin can reject an auto-confirmed order it can't fulfil (stock restored)", (await one(`select public.fulfil_order($1::uuid, 'reject', 'Out of stock') r`, [Q2.order_id])).r.status === 'rejected' && (await one(`select stock_qty from inventory where id = $1`, [inv])).stock_qty === stockBefore + 1);

await q(`update settings set value = 'false' where key = 'auto_accept_orders'`);
const Q3 = await placeCod();
ok("with auto-confirm off, order waits at placed", (await one(`select status from orders where id = $1`, [Q3.order_id])).status === 'placed');
await as(ADMIN);
ok("…and manual accept still works", (await one(`select public.fulfil_order($1::uuid, 'accept') r`, [Q3.order_id])).r.status === 'confirmed');
await q(`update settings set value = 'true' where key = 'auto_accept_orders'`);

const Q4 = await placeCod('upi');
ok("online order waits for payment before confirming", (await one(`select status, payment_status from orders where id = $1`, [Q4.order_id])).status === 'placed');
await as(ADMIN);
ok("an unpaid online order cannot be accepted", /PAYMENT_PENDING/.test(await err(`select public.fulfil_order($1::uuid, 'accept')`, [Q4.order_id]) ?? ""));
await db.query(`select set_config('request.jwt.claim.role', 'authenticated', false)`);
ok("customer cannot fake the payment confirmation", /FORBIDDEN/.test((await as(CUST), await err(`select public.confirm_online_payment($1::uuid, 'o', 'p', 's')`, [Q4.order_id])) ?? ""));
await db.query(`select set_config('request.jwt.claim.role', '', false)`);
await as(ADMIN); await q(`select public.confirm_online_payment($1::uuid, 'order_test', 'pay_test', 'sig_test')`, [Q4.order_id]);
ok("captured payment confirms the order automatically", (await one(`select status, payment_status from orders where id = $1`, [Q4.order_id])).status === 'confirmed');

// Clean slate: earlier sections leave orders mid-delivery. One rider online, everyone else offline, nobody busy.
await q(`update delivery_assignments set status = 'cancelled' where status in ('offered','accepted','picked_up')`);
await q(`update orders set status = 'cancelled' where status in ('ready_for_pickup','rider_assigned','out_for_delivery')`);
const X = await one(`select id, user_id from delivery_partners where status = 'active' order by id limit 1`);
await q(`update delivery_partners set is_online = false`);
await as(X.user_id); await q(`select public.rider_set_online(true, 26.6491, 74.0341)`);
const Q5 = await placeCod();
await as(ADMIN);
const packed = (await one(`select public.fulfil_order($1::uuid, 'ready') r`, [Q5.order_id])).r;
ok("admin taps Packed → rider requested", packed.status === 'ready_for_pickup' && Boolean(packed.assignment_id), JSON.stringify(packed));
await q(`update delivery_assignments set expires_at = now() - interval '1 second' where id = $1`, [packed.assignment_id]); // the offer times out unanswered
await as(X.user_id);
const list = (await one(`select public.rider_assignments(array['offered']) r`)).r;
const old = await one(`select status from delivery_assignments where id = $1`, [packed.assignment_id]);
const reoffer = await one(`select id, rider_id from delivery_assignments where order_id = $1 and status = 'offered'`, [Q5.order_id]);
ok("missed offer expires and the order is re-offered (same rider, only one online)", old.status === 'expired' && reoffer && reoffer.rider_id === X.id && list.some((a) => a.id === reoffer.id), JSON.stringify({ old, reoffer }));
await as(X.user_id); await q(`select public.rider_assignments()`); await q(`select public.rider_assignments()`);
ok("repeated polling never creates a second live offer", (await one(`select count(*)::int n from delivery_assignments where order_id = $1 and status = 'offered'`, [Q5.order_id])).n === 1);
ok("dispatch sweep is not callable by shoppers", /permission denied/.test(await asRole('authenticated', CUST, `select public.dispatch_pending()`) ?? "") && /permission denied/.test(await asRole('anon', null, `select public.dispatch_pending()`) ?? ""));

await as(X.user_id); await q(`select public.rider_respond_assignment($1::uuid, false)`, [reoffer.id]);
await q(`select public.rider_assignments()`);
ok("a rider who declines is not offered the same order again", (await one(`select count(*)::int n from delivery_assignments where order_id = $1 and status = 'offered'`, [Q5.order_id])).n === 0);
ok("order stays packed, waiting for a rider (not delivered, not cancelled)", (await one(`select status from orders where id = $1`, [Q5.order_id])).status === 'ready_for_pickup');

// No rider online when packed → offered as soon as one comes online.
await as(X.user_id); await q(`select public.rider_set_online(false)`);
const Q6 = await placeCod();
await as(ADMIN);
ok("packed with no rider online → waits (no fake assignment)", (await one(`select public.fulfil_order($1::uuid, 'ready') r`, [Q6.order_id])).r.assignment_id === null);
await as(X.user_id); await q(`select public.rider_set_online(true, 26.6491, 74.0341)`);
const a6 = await one(`select id from delivery_assignments where order_id = $1 and status = 'offered' and rider_id = $2`, [Q6.order_id, X.id]);
ok("rider going online receives the waiting order", Boolean(a6));

// Complete it: accept → pickup → OTP + cash → delivered, earning credited once.
await q(`select public.rider_respond_assignment($1::uuid, true)`, [a6.id]);
await q(`select public.rider_pickup($1::uuid)`, [a6.id]);
const otp6 = (await one(`select delivery_otp from order_secrets where order_id = $1`, [Q6.order_id])).delivery_otp;
const wrong6 = String((Number(otp6) + 1) % 10000).padStart(4, '0');
ok("wrong OTP does not deliver", (await one(`select public.verify_delivery_otp($1::uuid, $2, true) r`, [a6.id, wrong6])).r.ok === false);
ok("COD needs the cash confirmation", (await one(`select public.verify_delivery_otp($1::uuid, $2, false) r`, [a6.id, otp6])).r.needs_cash === true);
ok("still out for delivery after failed attempts", (await one(`select status from orders where id = $1`, [Q6.order_id])).status === 'out_for_delivery');
ok("correct OTP + cash delivers", (await one(`select public.verify_delivery_otp($1::uuid, $2, true) r`, [a6.id, otp6])).r.ok === true && (await one(`select status from orders where id = $1`, [Q6.order_id])).status === 'delivered');
const again6 = (await one(`select public.verify_delivery_otp($1::uuid, $2, true) r`, [a6.id, otp6])).r;
ok("retrying completion is a no-op", again6.already === true);
ok("rider earning credited exactly once", (await one(`select count(*)::int n from rider_earnings where assignment_id = $1`, [a6.id])).n === 1);
ok("tracking shows delivered with no OTP exposed", await (async () => { await as(CUST); const t = (await one(`select public.order_tracking($1::uuid) r`, [Q6.order_id])).r; return t.order.status === 'delivered' && t.delivery_otp === null; })());

console.log("Single operator (0030): no store concept remains");
const leftovers = await one(`select (select count(*)::int from information_schema.tables where table_schema = 'public' and table_name ilike '%store%') t,
  (select count(*)::int from information_schema.columns where table_schema = 'public' and column_name ilike '%store%') c,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.prosrc ilike '%store%' or p.proname ilike '%store%')) f,
  (select count(*)::int from pg_policies where schemaname = 'public' and (qual ilike '%store%' or with_check ilike '%store%')) p,
  (select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'user_role') roles,
  (select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'review_target') targets`);
ok("no store tables, columns, functions or policies", leftovers.t === 0 && leftovers.c === 0 && leftovers.f === 0 && leftovers.p === 0, JSON.stringify(leftovers));
ok("roles are customer / rider / admin / super_admin", leftovers.roles === 'customer,rider,admin,super_admin', leftovers.roles);
ok("reviews rate products and deliveries only", leftovers.targets === 'product,delivery', leftovers.targets);
const slug = (await one(`select slug from v_product_cards where inventory_id is not null limit 1`)).slug;
ok("product detail carries exactly one listing", (await anonQ(`select public.product_detail($1) r`, [slug])).offers.length === 1);
ok("typeahead has no store section", !('stores' in (await anonQ(`select public.search_suggest('amul') r`))));
await as(CUST);
const tr6 = (await one(`select public.order_tracking($1::uuid) r`, [Q6.order_id])).r;
ok("tracking exposes the pickup point, not a store", tr6.pickup?.name === 'Merta Deal' && !('store' in tr6) && tr6.viewer === 'customer', JSON.stringify(tr6.pickup));
await as(X.user_id);
const ra6 = (await one(`select public.rider_assignments(array['delivered']) r`)).r.find((a) => a.id === a6.id);
ok("rider requests carry the pickup point", ra6 && ra6.pickup.lat != null && ra6.pickup.name === 'Merta Deal' && !('store' in ra6), JSON.stringify(ra6?.pickup));
ok("stock movements are admin-only", (await rls(ADMIN, `select id from inventory_movements limit 1`)).length === 1 && (await rls(cust2, `select id from inventory_movements limit 1`)).length === 0);
ok("admin dashboard has a to-pack count", typeof (await (async () => { await as(ADMIN); return (await one(`select public.admin_dashboard_stats() r`)).r; })()).to_pack === 'number');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
