// Delivery code at the door (0059): a code exists only from the moment the assigned rider reaches the
// customer, it is stored as a hash, it reaches the customer by SMS (when a delivery-code template is
// configured) or on their own order screen, and the order becomes delivered only when the assigned
// rider enters a live code. Covers: the send point, who may trigger it, duplicates, resend cooldown and
// cap, expiry, wrong codes and the attempt limit, single use, reassignment and cancellation, what each
// role can read, the unconfigured-SMS fallback, what staff see, and the database without 0058.
//
// The database half runs in PGlite with every migration + seed. The sender is the app's own code
// (src/lib/notifications/delivery-code-core.ts and src/lib/sms/otp-sms.ts, loaded directly) talking to
// a STAND-IN for the SMS panel on 127.0.0.1. Nothing here reaches the real SMS panel, a real customer
// or a real order. Run from the project folder (Node 24: loads the .ts files directly):
//   node scripts/test-delivery-otp.mjs "$PWD"
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const root = process.argv[2] ?? process.cwd();
const core = await import(pathToFileURL(path.join(root, "src/lib/notifications/delivery-code-core.ts")).href);
const smsLib = await import(pathToFileURL(path.join(root, "src/lib/sms/otp-sms.ts")).href);
const read = (p) => fs.readFileSync(`${root}/${p}`, "utf8");
const MIGRATION = "supabase/migrations/0059_delivery_otp_sms.sql";

/** A fresh in-memory database: shim, every migration (optionally without some), seed, then 0059 a second time. */
async function boot({ skip = [] } = {}) {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  const exec = async (label, sql) => { try { await db.exec(sql); } catch (e) { console.error(`SETUP FAIL ${label}: ${e.message}`); process.exit(1); } };
  await exec("shim", read("supabase/local/00_supabase_shim.sql"));
  await exec("stubs", `
    create or replace function extensions.unaccent(text) returns text language sql immutable as $$ select $1 $$;
    create or replace function extensions.crypt(text, text) returns text language sql as $$ select md5($1) $$;
    create or replace function extensions.gen_salt(text) returns text language sql as $$ select 'salt' $$;
    create or replace function extensions.gen_random_bytes(int) returns bytea language sql as $$ select substring(decode(repeat(md5(random()::text), 8), 'hex') from 1 for $1) $$;`);
  await exec("auth", read("supabase/local/00b_auth_tables_fallback.sql"));
  const migrations = fs.readdirSync(`${root}/supabase/migrations`).filter((f) => f.endsWith(".sql") && !skip.some((s) => f.startsWith(s))).sort();
  for (const f of migrations) await exec(f, read(`supabase/migrations/${f}`).replace(/create extension if not exists "(pgcrypto|unaccent)"[^;]*;/g, ""));
  await exec("seed", read("supabase/seed.sql"));
  // Applying 0059 a second time, over real rows, must be harmless (it is written to be re-runnable).
  await exec("0059 again", read(MIGRATION));
  return { db, count: migrations.length };
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); } };
const ADMIN = "10000000-0000-4000-8000-000000000001";
const CUST = "30000000-0000-4000-8000-000000000002", CUST2 = "30000000-0000-4000-8000-000000000003";
const RIDER1 = "40000000-0000-4000-8000-000000000001", RIDER2 = "40000000-0000-4000-8000-000000000002";
const sha = (salt, code) => createHash("sha256").update(`${salt}:${code}`, "utf8").digest("hex");
/** Every key anywhere inside a JSON value. */
const keysOf = (v, out = new Set()) => { if (Array.isArray(v)) v.forEach((x) => keysOf(x, out)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysOf(x, out); } return out; };

/** Query helpers bound to one database. */
function tools(db) {
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const one = async (sql, params) => (await q(sql, params))[0];
  const as = async (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
  const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
  const fnv = async (sql, params) => (await one(`select ${sql} as r`, params)).r;
  /** As a signed-in user through the `authenticated` role, the way the API reaches the database. */
  const asRole = async (role, uid, sql, params) => { await as(uid); await db.exec(`set role ${role}`); try { return { rows: (await db.query(sql, params)).rows, error: null }; } catch (e) { return { rows: [], error: e.message }; } finally { await db.exec(`reset role`); } };
  return { q, one, as, err, fnv, asRole };
}

/** Opens the shop, clears what the seed left in flight, and returns the order helpers for one database. */
async function world(db) {
  const T = tools(db); const { q, one, as, fnv } = T;
  await q(`update settings set value = '{"open":"00:00","close":"23:59"}'::jsonb where key = 'business_hours'`);
  await q(`update settings set value = 'true'::jsonb where key = 'business_open'`);
  await q(`update delivery_partners set is_online = false, current_lat = null, current_lng = null`);
  await q(`update delivery_assignments set status = 'cancelled' where status in ('offered','accepted','picked_up')`);
  await q(`update orders set status = 'cancelled' where status not in ('delivered','completed','cancelled','rejected')`);
  await q(`delete from notifications`);
  const addr = (await one(`select id from addresses where user_id = $1 order by is_default desc limit 1`, [CUST])).id;
  const inv = (await one(`select id from inventory where stock_qty > 60 and selling_price between 100 and 400 order by selling_price limit 1`)).id;
  const riderId = { [RIDER1]: (await one(`select id from delivery_partners where user_id = $1`, [RIDER1])).id, [RIDER2]: (await one(`select id from delivery_partners where user_id = $1`, [RIDER2])).id };
  const place = async (pay = "cod") => {
    await as(CUST); await q(`select public.clear_cart()`); await q(`select public.add_to_cart($1::uuid, 2)`, [inv]);
    return (await fnv(`public.place_order($1::uuid, $2::public.payment_method, 'standard', null)`, [addr, pay])).order_id;
  };
  /** Offers the packed order to exactly this rider, who accepts it and collects it. */
  const collect = async (o, rider = RIDER1) => {
    await as(null); await q(`update delivery_partners set is_online = false`);
    await as(rider); await q(`select public.rider_set_online(true, 26.6480, 74.0325)`);
    const off = (await fnv(`public.rider_assignments(array['offered'])`)).find((x) => x.order.id === o);
    await q(`select public.rider_respond_assignment($1::uuid, true)`, [off.id]); await q(`select public.rider_pickup($1::uuid)`, [off.id]);
    return off.id;
  };
  /** A new cash order, packed, accepted and picked up by the rider: out for delivery, nobody at the door yet. */
  const onTheWay = async (rider = RIDER1) => {
    const o = await place(); await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [o]);
    return { o, a: await collect(o, rider) };
  };
  const arrive = async (a, rider = RIDER1) => { await as(rider); return T.err(`select public.rider_mark_arrived($1::uuid, 'customer')`, [a]); };
  const sec = async (o) => one(`select * from order_secrets where order_id = $1`, [o]);
  const order = async (o) => one(`select status, order_number, address_snapshot, user_id from orders where id = $1`, [o]);
  const state = async (a, rider = RIDER1) => { await as(rider); return fnv(`public.rider_delivery_otp_state($1::uuid)`, [a]); };
  const verify = async (a, code, rider = RIDER1, cash = true) => { await as(rider); return fnv(`public.verify_delivery_otp($1::uuid, $2, $3)`, [a, code, cash]); };
  const reveal = async (o, user = CUST) => { await as(user); return fnv(`public.customer_delivery_code($1::uuid, true)`, [o]); };
  const codeNotes = async (o) => q(`select id, user_id, type, title, body, data, channels from notifications where type = 'delivery_code' and data ->> 'order_id' = $1 order by created_at`, [o]);
  const smsRows = async (o) => q(`select d.status, d.attempts, d.error, d.provider_id, n.data ->> 'kind' as kind from notification_deliveries d join notifications n on n.id = d.notification_id where n.type = 'delivery_code' and n.data ->> 'order_id' = $1 and d.channel = 'sms' order by n.created_at`, [o]);
  return { ...T, place, collect, onTheWay, arrive, sec, order, state, verify, reveal, codeNotes, smsRows, riderId };
}

// The SMS panel stand-in: answers like the real one (a bare number), and keeps every request it saw.
const panel = { answer: "7770001", delayMs: 0, hits: [] };
const panelServer = createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  panel.hits.push(Object.fromEntries(u.searchParams));
  setTimeout(() => { res.writeHead(200, { "Content-Type": "text/plain" }); res.end(panel.answer); }, panel.delayMs);
});
await new Promise((r) => panelServer.listen(0, "127.0.0.1", r));
const panelUrl = `http://127.0.0.1:${panelServer.address().port}/api/smsapi`;
const LOGIN_TEMPLATE = "{otp} is your Merta Deal login OTP. Do not share it with anyone. -MERTA DEAL";
const DELIVERY_TEMPLATE = "{otp} is the delivery code for your Merta Deal order. Share it with the delivery partner only when your order is at your door. -MERTA DEAL";
// What the server has today: the login OTP template only.
const ENV_TODAY = { PARKEN_SMS_API_URL: panelUrl, PARKEN_SMS_KEY: "0123456789abcdef0123456789abcdef", PARKEN_SMS_SENDER: "MRTDEL", PARKEN_SMS_TEMPLATE_ID: "1007000000000000001", PARKEN_SMS_TEMPLATE: LOGIN_TEMPLATE, PARKEN_SMS_ROUTE: "4" };
// With an approved delivery-code template of its own.
const ENV_ON = { ...ENV_TODAY, PARKEN_DELIVERY_OTP_TEMPLATE_ID: "1007000000000000059", PARKEN_DELIVERY_OTP_TEMPLATE: DELIVERY_TEMPLATE, PARKEN_DELIVERY_OTP_ROUTE: "4" };
const codeIn = (hit) => (hit?.sms.match(/^(\d{4}) is the delivery code/) ?? [])[1] ?? null;

/** The app's sender, wired to one database and one server configuration, exactly as src/lib/notifications/delivery-code.ts wires it. */
function sender(W, env, timeoutMs) {
  const ports = {
    smsConfigured: () => smsLib.deliveryOtpSmsMissing(env).length === 0,
    smsUnavailableReason: () => `The delivery code SMS is not configured on the server (${smsLib.deliveryOtpSmsMissing(env).join(", ")}).`,
    claim: async (id) => { await W.as(null); return W.fnv(`public.delivery_otp_claim($1::uuid)`, [id]); },
    record: async (id, status, providerId, e) => { await W.as(null); await W.q(`select public.delivery_otp_record($1::uuid, $2, $3, $4)`, [id, status, providerId, e]); },
    sendSms: (mobile, code) => smsLib.sendDeliveryOtpSms(smsLib.deliveryOtpSmsConfig(env), mobile, code, timeoutMs),
  };
  return async (assignmentId) => { const before = panel.hits.length; const out = await core.sendDeliveryCode(ports, assignmentId); return { out, texted: panel.hits.slice(before) }; };
}

/* ====================================================================================================== */
const main = await boot();
console.log(`loaded ${main.count} migrations + seed, 0059 applied twice`);
const W = await world(main.db);
const { q, one, as, err, fnv, asRole } = W;
const sendOn = sender(W, ENV_ON), sendToday = sender(W, ENV_TODAY);
const admins = (await one(`select count(*)::int n from profiles where role in ('admin','super_admin') and is_active`)).n;

console.log("What the server can send today");
ok("today's configuration (login OTP template only) cannot send a delivery code: three settings are missing", ["PARKEN_DELIVERY_OTP_TEMPLATE_ID", "PARKEN_DELIVERY_OTP_TEMPLATE", "PARKEN_DELIVERY_OTP_ROUTE"].every((k) => smsLib.deliveryOtpSmsMissing(ENV_TODAY).includes(k)), smsLib.deliveryOtpSmsMissing(ENV_TODAY).join(" | "));
ok("the login template's ID is refused for delivery codes", smsLib.deliveryOtpSmsMissing({ ...ENV_ON, PARKEN_DELIVERY_OTP_TEMPLATE_ID: ENV_TODAY.PARKEN_SMS_TEMPLATE_ID }).some((m) => /same as the login OTP template ID/.test(m)));
ok("the login template's wording is refused for delivery codes, even under a new ID", smsLib.deliveryOtpSmsMissing({ ...ENV_ON, PARKEN_DELIVERY_OTP_TEMPLATE: LOGIN_TEMPLATE }).some((m) => /login template/.test(m)));
ok("a template without {otp} is refused", smsLib.deliveryOtpSmsMissing({ ...ENV_ON, PARKEN_DELIVERY_OTP_TEMPLATE: "Your order is at your door. -MERTA DEAL" }).some((m) => /must contain \{otp\}/.test(m)));
ok("the route has no default: a delivery template without its route is not configured", smsLib.deliveryOtpSmsMissing({ ...ENV_ON, PARKEN_DELIVERY_OTP_ROUTE: "" }).includes("PARKEN_DELIVERY_OTP_ROUTE"));
ok("with its own approved template the channel is configured, the sender falling back to the login header", smsLib.deliveryOtpSmsMissing(ENV_ON).length === 0 && smsLib.deliveryOtpSmsConfig(ENV_ON).sender === "MRTDEL");
ok("anything that is not 4 to 8 digits is never put into an SMS", (await smsLib.sendDeliveryOtpSms(smsLib.deliveryOtpSmsConfig(ENV_ON), "9876500002", "12a4")).ok === false && panel.hits.length === 0);

console.log("Nothing readable at rest");
ok("the migration left no plain code on any existing order", (await one(`select count(*)::int n from order_secrets where delivery_otp is not null`)).n === 0 && (await one(`select count(*)::int n from order_secrets`)).n > 0);
const A = await W.onTheWay();
let sA = await W.sec(A.o);
ok("a new order has no code at all: nothing plain, nothing hashed", sA.delivery_otp === null && sA.sms_code_hash === null && sA.app_code_hash === null && sA.otp_assignment_id === null);
await as(null); await q(`update order_secrets set delivery_otp = '4321' where order_id = $1`, [A.o]);
ok("a plain code written to the table by anything is discarded", (await W.sec(A.o)).delivery_otp === null);
ok("the read policy that let the customer and every admin select the table is gone", (await one(`select count(*)::int n from pg_policies where tablename = 'order_secrets'`)).n === 0);
ok("signed-in users have no access to the table (customer, rider, admin alike)", (await one(`select has_table_privilege('authenticated', 'public.order_secrets', 'select') s, has_table_privilege('anon', 'public.order_secrets', 'select') a`)).s === false
  && /permission denied/.test((await asRole("authenticated", RIDER1, `select * from order_secrets where order_id = $1`, [A.o])).error ?? "") && /permission denied/.test((await asRole("authenticated", ADMIN, `select * from order_secrets where order_id = $1`, [A.o])).error ?? "") && /permission denied/.test((await asRole("authenticated", CUST, `select * from order_secrets where order_id = $1`, [A.o])).error ?? ""));
await as(CUST);
ok("the customer's tracking read carries no code any more", (await fnv(`public.order_tracking($1::uuid)`, [A.o])).delivery_otp === null);
const oA = await W.order(A.o);
await as(null);
const byCode = await fnv(`public.track_order_by_code($1, $2)`, [oA.order_number, oA.address_snapshot.phone]);
ok("order number + phone number (which the rider holds) no longer yields a code", byCode?.order?.status === "out_for_delivery" && byCode.delivery_otp === null);

console.log("Send point: the assigned rider reaches the customer");
let stA = await W.state(A.a);
ok("before arrival there is no request, no code and no notification", stA.applies === true && stA.arrived === false && stA.sms.status === null && stA.sms.live === false && (await W.codeNotes(A.o)).length === 0);
ok("before arrival the server is given nothing to send", (await sendOn(A.a)).out.status === "held" && panel.hits.length === 0);
ok("another rider cannot mark arrival on this delivery", /FORBIDDEN/.test((await W.arrive(A.a, RIDER2)) ?? "") && (await W.sec(A.o)).sms_requests === 0);
ok("a customer or an admin cannot mark arrival either", /FORBIDDEN/.test((await W.arrive(A.a, CUST)) ?? "") && /FORBIDDEN/.test((await W.arrive(A.a, ADMIN)) ?? ""));
ok("the assigned rider marks arrival", (await W.arrive(A.a)) === null);
// What the rider and an admin can read once the rider is at the door, before any code exists.
await as(RIDER1); const raBefore = JSON.stringify(await fnv(`public.rider_assignments(array['picked_up'])`));
await as(ADMIN); const adminBefore = JSON.stringify(await fnv(`public.order_tracking($1::uuid)`, [A.o]));
sA = await W.sec(A.o);
ok("arrival asks for exactly one code for this assignment, and mints nothing by itself", sA.sms_status === "pending" && sA.sms_requests === 1 && sA.otp_assignment_id === A.a && sA.sms_code_hash === null);
let notesA = await W.codeNotes(A.o);
ok("the customer gets one notification that the order is at the door, with no code in it", notesA.length === 1 && notesA[0].user_id === CUST && notesA[0].title === "Your delivery partner has arrived"
  && notesA[0].body === `Order ${oA.order_number} is at your door. Open your order to see your delivery code and share it with the delivery partner only when the order is in your hands.`
  && JSON.stringify(Object.keys(notesA[0].data).sort()) === JSON.stringify(["assignment_id", "kind", "order_id", "order_number"]));
await W.arrive(A.a); await W.arrive(A.a);
ok("marking arrived again and again asks for nothing more", (await W.sec(A.o)).sms_requests === 1 && (await W.codeNotes(A.o)).length === 1);
ok("a signed-in user cannot claim a code, whoever they are", /FORBIDDEN/.test((await asRole("authenticated", RIDER1, `select public.delivery_otp_claim($1::uuid)`, [A.a])).error ?? "") || /permission denied/.test((await asRole("authenticated", RIDER1, `select public.delivery_otp_claim($1::uuid)`, [A.a])).error ?? ""));
await as(RIDER1);
ok("even run as the owner, the claim refuses any signed-in caller", /FORBIDDEN/.test((await err(`select public.delivery_otp_claim($1::uuid)`, [A.a])) ?? "") && /FORBIDDEN/.test((await err(`select public.delivery_otp_record($1::uuid, 'sent', '1', null)`, [A.a])) ?? ""));
const privs = await one(`select has_function_privilege('authenticated', 'public.delivery_otp_claim(uuid)', 'execute') a, has_function_privilege('anon', 'public.delivery_otp_claim(uuid)', 'execute') b, has_function_privilege('service_role', 'public.delivery_otp_claim(uuid)', 'execute') c,
  has_function_privilege('authenticated', 'public.delivery_otp_record(uuid, text, text, text)', 'execute') d, has_function_privilege('anon', 'public.customer_delivery_code(uuid, boolean)', 'execute') e, has_function_privilege('anon', 'public.rider_resend_delivery_otp(uuid)', 'execute') f, has_function_privilege('anon', 'public.rider_delivery_otp_state(uuid)', 'execute') g`);
ok("only the service role may run the claim and the record", privs.a === false && privs.b === false && privs.c === true && privs.d === false, JSON.stringify(privs));
ok("anonymous callers can run none of the customer or rider functions", privs.e === false && privs.f === false && privs.g === false, JSON.stringify(privs));

console.log("The SMS");
const s1 = await sendOn(A.a);
const codeA = codeIn(s1.texted[0]);
ok("one SMS goes to the panel, and the panel's acceptance is what makes it 'sent'", s1.out.status === "sent" && s1.texted.length === 1 && /^\d{4}$/.test(codeA ?? ""));
ok("it goes to the number on the delivery address", s1.texted[0].number === oA.address_snapshot.phone.replace(/\D/g, "").slice(-10));
ok("it is sent on the delivery template, never the login one", s1.texted[0].templateid === ENV_ON.PARKEN_DELIVERY_OTP_TEMPLATE_ID && s1.texted[0].templateid !== ENV_ON.PARKEN_SMS_TEMPLATE_ID && s1.texted[0].route === "4" && s1.texted[0].sender === "MRTDEL");
ok("the text is the approved template with the code and nothing else: no order number, address, name or phone number", s1.texted[0].sms === DELIVERY_TEMPLATE.replace("{otp}", codeA)
  && !s1.texted[0].sms.includes(oA.order_number) && !s1.texted[0].sms.includes(oA.address_snapshot.phone) && !s1.texted[0].sms.includes(oA.address_snapshot.full_name));
ok("the sender's own answer is the outcome and nothing else", JSON.stringify(s1.out) === '{"status":"sent"}');
sA = await W.sec(A.o);
ok("what is stored is a salted hash, not the code", sA.sms_code_hash !== codeA && sA.sms_code_hash.length === 64 && sA.sms_code_hash === sha(sA.sms_code_salt, codeA) && sA.delivery_otp === null);
ok("the code is short-lived: it expires after the configured minutes", Math.abs((new Date(sA.sms_expires_at) - new Date(sA.sms_issued_at)) / 60000 - 10) < 0.01);
stA = await W.state(A.a);
ok("the rider is told it was sent, to which last two digits, and nothing more", stA.sms.status === "sent" && stA.sms.phone_tail === oA.address_snapshot.phone.slice(-2) && stA.sms.live === true && stA.arrived === true
  && JSON.stringify([...keysOf(stA)].sort()) === JSON.stringify(["applies", "arrived", "at", "attempts_left", "cooldown_seconds", "customer_has_code", "expires_at", "expiry_minutes", "left", "live", "locked", "max", "max_attempts", "phone_tail", "resend", "retry_in_seconds", "sms", "status"].sort()), JSON.stringify(stA));
let rowsA = await W.smsRows(A.o);
ok("the outcome is on record for staff: accepted by the panel, with its message id, one attempt", rowsA.length === 1 && rowsA[0].status === "sent" && rowsA[0].provider_id === "7770001" && rowsA[0].attempts === 1 && rowsA[0].error === null);
const again = [await sendOn(A.a), await sendOn(A.a), await sendOn(A.a)];
await W.arrive(A.a);
const afterArrive = await sendOn(A.a);
ok("retries, refreshes and another 'arrived' send no second SMS and mint no second code", [...again, afterArrive].every((r) => r.out.status === "held" && r.texted.length === 0) && panel.hits.length === 1 && (await W.sec(A.o)).sms_code_hash === sA.sms_code_hash);

console.log("Who can read what");
await as(RIDER1); const raAfter = JSON.stringify(await fnv(`public.rider_assignments(array['picked_up'])`));
ok("rider_assignments() is byte for byte what it was before the code existed", raAfter === raBefore);
ok("rider_assignments() has no code, hash or salt field", ![...keysOf(JSON.parse(raAfter))].some((k) => /otp|hash|salt|secret/i.test(k) || k === "code"));
await as(ADMIN); const adminAfter = JSON.parse(JSON.stringify(await fnv(`public.order_tracking($1::uuid)`, [A.o])));
ok("an admin's order read is unchanged by the code and carries none", JSON.stringify(adminAfter) === adminBefore && adminAfter.delivery_otp === null);
await as(RIDER1);
ok("the rider's order read carries none", (await fnv(`public.order_tracking($1::uuid)`, [A.o])).delivery_otp === null);
notesA = await W.codeNotes(A.o);
ok("the notification row is untouched by the send: still no code", notesA.length === 1 && notesA[0].body === `Order ${oA.order_number} is at your door. Open your order to see your delivery code and share it with the delivery partner only when the order is in your hands.`);
ok("the delivery record holds the panel's answer only", JSON.stringify(Object.keys(rowsA[0]).sort()) === JSON.stringify(["attempts", "error", "kind", "provider_id", "status"]));
await as(ADMIN);
const logA = await fnv(`public.admin_delivery_code_log(12)`);
const entryA = logA.recent.find((r) => r.order_id === A.o);
ok("Admin → Notifications data: the request, its order number and the outcome, with no number, name or code field", entryA?.status === "sent" && entryA.kind === "arrival" && entryA.order_number === oA.order_number && logA.summary.sent_24h >= 1
  && ![...keysOf(logA)].some((k) => /phone|mobile|name|otp|hash|salt|code$/i.test(k) && k !== "order_number"), JSON.stringify([...keysOf(logA)]));
ok("only an admin can read it", /FORBIDDEN/.test((await (async () => { await as(RIDER1); return err(`select public.admin_delivery_code_log(12)`); })()) ?? "") && /FORBIDDEN/.test((await (async () => { await as(CUST); return err(`select public.admin_delivery_code_log(12)`); })()) ?? ""));
ok("another rider cannot read this delivery's code state", /FORBIDDEN/.test((await (async () => { await as(RIDER2); return err(`select public.rider_delivery_otp_state($1::uuid)`, [A.a]); })()) ?? ""));

console.log("Verification");
const wrongOf = (...codes) => { for (let i = 0; i < 10000; i++) { const c = String(i).padStart(4, "0"); if (!codes.includes(c)) return c; } };
ok("another rider cannot complete it, even with the right code", /FORBIDDEN/.test((await (async () => { await as(RIDER2); return err(`select public.verify_delivery_otp($1::uuid, $2, true)`, [A.a, codeA]); })()) ?? "") && (await W.order(A.o)).status === "out_for_delivery");
ok("a customer or an admin cannot complete it with the code either", /NOT_A_RIDER|FORBIDDEN/.test((await (async () => { await as(CUST); return err(`select public.verify_delivery_otp($1::uuid, $2, true)`, [A.a, codeA]); })()) ?? "") && /NOT_A_RIDER|FORBIDDEN/.test((await (async () => { await as(ADMIN); return err(`select public.verify_delivery_otp($1::uuid, $2, true)`, [A.a, codeA]); })()) ?? ""));
const needCash = await W.verify(A.a, codeA, RIDER1, false);
ok("cash on delivery still needs the cash confirmed first, and that uses up no try", needCash.ok === false && needCash.needs_cash === true && (await W.sec(A.o)).otp_attempts === 0);
const wrongA = await W.verify(A.a, wrongOf(codeA));
ok("a wrong code leaves the order undelivered and says only that it is wrong", wrongA.ok === false && wrongA.code === "OTP_INCORRECT" && wrongA.attempts_left === 4 && wrongA.locked === false && (await W.order(A.o)).status === "out_for_delivery"
  && JSON.stringify(Object.keys(wrongA).sort()) === JSON.stringify(["attempts_left", "code", "locked", "ok", "reason"]));
ok("the rider's screen shows the tries left", (await W.state(A.a)).attempts_left === 4);
const histBefore = (await one(`select count(*)::int n from order_status_history where order_id = $1 and status = 'delivered'`, [A.o])).n;
const doneA = await W.verify(A.a, codeA);
ok("the right code from the assigned rider delivers the order", doneA.ok === true && doneA.status === "delivered" && (await W.order(A.o)).status === "delivered" && (await one(`select status from delivery_assignments where id = $1`, [A.a])).status === "delivered");
ok("delivery is written to the status history by the existing function", histBefore === 0 && (await one(`select count(*)::int n from order_status_history where order_id = $1 and status = 'delivered'`, [A.o])).n === 1);
sA = await W.sec(A.o);
ok("the code is used up: its hash is gone", sA.sms_code_hash === null && sA.app_code_hash === null && sA.otp_consumed_at !== null);
ok("a repeat of the same submission is answered 'already', and delivers nothing twice", (await W.verify(A.a, codeA)).already === true && (await one(`select count(*)::int n from rider_earnings where assignment_id = $1`, [A.a])).n === 1);
ok("after delivery: no arrival, no resend, no claim, no SMS, no code for the customer", /INVALID_STATE/.test((await W.arrive(A.a)) ?? "") && /INVALID_STATE/.test((await (async () => { await as(RIDER1); return err(`select public.rider_resend_delivery_otp($1::uuid)`, [A.a]); })()) ?? "")
  && (await sendOn(A.a)).out.status === "held" && panel.hits.length === 1 && (await (async () => { await as(CUST); return fnv(`public.customer_delivery_code($1::uuid, true)`, [A.o]); })()).available === false && (await W.sec(A.o)).app_code_hash === null);

console.log("SMS not configured: the customer's own screen");
const B = await W.onTheWay();
const oB = await W.order(B.o);
await W.arrive(B.a);
const hitsB = panel.hits.length;
const sB1 = await sendToday(B.a);
let sB = await W.sec(B.o);
ok("with no delivery template nothing is sent and no SMS code is minted", sB1.out.status === "unavailable" && panel.hits.length === hitsB && sB.sms_code_hash === null && sB.sms_issued_at === null);
let rowsB = await W.smsRows(B.o);
ok("it is recorded as not configured, naming what the server lacks, never as sent", sB.sms_status === "unavailable" && rowsB.length === 1 && rowsB[0].status === "unavailable" && rowsB[0].attempts === 0 && /PARKEN_DELIVERY_OTP_TEMPLATE_ID/.test(rowsB[0].error) && rowsB[0].provider_id === null);
ok("the rider is told plainly that no SMS went", (await W.state(B.a)).sms.status === "unavailable" && (await W.state(B.a)).sms.phone_tail === null && (await W.state(B.a)).customer_has_code === false);
await sendToday(B.a); await sendToday(B.a);
ok("repeating it changes nothing", (await W.smsRows(B.o)).length === 1 && (await W.smsRows(B.o))[0].attempts === 0 && panel.hits.length === hitsB);
await as(CUST);
const lookB = await fnv(`public.customer_delivery_code($1::uuid, false)`, [B.o]);
ok("the customer's screen knows the order is at the door and that no SMS was sent; looking does not mint", lookB.available === true && lookB.arrived === true && lookB.sms.status === "unavailable" && lookB.app.live === false && (lookB.code ?? null) === null && (await W.sec(B.o)).app_code_hash === null);
const revB = await W.reveal(B.o);
sB = await W.sec(B.o);
ok("tapping 'Show code' gives the customer a code, stored only as a hash", /^\d{4}$/.test(revB.code) && revB.app.live === true && sB.app_code_hash === sha(sB.app_code_salt, revB.code) && sB.app_code_hash !== revB.code && sB.delivery_otp === null);
ok("nobody else can open that screen's code: another customer, the rider, an admin, an anonymous caller", (await Promise.all([CUST2, RIDER1, ADMIN, null].map(async (u) => { await as(u); return /FORBIDDEN/.test((await err(`select public.customer_delivery_code($1::uuid, true)`, [B.o])) ?? ""); }))).every(Boolean)
  && (await W.sec(B.o)).app_code_hash === sB.app_code_hash);
ok("the rider can see that the customer has a code open, not the code", (await W.state(B.a)).customer_has_code === true);
ok("the on-screen code completes the delivery", (await W.verify(B.a, revB.code)).status === "delivered" && (await W.order(B.o)).status === "delivered");
ok("no SMS was ever sent for that order", panel.hits.length === hitsB && !panel.hits.some((h) => h.sms.includes(oB.order_number)));

console.log("Expiry");
const C = await W.onTheWay();
await W.arrive(C.a);
const codeC = codeIn((await sendOn(C.a)).texted[0]);
await as(null); await q(`update order_secrets set sms_expires_at = now() - interval '1 second' where order_id = $1`, [C.o]);
const expC = await W.verify(C.a, codeC);
ok("an expired code is refused as expired, the order stays undelivered and no try is used", expC.ok === false && expC.code === "OTP_EXPIRED" && expC.attempts_left === 5 && (await W.sec(C.o)).otp_attempts === 0 && (await W.order(C.o)).status === "out_for_delivery");
ok("the rider's screen stops calling it live", (await W.state(C.a)).sms.live === false);
const revC = await W.reveal(C.o);
await as(null); await q(`update order_secrets set app_expires_at = now() - interval '1 second' where order_id = $1`, [C.o]);
ok("the on-screen code expires the same way", (await W.verify(C.a, revC.code)).code === "OTP_EXPIRED" && (await (async () => { await as(CUST); return fnv(`public.customer_delivery_code($1::uuid, false)`, [C.o]); })()).app.live === false);
const revC2 = await W.reveal(C.o);
ok("a new on-screen code replaces it and works", revC2.app.live === true && (await W.verify(C.a, revC2.code)).status === "delivered");

console.log("Resend");
const D = await W.onTheWay();
const oD = await W.order(D.o);
await as(RIDER1);
ok("no resend before the rider has reached the customer", (await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [D.a])).code === "OTP_NOT_ARRIVED" && (await W.codeNotes(D.o)).length === 0);
await W.arrive(D.a);
const d1 = await sendOn(D.a); const codeD1 = codeIn(d1.texted[0]);
await as(RIDER1);
const wait = await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [D.a]);
ok("a resend straight away is refused with the seconds to wait, and nothing is sent", wait.ok === false && wait.code === "OTP_RESEND_WAIT" && wait.retry_in_seconds > 0 && wait.retry_in_seconds <= 60 && (await W.codeNotes(D.o)).length === 1 && (await sendOn(D.a)).texted.length === 0);
ok("the rider's screen shows the cooldown and what is left", (await W.state(D.a)).resend.retry_in_seconds > 0 && (await W.state(D.a)).resend.left === 3 && (await W.state(D.a)).resend.max === 3);
ok("another rider cannot ask for a resend", /FORBIDDEN/.test((await (async () => { await as(RIDER2); return err(`select public.rider_resend_delivery_otp($1::uuid)`, [D.a]); })()) ?? ""));
const cool = async (o) => { await as(null); await q(`update order_secrets set sms_requested_at = now() - interval '61 seconds' where order_id = $1`, [o]); };
await cool(D.o); await as(RIDER1);
const r1 = await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [D.a]);
let sD = await W.sec(D.o);
ok("after the cooldown the resend is accepted and the earlier SMS code is withdrawn at once", r1.ok === true && r1.requested === true && sD.sms_status === "pending" && sD.sms_code_hash === null && sD.sms_requests === 2);
const beforeTries = sD.otp_attempts;
const oldD = await W.verify(D.a, codeD1);
ok("the earlier code no longer completes the delivery", oldD.ok === false && (await W.order(D.o)).status === "out_for_delivery" && (await W.sec(D.o)).otp_attempts === beforeTries);
const d2 = await sendOn(D.a); const codeD2 = codeIn(d2.texted[0]);
ok("the resend sends one new SMS with a new hash", d2.out.status === "sent" && d2.texted.length === 1 && /^\d{4}$/.test(codeD2) && (await W.sec(D.o)).sms_code_hash === sha((await W.sec(D.o)).sms_code_salt, codeD2));
let notesD = await W.codeNotes(D.o);
ok("each request is its own line for staff and for the customer, neither with a code", notesD.length === 2 && notesD[1].data.kind === "resend" && notesD[1].title === "New delivery code requested"
  && notesD[1].body === `Your delivery partner asked for a new delivery code for order ${oD.order_number}. Use the newest SMS, or open your order to see a code. Share it only when the order is at your door.`
  && (await W.smsRows(D.o)).map((r) => `${r.kind}:${r.status}`).join(",") === "arrival:sent,resend:sent");
panel.answer = "108";
await cool(D.o); await as(RIDER1); await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [D.a]);
const d3 = await sendOn(D.a);
let rowsD = await W.smsRows(D.o);
ok("a refusal by the panel (108, no credits) is recorded as failed with its reason, never as sent", d3.out.status === "failed" && d3.texted.length === 1 && rowsD[2].status === "failed" && /108/.test(rowsD[2].error) && /Low credits/.test(rowsD[2].error) && rowsD[2].provider_id === null && (await W.sec(D.o)).sms_status === "failed");
ok("the refusal's record does not contain the code that was in the refused SMS", /^\d{4}$/.test(codeIn(d3.texted[0]) ?? "") && !rowsD[2].error.includes(codeIn(d3.texted[0])));
ok("the rider is told it could not be sent", (await W.state(D.a)).sms.status === "failed");
ok("a failed send is not retried by itself", (await sendOn(D.a)).texted.length === 0 && (await sendOn(D.a)).out.status === "held");
panel.answer = "7770004"; panel.delayMs = 400;
await cool(D.o); await as(RIDER1); await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [D.a]);
const d4 = await sender(W, ENV_ON, 80)(D.a);
panel.delayMs = 0;
ok("a panel that does not answer in time is recorded as not sent, never as sent", d4.out.status === "failed" && /did not answer in time/.test(d4.out.detail) && (await W.sec(D.o)).sms_status === "failed" && (await W.smsRows(D.o))[3].status === "failed");
await cool(D.o); await as(RIDER1);
const capped = await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [D.a]);
ok("the resend cap holds: after three resends no more are accepted", capped.ok === false && capped.code === "OTP_RESEND_LIMIT" && (await W.sec(D.o)).sms_requests === 4 && (await W.state(D.a)).resend.left === 0 && (await W.codeNotes(D.o)).length === 4);
await new Promise((r) => setTimeout(r, 450));
const revD = await W.reveal(D.o);
ok("the customer's own screen still completes the delivery after every SMS has failed", (await W.verify(D.a, revD.code)).status === "delivered");

console.log("Two requests at once, and a send that never reported back");
const E = await W.onTheWay();
await W.arrive(E.a);
const hitsE = panel.hits.length;
const both = await Promise.all([sendOn(E.a), sendOn(E.a)]);
ok("two overlapping runs for one request send exactly one SMS", panel.hits.length === hitsE + 1 && both.filter((b) => b.out.status === "sent").length === 1 && both.filter((b) => b.out.status === "held").length === 1);
await cool(E.o); await as(RIDER1); await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [E.a]);
await as(null);
const claimE = await fnv(`public.delivery_otp_claim($1::uuid)`, [E.a]);
ok("a claim hands the server a code and a number, once", claimE.send === true && /^\d{4}$/.test(claimE.code) && /^[6-9]\d{9}$/.test(claimE.mobile) && (await fnv(`public.delivery_otp_claim($1::uuid)`, [E.a])).reason === "in_flight");
ok("while the panel has not answered the rider sees 'sending', not 'sent'", (await W.state(E.a)).sms.status === "queued");
await as(RIDER1);
ok("a resend while one is on its way is refused", (await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [E.a])).code === "OTP_SEND_IN_PROGRESS");
await as(null); await q(`update order_secrets set sms_status_at = now() - interval '61 seconds', sms_requested_at = now() - interval '61 seconds' where order_id = $1`, [E.o]);
ok("a send that never reported back stops reading as 'sending': it is shown as not sent", (await W.state(E.a)).sms.status === "failed");
await as(RIDER1);
const reE = await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [E.a]);
ok("and the rider can ask again, which closes the interrupted one for staff", reE.ok === true && (await W.smsRows(E.o)).some((r) => r.status === "failed" && /interrupted/.test(r.error ?? "")));
ok("a late 'sent' for a request nobody claimed is not accepted", (await (async () => { await as(null); return fnv(`public.delivery_otp_record($1::uuid, 'sent', '999', null)`, [E.a]); })()).ok === false && (await W.sec(E.o)).sms_status === "pending");

console.log("Attempt limit");
const revE = await W.reveal(E.o);
const badE = wrongOf(revE.code, claimE.code);
await q(`delete from notifications where type = 'delivery_failed'`);
const tries = []; for (let i = 0; i < 5; i++) tries.push(await W.verify(E.a, badE));
ok("five wrong codes: the tries count down and the fifth locks the code", tries.map((t) => t.attempts_left).join(",") === "4,3,2,1,0" && tries[3].locked === false && tries[4].locked === true && tries.every((t) => t.ok === false && t.code === "OTP_INCORRECT"));
const lockedE = await W.verify(E.a, revE.code);
ok("once locked, even the right code does not deliver", lockedE.ok === false && lockedE.code === "OTP_LOCKED" && lockedE.locked === true && (await W.order(E.o)).status === "out_for_delivery");
const lockAudit = await q(`select after_data from audit_logs where action = 'delivery.otp_locked' and entity_id = $1`, [E.o]);
ok("the lock is audited with who and how many tries, and no code", lockAudit.length === 1 && JSON.stringify(Object.keys(lockAudit[0].after_data).sort()) === JSON.stringify(["assignment_id", "attempts", "rider_id"]) && lockAudit[0].after_data.attempts === 5);
ok("the admins are told once", (await one(`select count(*)::int n from notifications where type = 'delivery_failed' and title like 'Delivery code locked:%' and data ->> 'order_id' = $1`, [E.o])).n === admins);
await W.verify(E.a, badE);
ok("further tries tell nobody again and count nothing more", (await one(`select count(*)::int n from notifications where type = 'delivery_failed' and data ->> 'order_id' = $1`, [E.o])).n === admins && (await W.sec(E.o)).otp_attempts === 5);
const hashE = (await W.sec(E.o)).app_code_hash;
const lockedReveal = await W.reveal(E.o);
ok("a locked order gives the customer no new code and the rider no resend or SMS", lockedReveal.locked === true && (lockedReveal.code ?? null) === null && (await W.sec(E.o)).app_code_hash === hashE
  && (await (async () => { await cool(E.o); await as(RIDER1); return fnv(`public.rider_resend_delivery_otp($1::uuid)`, [E.a]); })()).code === "OTP_LOCKED" && (await sendOn(E.a)).texted.length === 0 && (await W.state(E.a)).locked === true);
await as(ADMIN);
ok("support can still complete the handover, as before", (await fnv(`public.admin_confirm_delivery($1::uuid, 'Customer confirmed on a call that the bag was received', true)`, [E.o])).status === "delivered" && (await W.sec(E.o)).app_code_hash === null);

console.log("Cancellation");
const F = await W.onTheWay();
await W.arrive(F.a);
const codeF = codeIn((await sendOn(F.a)).texted[0]);
const revF = await W.reveal(F.o);
ok("an order at the door has two live codes: the SMS one and the on-screen one", (await W.sec(F.o)).sms_code_hash !== null && (await W.sec(F.o)).app_code_hash !== null);
await cool(F.o); await as(RIDER1); await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [F.a]);
await as(ADMIN); await q(`select public.cancel_order($1::uuid, 'Customer asked to cancel at the door')`, [F.o]);
let sF = await W.sec(F.o);
ok("cancelling the order withdraws every live code", (await W.order(F.o)).status === "cancelled" && sF.sms_code_hash === null && sF.app_code_hash === null);
const hitsF = panel.hits.length;
const afterCancel = await sendOn(F.a);
ok("a request that was still waiting is closed, not sent, once the order is cancelled", afterCancel.out.status === "held" && panel.hits.length === hitsF && (await W.sec(F.o)).sms_status === "failed" && /no longer in progress/.test((await W.smsRows(F.o)).at(-1).error ?? ""));
ok("neither code completes a cancelled order", /INVALID_STATE/.test((await (async () => { await as(RIDER1); return err(`select public.verify_delivery_otp($1::uuid, $2, true)`, [F.a, codeF]); })()) ?? "") && /INVALID_STATE/.test((await (async () => { await as(RIDER1); return err(`select public.verify_delivery_otp($1::uuid, $2, true)`, [F.a, revF.code]); })()) ?? "") && (await W.order(F.o)).status === "cancelled");
ok("and nobody can mark arrival, resend or open a code for it", /INVALID_STATE/.test((await W.arrive(F.a)) ?? "") && /INVALID_STATE/.test((await (async () => { await as(RIDER1); return err(`select public.rider_resend_delivery_otp($1::uuid)`, [F.a]); })()) ?? "") && (await W.reveal(F.o)).available === false);

console.log("Reassignment to another rider");
const G = await W.onTheWay();
await W.arrive(G.a);
const codeG1 = codeIn((await sendOn(G.a)).texted[0]);
const revG1 = await W.reveal(G.o);
await as(RIDER1); await q(`select public.rider_report_failed_delivery($1::uuid, 'customer_unreachable', 'Called three times')`, [G.a]);
let sG = await W.sec(G.o);
ok("a failed attempt withdraws the codes made for that rider", (await W.order(G.o)).status === "ready_for_pickup" && sG.sms_code_hash === null && sG.app_code_hash === null);
await as(ADMIN); await q(`select public.admin_assign_rider($1::uuid, $2::uuid)`, [G.o, W.riderId[RIDER2]]);
await as(RIDER2);
const g2 = (await one(`select id, status from delivery_assignments where order_id = $1 and rider_id = $2 and status in ('offered','accepted') order by created_at desc limit 1`, [G.o, W.riderId[RIDER2]]));
if (g2.status === "offered") await q(`select public.rider_respond_assignment($1::uuid, true)`, [g2.id]);
await q(`select public.rider_pickup($1::uuid)`, [g2.id]);
ok("the order is out again with the second rider", (await W.order(G.o)).status === "out_for_delivery" && g2.id !== G.a);
const staleSms = await W.verify(g2.id, codeG1, RIDER2), staleApp = await W.verify(g2.id, revG1.code, RIDER2);
ok("the first rider's codes do not work for the second rider, and use up none of their tries", staleSms.ok === false && staleApp.ok === false && staleSms.code === "OTP_NOT_ISSUED" && (await W.sec(G.o)).otp_attempts === 0 && (await W.order(G.o)).status === "out_for_delivery");
ok("the first rider can do nothing more on it", /INVALID_STATE|FORBIDDEN/.test((await (async () => { await as(RIDER1); return err(`select public.verify_delivery_otp($1::uuid, $2, true)`, [G.a, codeG1]); })()) ?? "") && /FORBIDDEN/.test((await (async () => { await as(RIDER1); return err(`select public.verify_delivery_otp($1::uuid, $2, true)`, [g2.id, codeG1]); })()) ?? "")
  && /INVALID_STATE/.test((await W.arrive(G.a, RIDER1)) ?? "") && /FORBIDDEN/.test((await W.arrive(g2.id, RIDER1)) ?? ""));
const hitsG = panel.hits.length;
ok("the old assignment can no longer be given an SMS", (await sendOn(G.a)).out.status === "held" && panel.hits.length === hitsG);
await W.arrive(g2.id, RIDER2);
sG = await W.sec(G.o);
ok("the second rider's arrival starts clean: its own request, a fresh resend allowance", sG.otp_assignment_id === g2.id && sG.sms_requests === 1 && sG.sms_status === "pending" && (await W.state(g2.id, RIDER2)).resend.left === 3);
const g2send = await sendOn(g2.id); const codeG2 = codeIn(g2send.texted[0]);
ok("and its own code, which delivers", g2send.out.status === "sent" && (await W.verify(g2.id, codeG2, RIDER2)).status === "delivered" && (await W.order(G.o)).status === "delivered");

console.log("Switched off, and no usable number");
const H = await W.onTheWay();
await as(null); await q(`update settings set value = 'false'::jsonb where key = 'delivery_otp_sms_enabled'`);
await W.arrive(H.a);
const hitsH = panel.hits.length;
const offH = await sendOn(H.a);
ok("with 'Delivery code: send by SMS' off in Settings nothing is sent, and it is recorded as such", offH.out.status === "held" && panel.hits.length === hitsH && (await W.sec(H.o)).sms_status === "unavailable" && /switched off in Settings/.test((await W.smsRows(H.o))[0].error) && (await W.sec(H.o)).sms_code_hash === null);
await q(`update settings set value = 'true'::jsonb where key = 'delivery_otp_sms_enabled'`);
ok("the customer's screen still completes it", (await W.verify(H.a, (await W.reveal(H.o)).code)).status === "delivered");
const I = await W.onTheWay();
await as(null); await q(`update orders set address_snapshot = address_snapshot || '{"phone":"12345"}'::jsonb where id = $1`, [I.o]); await q(`update profiles set phone = null where id = $1`, [CUST]);
await W.arrive(I.a);
const noNum = await sendOn(I.a);
ok("no Indian mobile number on the address or the profile: recorded as no number, the panel is not called", noNum.out.status === "held" && noNum.texted.length === 0 && (await W.sec(I.o)).sms_status === "no_recipient" && (await W.smsRows(I.o))[0].status === "no_recipient" && (await W.sec(I.o)).sms_code_hash === null);
await as(null); await q(`update orders set address_snapshot = address_snapshot || '{"phone":"+91 98765 00002"}'::jsonb where id = $1`, [I.o]);
ok("the customer's screen still completes it", (await W.verify(I.a, (await W.reveal(I.o)).code)).status === "delivered");

console.log("An order already at the door when the migration lands");
const J = await W.onTheWay();
await as(null); await q(`update delivery_assignments set arrived_customer_at = now() - interval '2 minutes' where id = $1`, [J.a]);
ok("it has no request yet, and the rider's screen says no SMS was sent", (await W.state(J.a)).arrived === true && (await W.state(J.a)).sms.status === null);
await as(RIDER1);
const firstJ = await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [J.a]);
const jSend = await sendOn(J.a);
ok("the rider's 'send code' is its first send, not counted as a resend", firstJ.ok === true && (await W.sec(J.o)).sms_requests === 1 && jSend.out.status === "sent" && (await W.state(J.a)).resend.left === 3);
ok("which delivers", (await W.verify(J.a, codeIn(jSend.texted[0]))).status === "delivered");

console.log("A request the server never picked up");
const M = await W.onTheWay();
await W.arrive(M.a);
ok("straight after arrival the rider sees 'sending'", (await W.state(M.a)).sms.status === "pending");
await as(null); await q(`update order_secrets set sms_status_at = now() - interval '61 seconds', sms_requested_at = now() - interval '61 seconds' where order_id = $1`, [M.o]);
ok("after a minute with no server to send it, the rider and the customer are told it was not sent", (await W.state(M.a)).sms.status === "failed" && (await (async () => { await as(CUST); return fnv(`public.customer_delivery_code($1::uuid, false)`, [M.o]); })()).sms.status === "failed");
await as(RIDER1);
const againM = await fnv(`public.rider_resend_delivery_otp($1::uuid)`, [M.a]);
const mSend = await sendOn(M.a);
ok("the rider's tap sends that same request: one SMS, not counted as a resend, no second notification", againM.ok === true && againM.requested === false && mSend.out.status === "sent" && mSend.texted.length === 1 && (await W.sec(M.o)).sms_requests === 1 && (await W.codeNotes(M.o)).length === 1);
ok("which delivers", (await W.verify(M.a, codeIn(mSend.texted[0]))).status === "delivered");

console.log("Totals for staff");
await as(ADMIN);
const log = await fnv(`public.admin_delivery_code_log(50)`);
ok("the log lists every request with its real outcome", ["sent", "failed", "unavailable", "no_recipient"].every((s) => log.recent.some((r) => r.status === s)) && log.summary.failed_24h >= 2 && log.summary.not_sent_24h >= 2 && log.summary.sent_24h >= 5);
ok("no plain code is stored anywhere after all of this", (await one(`select count(*)::int n from order_secrets where delivery_otp is not null`)).n === 0);
ok("every SMS the panel saw was on the delivery template", panel.hits.length > 0 && panel.hits.every((h) => h.templateid === ENV_ON.PARKEN_DELIVERY_OTP_TEMPLATE_ID && /^\d{4} is the delivery code for your Merta Deal order\./.test(h.sms)));
ok("0058 is present in this database: one outcome row per notification, channel and event", (await one(`select count(*)::int n from information_schema.columns where table_name = 'notification_deliveries' and column_name = 'event_key'`)).n === 1);
await main.db.close();

/* ====================================================================================================== */
console.log("The same flow on a database without 0058 (production today)");
const bare = await boot({ skip: ["0058_"] });
const X = await world(bare.db);
const sendX = sender(X, ENV_ON), sendXToday = sender(X, ENV_TODAY);
ok("0058 is not there", (await X.one(`select count(*)::int n from information_schema.columns where table_name = 'notification_deliveries' and column_name = 'event_key'`)).n === 0 && (await X.one(`select count(*)::int n from pg_proc where proname = 'rider_alert_claim'`)).n === 0);
const K = await X.onTheWay();
await X.arrive(K.a); await X.arrive(K.a);
const hitsK = panel.hits.length;
const kToday = await sendXToday(K.a);
ok("unconfigured: recorded as unavailable, nothing sent", kToday.out.status === "unavailable" && panel.hits.length === hitsK && (await X.smsRows(K.o))[0].status === "unavailable");
ok("the customer's screen completes it", (await X.verify(K.a, (await X.reveal(K.o)).code)).status === "delivered");
const L = await X.onTheWay();
await X.arrive(L.a);
const lSend = await sendX(L.a); const codeL = codeIn(lSend.texted[0]);
ok("configured: one SMS, recorded as sent with the panel's id", lSend.out.status === "sent" && lSend.texted.length === 1 && (await X.smsRows(L.o))[0].status === "sent" && (await sendX(L.a)).texted.length === 0);
await X.as(null); await X.q(`update order_secrets set sms_requested_at = now() - interval '61 seconds' where order_id = $1`, [L.o]);
await X.as(RIDER1); await X.fnv(`public.rider_resend_delivery_otp($1::uuid)`, [L.a]);
const lSend2 = await sendX(L.a);
ok("a resend is a second line with its own outcome", lSend2.out.status === "sent" && (await X.smsRows(L.o)).map((r) => `${r.kind}:${r.status}`).join(",") === "arrival:sent,resend:sent");
ok("the withdrawn code fails, the new one delivers and history is written", (codeL === codeIn(lSend2.texted[0]) || (await X.verify(L.a, codeL)).ok === false) && (await X.verify(L.a, codeIn(lSend2.texted[0]))).status === "delivered"
  && (await X.one(`select count(*)::int n from order_status_history where order_id = $1 and status = 'delivered'`, [L.o])).n === 1);
await X.as(ADMIN);
ok("the staff log reads the same", (await X.fnv(`public.admin_delivery_code_log(12)`)).recent.length === 3);
await bare.db.close();

panelServer.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
