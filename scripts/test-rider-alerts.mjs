// Rider alerts (0058): a delivery request reaches the right rider once per channel, nothing stale is sent
// after a reassignment, unassignment, expiry, another rider's accept or a cancellation, one "no longer
// yours" notice per assignment, duplicate prevention under repeated and overlapping sends, the SMS opt-in,
// unconfigured channels recorded as unavailable, minimal payloads, who may call what, and the admin reads.
//
// The database half runs in PGlite with every migration + seed. The sender is the app's own loop
// (src/lib/notifications/rider-alerts-core.ts, loaded directly) with STUB providers: a fake push service
// that records what it was handed, and a stand-in for the SMS panel on 127.0.0.1 that the app's real SMS
// code (src/lib/sms/otp-sms.ts) talks to. Nothing here reaches a real push service, the real SMS panel or
// a real rider. Run from the project folder (Node 24: loads the .ts files directly):
//   node scripts/test-rider-alerts.mjs "$PWD"
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const root = process.argv[2] ?? process.cwd();
const core = await import(pathToFileURL(path.join(root, "src/lib/notifications/rider-alerts-core.ts")).href);
const smsLib = await import(pathToFileURL(path.join(root, "src/lib/sms/otp-sms.ts")).href);

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
// Applying 0058 a second time must be harmless (it is written to be re-runnable).
await exec("0058 again", read("supabase/migrations/0058_rider_alerts.sql"));
console.log(`loaded ${migrations.length} migrations + seed, 0058 applied twice`);

let pass = 0, fail = 0;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); } };
const as = async (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
const err = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
const fnv = async (sql, params) => (await one(`select ${sql} as r`, params)).r;
const ADMIN = "10000000-0000-4000-8000-000000000001";
const CUST = "30000000-0000-4000-8000-000000000002", RIDER1 = "40000000-0000-4000-8000-000000000001", RIDER2 = "40000000-0000-4000-8000-000000000002";

await q(`update settings set value = '{"open":"00:00","close":"23:59"}'::jsonb where key = 'business_hours'`);
await q(`update settings set value = 'true'::jsonb where key = 'business_open'`);
await q(`update settings set value = 'false'::jsonb where key = 'order_alert_require_accept'`);
await q(`update settings set value = 'true'::jsonb where key = 'dispatch_offer_all_riders'`);
await q(`update delivery_partners set is_online = false, current_lat = null, current_lng = null`);
await q(`update delivery_assignments set status = 'cancelled' where status in ('offered','accepted','picked_up')`);
await q(`update orders set status = 'cancelled' where status not in ('delivered','completed','cancelled','rejected')`);
await q(`delete from notifications`);
const addr = (await one(`select id from addresses where user_id = $1 order by is_default desc limit 1`, [CUST])).id;
const inv = (await one(`select id from inventory where stock_qty > 60 and selling_price between 100 and 400 order by selling_price limit 1`)).id;
const rider1Id = (await one(`select id from delivery_partners where user_id = $1`, [RIDER1])).id;
const rider2Id = (await one(`select id from delivery_partners where user_id = $1`, [RIDER2])).id;
const riderPhone = Object.fromEntries((await q(`select id, phone from profiles where id in ($1, $2)`, [RIDER1, RIDER2])).map((r) => [r.id, r.phone]));
const customer = await one(`select full_name, phone from profiles where id = $1`, [CUST]);

async function placeOrder(n = 2) {
  await as(CUST); await q(`select public.clear_cart()`);
  await q(`select public.add_to_cart($1::uuid, $2)`, [inv, n]);
  return (await fnv(`public.place_order($1::uuid, 'cod'::public.payment_method, 'standard', null)`, [addr])).order_id;
}
async function packedOrder() { const id = await placeOrder(); await as(ADMIN); await q(`select public.fulfil_order($1::uuid, 'ready')`, [id]); await as(null); return id; }
const online = async (uid, lat = 26.648, lng = 74.0325) => { await as(uid); await q(`select public.rider_set_online(true, $1, $2)`, [lat, lng]); await as(null); };
const offline = async (uid) => { await as(uid); await q(`select public.rider_set_online(false)`); await as(null); };
const allOffline = async () => { await q(`update delivery_partners set is_online = false`); };
const orderRow = async (id) => one(`select order_number, status, total, address_snapshot from orders where id = $1`, [id]);
const openOffer = async (riderId, orderId) => one(`select id, status, expires_at from delivery_assignments where rider_id = $1 and order_id = $2 and status = 'offered' order by created_at desc limit 1`, [riderId, orderId]);
const notes = async (uid, type, orderId) => q(`select id, title, body, data, sent_push, channels from notifications where user_id = $1 and type = $2 and ($3::text is null or data ->> 'order_id' = $3) order by created_at`, [uid, type, orderId ?? null]);
const deliveries = async (notificationId) => q(`select channel::text as channel, event_key, status, attempts, provider_id, error from notification_deliveries where notification_id = $1 order by created_at, channel`, [notificationId]);
const delivery = async (notificationId, channel, eventKey) => one(`select status, attempts, provider_id, error, updated_at from notification_deliveries where notification_id = $1 and channel = $2::public.notification_channel and event_key = $3`, [notificationId, channel, eventKey]);
async function finish(orderId) { await as(ADMIN); await err(`select public.cancel_order($1::uuid, 'harness: done')`, [orderId]); await as(null); await q(`update notifications set sent_push = true where not sent_push`); }

// ---- Stub providers --------------------------------------------------------------------------
// The push service: who has a device, what it answers, and everything it was handed.
const pushStub = { configured: true, devices: new Set([RIDER1, RIDER2]), failWith: null, calls: [] };
// The SMS panel stand-in: answers like the real one (a bare number), and keeps every request it saw.
const panel = { answer: "5550001", hits: [] };
const panelServer = createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  panel.hits.push(Object.fromEntries(u.searchParams));
  res.writeHead(200, { "Content-Type": "text/plain" }); res.end(panel.answer);
});
await new Promise((r) => panelServer.listen(0, "127.0.0.1", r));
const panelUrl = `http://127.0.0.1:${panelServer.address().port}/api/smsapi`;
const ALERT_TEMPLATE = "New delivery request for order {order} on Merta Deal Rider. Open the rider app. -MERTA DEAL";
const SMS_ENV_ON = { PARKEN_SMS_API_URL: panelUrl, PARKEN_SMS_KEY: "0123456789abcdef0123456789abcdef", PARKEN_SMS_SENDER: "MRTDEL", PARKEN_SMS_TEMPLATE_ID: "1007000000000000001", PARKEN_SMS_TEMPLATE: "{otp} is your Merta Deal login code. -MERTA DEAL",
  PARKEN_RIDER_ALERT_TEMPLATE_ID: "1007000000000000002", PARKEN_RIDER_ALERT_TEMPLATE: ALERT_TEMPLATE, PARKEN_RIDER_ALERT_ROUTE: "2" };
// What the server has today: the login OTP settings only.
const SMS_ENV_TODAY = { PARKEN_SMS_API_URL: panelUrl, PARKEN_SMS_KEY: SMS_ENV_ON.PARKEN_SMS_KEY, PARKEN_SMS_SENDER: "MRTDEL", PARKEN_SMS_TEMPLATE_ID: SMS_ENV_ON.PARKEN_SMS_TEMPLATE_ID, PARKEN_SMS_TEMPLATE: SMS_ENV_ON.PARKEN_SMS_TEMPLATE };
let smsEnv = SMS_ENV_TODAY;

// The same ports the app wires (src/lib/notifications/rider-alerts.ts), on PGlite and the stubs. Every
// database call is made with no user, as the service role is.
const ports = {
  async queue(limit, orderId) { await as(null); return fnv(`public.rider_alert_queue($1, $2::uuid)`, [limit, orderId]); },
  async claim(id, channel) { await as(null); return fnv(`public.rider_alert_claim($1::uuid, $2::public.notification_channel)`, [id, channel]); },
  async record(id, channel, status, providerId, error, eventKey) { await as(null); await fnv(`public.rider_alert_record($1::uuid, $2::public.notification_channel, $3, $4, $5, $6)`, [id, channel, status, providerId, error, eventKey]); },
  channels: {
    push: {
      configured: () => pushStub.configured,
      unavailableReason: () => "Web Push is not configured on the server (VAPID keys).",
      async send(grant, message) {
        pushStub.calls.push({ userId: grant.user_id, message, grant });
        if (pushStub.failWith) return { status: "failed", detail: pushStub.failWith };
        if (!pushStub.devices.has(grant.user_id)) return { status: "no_recipient", detail: "The rider has not enabled push on any device." };
        return { status: "sent", providerId: "1 device" };
      },
    },
    sms: {
      configured: () => smsLib.riderAlertSmsMissing(smsEnv).length === 0,
      unavailableReason: () => `Rider SMS alerts are not configured on the server (${smsLib.riderAlertSmsMissing(smsEnv).join(", ")}).`,
      async send(grant) {
        const mobile = smsLib.indianMobile((await one(`select phone from profiles where id = $1`, [grant.user_id]))?.phone ?? "");
        if (!mobile) return { status: "no_recipient", detail: "No Indian mobile number on the rider's profile." };
        const res = await smsLib.sendRiderAlertSms(smsLib.riderAlertSmsConfig(smsEnv), mobile, grant.order_number);
        return res.ok ? { status: "sent", providerId: res.messageId } : { status: "failed", detail: `SMS panel${res.code ? ` ${res.code}` : ""}: ${res.reason}` };
      },
    },
  },
};
const sweep = async (orderId) => { const before = { push: pushStub.calls.length, sms: panel.hits.length }; const summary = await core.runRiderAlerts(ports, { orderId: orderId ?? null }); return { summary, pushed: pushStub.calls.slice(before.push), texted: panel.hits.slice(before.sms) }; };
// Nothing that identifies the customer or the money may be in what leaves the server.
const leaks = (text, o) => {
  const a = o.address_snapshot ?? {};
  const secrets = [customer.phone, customer.full_name, a.phone, a.name, a.house, a.street, a.area, a.landmark, String(Number(o.total))].filter((s) => typeof s === "string" && s.trim().length >= 3);
  return secrets.filter((s) => text.toLowerCase().includes(s.toLowerCase())).concat(/₹|\brs\.?\s*\d|\b[6-9]\d{9}\b/i.test(text) ? ["amount or phone pattern"] : []);
};

// ================================================================================================
console.log("A request alerts the rider it was offered to, once per channel");
await online(RIDER1);
const o1 = await packedOrder(); const O1 = await orderRow(o1);
const a1 = await openOffer(rider1Id, o1);
const n1 = await notes(RIDER1, "delivery_offer", o1);
ok("the online rider holds the offer and one request notification", Boolean(a1) && n1.length === 1 && n1[0].data.assignment_id === a1.id);
ok("the offline rider has neither an offer nor a notification", !(await openOffer(rider2Id, o1)) && (await notes(RIDER2, "delivery_offer", o1)).length === 0);
ok("the stored payload carries ids and the order number only", JSON.stringify(Object.keys(n1[0].data).sort()) === JSON.stringify(["assignment_id", "offers", "order_id", "order_number"]) && leaks(JSON.stringify(n1[0].data), O1).length === 0, JSON.stringify(n1[0].data));
ok("it waits for delivery and asks for push", n1[0].sent_push === false && n1[0].channels.includes("push"));
await as(null);
ok("the queue lists it for the sender", (await fnv(`public.rider_alert_queue(50, null)`)).some((x) => x.id === n1[0].id && x.type === "delivery_offer"));
const s1 = await sweep();
ok("one push goes to that rider and nobody else", s1.pushed.length === 1 && s1.pushed[0].userId === RIDER1 && s1.summary.channels.push.sent === 1);
const m1 = s1.pushed[0].message;
ok("the push is a short title, the order number and a path with ids only", m1.title === "New delivery request" && m1.body.includes(O1.order_number) && m1.url === `/rider?a=${a1.id}` && m1.type === "delivery_offer" && JSON.stringify(Object.keys(m1.data).sort()) === JSON.stringify(["assignment_id", "order_id"]));
ok("no customer name, phone, address or amount is in the push", leaks(JSON.stringify(m1), O1).length === 0, leaks(JSON.stringify(m1), O1).join(", "));
ok("the push is dropped by the push service once the request has run out", m1.ttlSeconds > 0 && m1.ttlSeconds <= 180 && m1.sticky === true && m1.tag === `delivery-${o1}`);
const d1 = await delivery(n1[0].id, "push", `offer:${a1.id}`);
ok("the push outcome is recorded as sent with the provider's answer and one attempt", d1?.status === "sent" && d1.attempts === 1 && d1.provider_id === "1 device" && d1.error === null);
const d1s = await delivery(n1[0].id, "sms", `offer:${a1.id}`);
ok("SMS is recorded as unavailable (no approved alert template on the server) and nothing was sent to the panel", d1s?.status === "unavailable" && d1s.attempts === 0 && /PARKEN_RIDER_ALERT_TEMPLATE_ID/.test(d1s.error) && s1.texted.length === 0 && s1.summary.channels.sms.unavailable === 1);
ok("with every channel answered the row leaves the queue", (await one(`select sent_push from notifications where id = $1`, [n1[0].id])).sent_push === true && (await fnv(`public.rider_alert_queue(50, null)`)).length === 0);

console.log("Repeats, overlap and retries never send twice");
for (let i = 0; i < 3; i++) await sweep();
ok("three more sweeps send nothing", pushStub.calls.length === 1 && panel.hits.length === 0);
await q(`update notifications set sent_push = false where id = $1`, [n1[0].id]);
const again = await sweep();
ok("even with the row forced back into the queue the sent push is refused as already sent", again.pushed.length === 0 && again.summary.refusals.already_sent === 1);
ok("a direct second claim is refused too", (await fnv(`public.rider_alert_claim($1::uuid, 'push')`, [n1[0].id])).reason === "already_sent");
const lateFail = await fnv(`public.rider_alert_record($1::uuid, 'push', 'failed', null, 'retry after a lost response', $2)`, [n1[0].id, `offer:${a1.id}`]);
ok("a late failure report cannot overwrite a sent channel", lateFail.already === true && lateFail.status === "sent" && (await delivery(n1[0].id, "push", `offer:${a1.id}`)).status === "sent");
ok("there is exactly one outcome per channel for the event", (await deliveries(n1[0].id)).length === 2);
ok("the unique index is what enforces it", (await one(`select count(*)::int n from pg_indexes where tablename = 'notification_deliveries' and indexname = 'notification_deliveries_one_per_event_idx' and indexdef like '%UNIQUE%'`)).n === 1
  && /duplicate key/.test((await err(`insert into notification_deliveries (notification_id, channel, event_key, status) values ($1, 'push', $2, 'sent')`, [n1[0].id, `offer:${a1.id}`])) ?? ""));
await finish(o1);

const o2 = await packedOrder(); const a2 = await openOffer(rider1Id, o2); const n2 = (await notes(RIDER1, "delivery_offer", o2))[0];
const c1 = await fnv(`public.rider_alert_claim($1::uuid, 'push')`, [n2.id]);
const c2 = await fnv(`public.rider_alert_claim($1::uuid, 'push')`, [n2.id]);
ok("two workers at once: the first claim is granted, the second is told it is in flight", c1.send === true && c1.attempt === 1 && c2.send === false && c2.reason === "in_flight");
ok("the grant itself holds the order number and ids, nothing about the customer", c1.order_number === (await orderRow(o2)).order_number && c1.assignment_id === a2.id && leaks(JSON.stringify(c1), await orderRow(o2)).length === 0 && !("total" in c1) && !("address" in c1));
await q(`update notification_deliveries set updated_at = now() - interval '5 minutes' where notification_id = $1 and channel = 'push'`, [n2.id]);
const c3 = await fnv(`public.rider_alert_claim($1::uuid, 'push')`, [n2.id]);
ok("a push claim whose worker never reported back can be taken again and counts as a second attempt", c3.send === true && c3.attempt === 2);
const rec3 = await fnv(`public.rider_alert_record($1::uuid, 'push', 'failed', null, 'push service 500', $2)`, [n2.id, c3.event_key]);
ok("a provider failure is recorded as failed with its error, and the row stays queued for a retry", rec3.status === "failed" && rec3.attempts === 2 && rec3.done === false && (await delivery(n2.id, "push", `offer:${a2.id}`)).error === "push service 500" && (await one(`select sent_push from notifications where id = $1`, [n2.id])).sent_push === false);
pushStub.failWith = "push service 503";
const f1 = await sweep(o2);
ok("the retry is the third and last attempt (rider_alert_max_attempts = 3): failed again, with the latest answer", f1.pushed.length === 1 && (await delivery(n2.id, "push", `offer:${a2.id}`)).status === "failed" && (await delivery(n2.id, "push", `offer:${a2.id}`)).attempts === 3 && (await delivery(n2.id, "push", `offer:${a2.id}`)).error === "push service 503");
ok("at the limit the row is closed, failed, for staff to see", (await one(`select sent_push from notifications where id = $1`, [n2.id])).sent_push === true && (await fnv(`public.rider_alert_queue(50, $1::uuid)`, [o2])).length === 0);
await q(`update notifications set sent_push = false where id = $1`, [n2.id]);
const f2 = await sweep(o2);
ok("even forced back into the queue, nothing more is tried after the limit", f2.pushed.length === 0 && f2.summary.refusals.attempts_exhausted === 1 && (await delivery(n2.id, "push", `offer:${a2.id}`)).attempts === 3);
pushStub.failWith = null;
await finish(o2);

const o3 = await packedOrder(); const a3 = await openOffer(rider1Id, o3); const n3 = (await notes(RIDER1, "delivery_offer", o3))[0];
pushStub.failWith = "push service timeout"; await sweep(o3); pushStub.failWith = null;
const r3 = await sweep(o3);
const d3 = await delivery(n3.id, "push", `offer:${a3.id}`);
ok("a failed push is retried on the next sweep, then sent stays sent with the error cleared", r3.pushed.length === 1 && d3.status === "sent" && d3.attempts === 2 && d3.error === null);
pushStub.devices.delete(RIDER1);
const o3b = await packedOrder(); const n3b = (await notes(RIDER1, "delivery_offer", o3b))[0]; const a3b = await openOffer(rider1Id, o3b);
await sweep(o3b);
ok("a rider with no push device is recorded as no device, never as sent", (await delivery(n3b.id, "push", `offer:${a3b.id}`)).status === "no_recipient" && (await one(`select sent_push from notifications where id = $1`, [n3b.id])).sent_push === true);
pushStub.devices.add(RIDER1);
pushStub.configured = false;
const o3c = await packedOrder(); const n3c = (await notes(RIDER1, "delivery_offer", o3c))[0]; const a3c = await openOffer(rider1Id, o3c);
const u3 = await sweep(o3c);
ok("with push not configured nothing is claimed or sent, and the channel is recorded as unavailable", u3.pushed.length === 0 && u3.summary.channels.push.unavailable === 1 && (await delivery(n3c.id, "push", `offer:${a3c.id}`)).status === "unavailable" && (await delivery(n3c.id, "push", `offer:${a3c.id}`)).attempts === 0);
pushStub.configured = true;
await finish(o3); await finish(o3b); await finish(o3c);

// ================================================================================================
console.log("A request that ran out is not sent, and a re-offer is a new event on the same row");
const o4 = await packedOrder(); const a4 = await openOffer(rider1Id, o4); const n4 = (await notes(RIDER1, "delivery_offer", o4))[0];
await q(`update delivery_assignments set expires_at = now() - interval '1 second' where id = $1`, [a4.id]);
const e4 = await sweep(o4);
const d4 = await delivery(n4.id, "push", `offer:${a4.id}`);
ok("the expired request is skipped at the last moment, with the reason on record", e4.pushed.length === 0 && e4.summary.refusals.expired === 1 && d4.status === "skipped" && /^expired:/.test(d4.error) && d4.attempts === 0);
ok("a request that simply ran out raises no notice", (await notes(RIDER1, "delivery_cancelled", o4)).length === 0);
await as(null); await q(`select public.dispatch_pending()`);
const a4b = await openOffer(rider1Id, o4); const n4b = await notes(RIDER1, "delivery_offer", o4);
ok("the re-offer refreshes the one notification (offers = 2) instead of adding another", Boolean(a4b) && a4b.id !== a4.id && n4b.length === 1 && n4b[0].id === n4.id && Number(n4b[0].data.offers) === 2 && n4b[0].data.assignment_id === a4b.id && n4b[0].sent_push === false);
ok("and still no \"closed\" notice, because the same rider holds it again", (await notes(RIDER1, "delivery_cancelled", o4)).length === 0);
const e4b = await sweep(o4);
ok("the new offer is pushed once, pointing at the new assignment", e4b.pushed.length === 1 && e4b.pushed[0].message.url === `/rider?a=${a4b.id}`);
const all4 = await deliveries(n4.id);
ok("each offer keeps its own outcome on the same row (first skipped, second sent)", all4.filter((d) => d.channel === "push").length === 2 && all4.some((d) => d.event_key === `offer:${a4.id}` && d.status === "skipped") && all4.some((d) => d.event_key === `offer:${a4b.id}` && d.status === "sent"));
await sweep(o4); await sweep(o4);
ok("more sweeps do not push the re-offer again", pushStub.calls.filter((c) => c.message.url === `/rider?a=${a4b.id}`).length === 1);
// The old event's late answer must not close the row for a newer offer.
await q(`update delivery_assignments set expires_at = now() - interval '1 second' where id = $1`, [a4b.id]);
await q(`select public.dispatch_pending()`);
const a4c = await openOffer(rider1Id, o4);
const stale4 = await fnv(`public.rider_alert_record($1::uuid, 'sms', 'unavailable', null, 'late answer for the earlier offer', $2)`, [n4.id, `offer:${a4b.id}`]);
ok("an answer for an earlier offer does not close the row while a newer offer waits", stale4.done === false && (await one(`select sent_push from notifications where id = $1`, [n4.id])).sent_push === false);
ok("the third offer is still pushed", (await sweep(o4)).pushed.some((c) => c.message.url === `/rider?a=${a4c.id}`));
await finish(o4);

// ================================================================================================
console.log("Taken by another rider");
await online(RIDER2, 26.6482, 74.032);
const o5 = await packedOrder(); const O5 = await orderRow(o5);
const a5r1 = await openOffer(rider1Id, o5), a5r2 = await openOffer(rider2Id, o5);
const s5 = await sweep(o5);
ok("offer-everyone: both riders are pushed their own request, each to its own assignment", s5.pushed.length === 2 && s5.pushed.some((c) => c.userId === RIDER1 && c.message.url === `/rider?a=${a5r1.id}`) && s5.pushed.some((c) => c.userId === RIDER2 && c.message.url === `/rider?a=${a5r2.id}`));
await as(RIDER2); await q(`select public.rider_respond_assignment($1::uuid, true)`, [a5r2.id]); await as(null);
const rel5 = await notes(RIDER1, "delivery_cancelled", o5);
ok("the rider who lost the request gets one \"no longer yours\" notice, with the reason", rel5.length === 1 && rel5[0].data.reason === "taken" && rel5[0].data.assignment_id === a5r1.id && /Another rider accepted/.test(rel5[0].body));
ok("the rider who accepted gets none", (await notes(RIDER2, "delivery_cancelled", o5)).length === 0);
ok("the notice carries ids, the order number and the reason only", JSON.stringify(Object.keys(rel5[0].data).sort()) === JSON.stringify(["assignment_id", "order_id", "order_number", "reason"]) && leaks(rel5[0].title + rel5[0].body + JSON.stringify(rel5[0].data), O5).length === 0);
const s5b = await sweep(o5);
ok("it is pushed once to that rider only, replacing the request on the phone (same tag), and does not stay on screen", s5b.pushed.length === 1 && s5b.pushed[0].userId === RIDER1 && s5b.pushed[0].message.type === "delivery_cancelled" && s5b.pushed[0].message.tag === m1.tag.replace(o1, o5) && s5b.pushed[0].message.sticky === false && s5b.pushed[0].message.body.includes(O5.order_number) && leaks(JSON.stringify(s5b.pushed[0].message), O5).length === 0);
ok("a notice is never sent by SMS", (await deliveries(rel5[0].id)).every((d) => d.channel === "push") && (await fnv(`public.rider_alert_claim($1::uuid, 'sms')`, [rel5[0].id])).reason === "not_applicable");
await sweep(o5); await sweep(o5);
ok("further sweeps send nothing more about this order", pushStub.calls.filter((c) => c.message.tag === `delivery-${o5}`).length === 3);
await as(RIDER1);
const late5 = await fnv(`public.rider_respond_assignment($1::uuid, true)`, [a5r1.id]);
await as(null);
ok("a late tap on the lost request is told taken, and no second notice is written", late5.ok === false && late5.error === "OFFER_TAKEN" && (await notes(RIDER1, "delivery_cancelled", o5)).length === 1);
await q(`select public.notify_user($1::uuid, 'delivery_cancelled', 'dup', 'dup', jsonb_build_object('assignment_id', $2::uuid, 'order_id', $3::uuid))`, [RIDER1, a5r1.id, o5]);
ok("a repeated notice for the same rider and assignment is refused by the database", (await notes(RIDER1, "delivery_cancelled", o5)).length === 1);
await finish(o5);

const o6 = await packedOrder();
const a6r1 = await openOffer(rider1Id, o6), a6r2 = await openOffer(rider2Id, o6);
await as(RIDER2); await q(`select public.rider_respond_assignment($1::uuid, true)`, [a6r2.id]); await as(null);
const s6 = await sweep(o6);
const n6 = (await notes(RIDER1, "delivery_offer", o6))[0]; const rel6 = (await notes(RIDER1, "delivery_cancelled", o6))[0];
ok("taken before the sender ran: the losing rider is pushed nothing at all", s6.pushed.filter((c) => c.userId === RIDER1).length === 0);
ok("the stale request is recorded as not sent because another rider took it", (await delivery(n6.id, "push", `offer:${a6r1.id}`)).status === "skipped" && /^taken:/.test((await delivery(n6.id, "push", `offer:${a6r1.id}`)).error));
ok("and the notice stays in the app only, since the phone was never told about the request", Boolean(rel6) && (await delivery(rel6.id, "push", `released:${a6r1.id}`)).status === "skipped" && /^request_never_pushed:/.test((await delivery(rel6.id, "push", `released:${a6r1.id}`)).error));
ok("the rider who accepted is not pushed a request they already hold", s6.pushed.filter((c) => c.userId === RIDER2).length === 0 && /^already_accepted:/.test((await delivery((await notes(RIDER2, "delivery_offer", o6))[0].id, "push", `offer:${a6r2.id}`)).error));
await finish(o6);

// ================================================================================================
console.log("Admin assignment and reassignment");
await allOffline();
const o7 = await packedOrder(); const O7 = await orderRow(o7);
ok("with no rider online nobody is offered or notified", (await one(`select count(*)::int n from delivery_assignments where order_id = $1`, [o7])).n === 0 && (await one(`select count(*)::int n from notifications where type = 'delivery_offer' and data ->> 'order_id' = $1`, [o7])).n === 0);
await as(ADMIN); const a7 = await fnv(`public.admin_assign_rider($1::uuid, $2::uuid)`, [o7, rider1Id]); await as(null);
ok("the hand-picked rider gets the request notification, the other rider gets nothing", (await notes(RIDER1, "delivery_offer", o7)).length === 1 && (await notes(RIDER2, "delivery_offer", o7)).length === 0);
const s7 = await sweep(o7);
ok("and is the only one pushed", s7.pushed.length === 1 && s7.pushed[0].userId === RIDER1 && s7.pushed[0].message.url === `/rider?a=${a7}`);
await as(ADMIN); const a7b = await fnv(`public.admin_assign_rider($1::uuid, $2::uuid)`, [o7, rider2Id]); await as(null);
const rel7 = await notes(RIDER1, "delivery_cancelled", o7);
ok("reassigning to another rider tells the first rider once that the request was withdrawn", rel7.length === 1 && rel7[0].data.reason === "withdrawn" && rel7[0].data.assignment_id === a7);
const s7b = await sweep(o7);
ok("the new rider is pushed the request and the first rider only the notice, never the old request again", s7b.pushed.length === 2 && s7b.pushed.some((c) => c.userId === RIDER2 && c.message.type === "delivery_offer" && c.message.url === `/rider?a=${a7b}`) && s7b.pushed.some((c) => c.userId === RIDER1 && c.message.type === "delivery_cancelled") && !s7b.pushed.some((c) => c.userId === RIDER1 && c.message.type === "delivery_offer"));
ok("the notice names the order and nothing about the customer", s7b.pushed.find((c) => c.userId === RIDER1).message.body.includes(O7.order_number) && leaks(JSON.stringify(s7b.pushed.find((c) => c.userId === RIDER1).message), O7).length === 0);
await as(ADMIN); const a7c = await fnv(`public.admin_assign_rider($1::uuid, $2::uuid)`, [o7, rider2Id]); await as(null);
ok("assigning the same rider again raises no notice (they still hold it) and keeps one request row", (await notes(RIDER2, "delivery_cancelled", o7)).length === 0 && (await notes(RIDER2, "delivery_offer", o7)).length === 1);
const s7c = await sweep(o7);
ok("the fresh assignment is pushed once to that rider", s7c.pushed.length === 1 && s7c.pushed[0].userId === RIDER2 && s7c.pushed[0].message.url === `/rider?a=${a7c}`);

console.log("Unassignment");
await as(RIDER2); await q(`select public.rider_respond_assignment($1::uuid, true)`, [a7c]);
await as(ADMIN); const un7 = await fnv(`public.admin_unassign_rider($1::uuid, 'Rider did not reach the shop')`, [o7]); await as(null);
const rel7b = await notes(RIDER2, "delivery_cancelled", o7);
ok("the unassigned rider gets one notice and the order is offered to nobody (no rider online)", un7.ok === true && un7.reassigned_to === null && rel7b.length === 1 && rel7b[0].data.assignment_id === a7c);
const s7d = await sweep(o7);
const g7 = s7d.pushed.find((c) => c.userId === RIDER2);
ok("that rider is pushed \"no longer assigned to you\" once, and it stays on screen", s7d.pushed.length === 1 && g7.message.type === "delivery_cancelled" && /no longer assigned to you/.test(g7.message.body) && g7.message.sticky === true && g7.message.url === `/rider?a=${a7c}`);
await sweep(o7);
ok("it is not repeated", pushStub.calls.filter((c) => c.userId === RIDER2 && c.message.type === "delivery_cancelled" && c.message.tag === `delivery-${o7}`).length === 1);
await finish(o7);

await online(RIDER2, 26.6482, 74.032);
const o8 = await packedOrder(); const a8 = await openOffer(rider2Id, o8);
await as(RIDER2); await q(`select public.rider_respond_assignment($1::uuid, true)`, [a8.id]);
await as(ADMIN); const un8 = await fnv(`public.admin_unassign_rider($1::uuid, null)`, [o8]); await as(null);
const s8 = await sweep(o8);
ok("unassigned and offered straight back to the same rider: the notice is not pushed, the new request is", un8.reassigned_to !== null && s8.pushed.length === 1 && s8.pushed[0].userId === RIDER2 && s8.pushed[0].message.type === "delivery_offer" && s8.pushed[0].message.url === `/rider?a=${un8.reassigned_to}`
  && /^assigned_again:/.test((await delivery((await notes(RIDER2, "delivery_cancelled", o8))[0].id, "push", `released:${a8.id}`)).error));
await finish(o8);

// ================================================================================================
console.log("A rider who closes their own request is not told about it");
await online(RIDER1);
const o8b = await packedOrder(); const a8b = await openOffer(rider1Id, o8b);
await sweep(o8b);
await offline(RIDER1);
ok("going offline hands the request back without a \"no longer yours\" notice to that rider", (await one(`select status from delivery_assignments where id = $1`, [a8b.id])).status === "expired" && (await notes(RIDER1, "delivery_cancelled", o8b)).length === 0);
await as(RIDER2); const dec8 = await fnv(`public.rider_respond_assignment($1::uuid, false)`, [(await openOffer(rider2Id, o8b)).id]); await as(null);
ok("declining raises no notice either", dec8.status === "rejected" && (await notes(RIDER2, "delivery_cancelled", o8b)).length === 0);
await finish(o8b);

console.log("Order cancellation");
await online(RIDER1);
const o9 = await packedOrder();
await sweep(o9);
await as(ADMIN); await q(`select public.cancel_order($1::uuid, 'Customer changed their mind')`, [o9]); await as(null);
const rel9 = await notes(RIDER1, "delivery_cancelled", o9);
ok("cancelling an order with open requests tells each rider once", rel9.length === 1 && rel9[0].data.reason === "order_cancelled" && (await notes(RIDER2, "delivery_cancelled", o9)).length === 1);
const s9 = await sweep(o9);
ok("each is pushed the notice once and no request", s9.pushed.length === 2 && s9.pushed.every((c) => c.message.type === "delivery_cancelled" && /was cancelled/.test(c.message.body)) && new Set(s9.pushed.map((c) => c.userId)).size === 2);
ok("the cancellation reason typed by the admin is not in the rider's push", !s9.pushed.some((c) => /changed their mind/i.test(JSON.stringify(c.message))));

const o10 = await packedOrder(); const a10 = await openOffer(rider1Id, o10);
await as(ADMIN); await q(`select public.cancel_order($1::uuid, 'test')`, [o10]); await as(null);
const s10 = await sweep(o10);
ok("cancelled before the sender ran: no request and no notice reaches any phone", s10.pushed.length === 0 && /^order_cancelled:/.test((await delivery((await notes(RIDER1, "delivery_offer", o10))[0].id, "push", `offer:${a10.id}`)).error));

const o11 = await packedOrder(); const a11 = await openOffer(rider1Id, o11);
await as(RIDER1); await q(`select public.rider_respond_assignment($1::uuid, true)`, [a11.id]);
await as(ADMIN); await q(`select public.cancel_order($1::uuid, 'test')`, [o11]); await as(null);
const rel11 = await notes(RIDER1, "delivery_cancelled", o11);
const s11 = await sweep(o11);
const g11 = s11.pushed.find((c) => c.userId === RIDER1 && c.message.type === "delivery_cancelled");
ok("cancelling an accepted delivery tells its rider once, and the push says there is nothing to collect", rel11.length === 1 && Boolean(g11) && /No need to collect it/.test(g11.message.body) && g11.message.sticky === true);
ok("no stale request is pushed for it", !s11.pushed.some((c) => c.userId === RIDER1 && c.message.type === "delivery_offer"));
await as(null); await q(`update settings set value = '1'::jsonb where key = 'rider_alert_notice_minutes'`);
const o12 = await packedOrder(); const a12 = await openOffer(rider1Id, o12);
await as(RIDER1); await q(`select public.rider_respond_assignment($1::uuid, true)`, [a12.id]);
await as(ADMIN); await q(`select public.cancel_order($1::uuid, 'test')`, [o12]); await as(null);
await q(`update notifications set created_at = now() - interval '10 minutes' where type = 'delivery_cancelled' and data ->> 'order_id' = $1`, [o12]);
const s12 = await sweep(o12);
ok("a notice older than rider_alert_notice_minutes is not pushed", !s12.pushed.some((c) => c.message.type === "delivery_cancelled") && /^too_old:/.test((await delivery((await notes(RIDER1, "delivery_cancelled", o12))[0].id, "push", `released:${a12.id}`)).error));
await q(`update settings set value = '15'::jsonb where key = 'rider_alert_notice_minutes'`);
await q(`update notifications set sent_push = true where not sent_push`);

// ================================================================================================
console.log("SMS: only when configured and the rider has opted in");
ok("today's server settings (login OTP only) do not make rider SMS available", smsLib.riderAlertSmsMissing(SMS_ENV_TODAY).some((k) => k.startsWith("PARKEN_RIDER_ALERT_TEMPLATE_ID")) && smsLib.riderAlertSmsMissing(SMS_ENV_TODAY).some((k) => k.startsWith("PARKEN_RIDER_ALERT_ROUTE")));
ok("the login OTP template cannot be passed off as the alert template", smsLib.riderAlertSmsMissing({ ...SMS_ENV_ON, PARKEN_RIDER_ALERT_TEMPLATE: SMS_ENV_ON.PARKEN_SMS_TEMPLATE }).length > 0 && smsLib.riderAlertSmsMissing({ ...SMS_ENV_ON, PARKEN_RIDER_ALERT_TEMPLATE_ID: SMS_ENV_ON.PARKEN_SMS_TEMPLATE_ID }).length > 0);
ok("a template without {order} is refused", smsLib.riderAlertSmsMissing({ ...SMS_ENV_ON, PARKEN_RIDER_ALERT_TEMPLATE: "A delivery is waiting." }).length > 0);
ok("a complete alert configuration is accepted", smsLib.riderAlertSmsMissing(SMS_ENV_ON).length === 0);
ok("an order number that would not fit the template variable is refused before sending", smsLib.smsOrderNumber("MD2611001027") === "MD2611001027" && smsLib.smsOrderNumber("x".repeat(31)) === null && smsLib.smsOrderNumber("MD 1\n2") === null);

await allOffline(); await online(RIDER1);
await q(`update profiles set preferences = preferences || '{"rider_sms_alerts": true}'::jsonb where id = $1`, [RIDER1]);
const o13 = await packedOrder(); const a13 = await openOffer(rider1Id, o13); const n13 = (await notes(RIDER1, "delivery_offer", o13))[0];
const s13 = await sweep(o13);
ok("opted in but the server has no alert template: recorded unavailable, the panel is never called", s13.texted.length === 0 && (await delivery(n13.id, "sms", `offer:${a13.id}`)).status === "unavailable");
await finish(o13);

smsEnv = SMS_ENV_ON;
await q(`update profiles set preferences = preferences - 'rider_sms_alerts' where id = $1`, [RIDER1]);
const o14 = await packedOrder(); const a14 = await openOffer(rider1Id, o14); const n14 = (await notes(RIDER1, "delivery_offer", o14))[0];
const s14 = await sweep(o14);
ok("configured but the rider has not opted in: no SMS, recorded as not sent with that reason; push still goes", s14.texted.length === 0 && s14.pushed.length === 1 && (await delivery(n14.id, "sms", `offer:${a14.id}`)).status === "skipped" && /^sms_not_opted_in:/.test((await delivery(n14.id, "sms", `offer:${a14.id}`)).error));
await finish(o14);

await q(`update profiles set preferences = preferences || '{"rider_sms_alerts": true}'::jsonb where id = $1`, [RIDER1]);
await online(RIDER2, 26.6482, 74.032);
const o15 = await packedOrder(); const O15 = await orderRow(o15); const a15 = await openOffer(rider1Id, o15); const n15 = (await notes(RIDER1, "delivery_offer", o15))[0];
panel.answer = "5550015";
const s15 = await sweep(o15);
ok("opted in and configured: one SMS, to that rider's own number only (the other rider did not opt in)", s15.texted.length === 1 && s15.texted[0].number === riderPhone[RIDER1] && s15.texted[0].number !== riderPhone[RIDER2]);
ok("the SMS is the approved template with the order number, under the alert template's ID, sender and route", s15.texted[0].sms === ALERT_TEMPLATE.replace("{order}", O15.order_number) && s15.texted[0].templateid === SMS_ENV_ON.PARKEN_RIDER_ALERT_TEMPLATE_ID && s15.texted[0].sender === "MRTDEL" && s15.texted[0].route === "2");
ok("it never goes out under the login OTP template", s15.texted[0].templateid !== SMS_ENV_ON.PARKEN_SMS_TEMPLATE_ID && !/login code/.test(s15.texted[0].sms));
ok("no customer name, phone, address, amount or link with ids is in the SMS", leaks(s15.texted[0].sms, O15).length === 0 && !s15.texted[0].sms.includes(a15.id) && !s15.texted[0].sms.includes(o15));
const d15 = await delivery(n15.id, "sms", `offer:${a15.id}`);
ok("the panel's message id is recorded as the provider's answer", d15.status === "sent" && d15.provider_id === "5550015" && d15.attempts === 1);
await sweep(o15); await sweep(o15);
ok("the SMS is not sent again on later sweeps", panel.hits.filter((h) => h.sms.includes(O15.order_number)).length === 1);
await finish(o15);

await allOffline(); await online(RIDER1);
const o16 = await packedOrder(); const a16 = await openOffer(rider1Id, o16); const n16 = (await notes(RIDER1, "delivery_offer", o16))[0];
panel.answer = "108";
const s16 = await sweep(o16);
const d16 = await delivery(n16.id, "sms", `offer:${a16.id}`);
ok("a refusal by the panel (108, no credits) is recorded as failed with its reason, never as sent", s16.texted.length === 1 && d16.status === "failed" && /108/.test(d16.error) && /Low credits/.test(d16.error) && d16.provider_id === null);
await sweep(o16); await sweep(o16); const hits16 = panel.hits.length; await sweep(o16); await sweep(o16);
ok("retries stop at the attempt limit", (await delivery(n16.id, "sms", `offer:${a16.id}`)).attempts === 3 && panel.hits.length === hits16);
panel.answer = "5550017";
await finish(o16);

const o17 = await packedOrder(); const a17 = await openOffer(rider1Id, o17); const n17 = (await notes(RIDER1, "delivery_offer", o17))[0];
const g17 = await fnv(`public.rider_alert_claim($1::uuid, 'sms')`, [n17.id]);
await q(`update notification_deliveries set updated_at = now() - interval '5 minutes' where notification_id = $1 and channel = 'sms'`, [n17.id]);
const g17b = await fnv(`public.rider_alert_claim($1::uuid, 'sms')`, [n17.id]);
ok("an SMS send that never reported back is closed, not sent a second time", g17.send === true && g17b.send === false && g17b.reason === "interrupted" && (await delivery(n17.id, "sms", `offer:${a17.id}`)).status === "failed" && /cannot get it twice/.test((await delivery(n17.id, "sms", `offer:${a17.id}`)).error));
await finish(o17);

await q(`update settings set value = 'false'::jsonb where key = 'rider_sms_alerts_enabled'`);
const o18 = await packedOrder(); const a18 = await openOffer(rider1Id, o18); const n18 = (await notes(RIDER1, "delivery_offer", o18))[0];
const s18 = await sweep(o18);
ok("the owner's switch in Settings stops rider SMS whatever the rider chose", s18.texted.length === 0 && /^sms_switched_off:/.test((await delivery(n18.id, "sms", `offer:${a18.id}`)).error));
await q(`update settings set value = 'true'::jsonb where key = 'rider_sms_alerts_enabled'`);
await finish(o18);

await q(`update profiles set phone = null where id = $1`, [RIDER1]);
const o19 = await packedOrder(); const a19 = await openOffer(rider1Id, o19); const n19 = (await notes(RIDER1, "delivery_offer", o19))[0];
const s19 = await sweep(o19);
ok("an opted-in rider with no mobile number is recorded as no number, and the panel is not called", s19.texted.length === 0 && (await delivery(n19.id, "sms", `offer:${a19.id}`)).status === "no_recipient");
await q(`update profiles set phone = $2 where id = $1`, [RIDER1, riderPhone[RIDER1]]);
await finish(o19);

const o20 = await packedOrder(); const a20 = await openOffer(rider1Id, o20); const n20 = (await notes(RIDER1, "delivery_offer", o20))[0];
await q(`update delivery_assignments set expires_at = now() - interval '1 second' where id = $1`, [a20.id]);
const s20 = await sweep(o20);
ok("an expired request is not sent by SMS either", s20.texted.length === 0 && /^expired:/.test((await delivery(n20.id, "sms", `offer:${a20.id}`)).error));
await finish(o20);
smsEnv = SMS_ENV_TODAY;
await q(`update profiles set preferences = preferences - 'rider_sms_alerts' where id = $1`, [RIDER1]);

// ================================================================================================
console.log("Message wording");
const grant = { send: true, event_key: "offer:x", kind: "offer", attempt: 1, user_id: RIDER1, order_id: "o", order_number: "MD2611009999", assignment_id: "a", expires_in_seconds: 9000, reason: null, after_pickup: false, sticky: true, lang: "hi" };
const hi = core.riderAlertMessage(grant);
ok("a rider who uses the app in Hindi gets the push in Hindi, with the same order number and path", /[ऀ-ॿ]/.test(hi.title) && hi.body.includes("MD2611009999") && hi.url === "/rider?a=a");
ok("the push lifetime is capped", hi.ttlSeconds === 3600 && core.riderAlertMessage({ ...grant, expires_in_seconds: 5 }).ttlSeconds === 30);
const back = core.riderAlertMessage({ ...grant, lang: "en", kind: "released", reason: "order_cancelled", after_pickup: true, sticky: true });
ok("a delivery cancelled after pickup tells the rider to bring it back", /bring it back to the pickup point/.test(back.body) && back.sticky === true);
ok("requests use push and SMS, notices push only", core.channelsFor("delivery_offer").join() === "push,sms" && core.channelsFor("delivery_cancelled").join() === "push");

// ================================================================================================
console.log("Opening the app from the alert");
const { safeNext } = await import(pathToFileURL(path.join(root, "src/lib/safe-next.ts")).href);
const link = m1.url;
ok("a signed-out rider is returned to the same delivery after signing in (the sign-in keeps the link)", safeNext(link, "/rider", "/rider") === link);
ok("the link can only lead into the rider app", safeNext("https://evil.example/rider?a=1", "/rider", "/rider") === "/rider" && safeNext("/admin/orders/1", "/rider", "/rider") === "/rider" && /^\/rider\?a=[0-9a-f-]{36}$/.test(link));
await as(RIDER2);
ok("the link is only a pointer: another rider asking for their assignments is shown nothing of this delivery", !(await fnv(`public.rider_assignments(array['offered','accepted','picked_up','expired','cancelled'])`)).some((x) => x.id === a1.id));
await as(null);

console.log("Who may call what");
for (const [who, uid] of [["a rider", RIDER1], ["a customer", CUST], ["an admin", ADMIN]]) {
  await as(uid);
  ok(`${who} cannot read the queue, claim or record`, /FORBIDDEN/.test((await err(`select public.rider_alert_queue(10, null)`)) ?? "") && /FORBIDDEN/.test((await err(`select public.rider_alert_claim($1::uuid, 'push')`, [n1[0].id])) ?? "") && /FORBIDDEN/.test((await err(`select public.rider_alert_record($1::uuid, 'push', 'sent', null, null, null)`, [n1[0].id])) ?? ""));
}
await as(null);
const priv = async (role, fn) => (await one(`select has_function_privilege($1, $2, 'execute') as r`, [role, fn])).r;
ok("only the service role is granted the gate functions", (await priv("service_role", "public.rider_alert_claim(uuid, public.notification_channel)")) === true && (await priv("authenticated", "public.rider_alert_claim(uuid, public.notification_channel)")) === false && (await priv("anon", "public.rider_alert_queue(int, uuid)")) === false && (await priv("authenticated", "public.rider_alert_record(uuid, public.notification_channel, text, text, text, text)")) === false);
ok("an unknown channel or status is refused", /INVALID_CHANNEL/.test((await err(`select public.rider_alert_claim($1::uuid, 'email')`, [n1[0].id])) ?? "") && /INVALID_STATUS/.test((await err(`select public.rider_alert_record($1::uuid, 'push', 'maybe', null, null, null)`, [n1[0].id])) ?? ""));
const newOrderRow = await one(`select id from notifications where type = 'new_order' limit 1`);
ok("the gate only deals in rider alerts (an admin's new-order row is not claimable)", (await fnv(`public.rider_alert_claim($1::uuid, 'push')`, [newOrderRow.id])).reason === "not_found");
await fnv(`public.record_notification_delivery($1::uuid, 'push', 'sent', 'msg-1', null)`, [newOrderRow.id]);
ok("new-order alert outcomes (0052) still record as before, on their own key", (await one(`select count(*)::int n from notification_deliveries where notification_id = $1 and channel = 'push' and event_key = ''`, [newOrderRow.id])).n === 1);
await as(CUST);
ok("a customer cannot read the rider alert status", /FORBIDDEN/.test((await err(`select public.admin_rider_alert_summary()`)) ?? "") && /FORBIDDEN/.test((await err(`select public.admin_recent_rider_alerts(5)`)) ?? ""));
await as(RIDER1);
ok("nor can a rider", /FORBIDDEN/.test((await err(`select public.admin_rider_alert_summary()`)) ?? ""));

console.log("Admin status reads");
await as(ADMIN);
const summary = await fnv(`public.admin_rider_alert_summary()`);
ok("the summary reports push and SMS separately with real counts", Number(summary.push?.sent_24h) > 5 && Number(summary.push?.failed_24h) >= 1 && Number(summary.push?.skipped_24h) >= 3 && Number(summary.sms?.sent_24h) === 1 && Number(summary.sms?.failed_24h) >= 1, JSON.stringify(summary));
const recent = await fnv(`public.admin_recent_rider_alerts(50)`);
ok("recent rider alerts name the order, the rider and the kind", recent.length > 10 && recent.every((e) => e.order_number && e.rider && ["offer", "released"].includes(e.kind)));
const failedRow = recent.find((e) => e.deliveries.some((d) => d.channel === "sms" && d.status === "failed" && /108/.test(d.error ?? "")));
ok("a failure shows its channel, state, the provider's answer and the attempts", Boolean(failedRow) && failedRow.deliveries.find((d) => d.channel === "sms").attempts === 3);
ok("a deliberate skip shows why", recent.some((e) => e.deliveries.some((d) => d.status === "skipped" && /^taken:/.test(d.error ?? ""))));
ok("earlier offers of a re-offered order are kept and marked as not current", recent.some((e) => e.current === false && e.kind === "offer"));
ok("the admin read never returns a rider's or customer's phone number", !/\b[6-9]\d{9}\b/.test(JSON.stringify(recent)) && !/\b[6-9]\d{9}\b/.test(JSON.stringify(summary)));
await as(null);
const o21 = await packedOrder();
await as(ADMIN);
ok("a request the sender has not picked up yet is listed as in-app only so far", (await fnv(`public.admin_recent_rider_alerts(50)`)).some((e) => e.order_id === o21 && e.deliveries.length === 0));
await as(null);

console.log("Housekeeping");
ok("every rider alert stored so far is free of phone numbers and amounts", (await q(`select title || ' ' || body || ' ' || data::text as t from notifications where type = 'delivery_cancelled'`)).every((r) => !/\b[6-9]\d{9}\b|₹/.test(r.t)));
ok("the nudge to the delivery route does nothing without pg_net, and never blocks an offer", (await one(`select count(*)::int n from pg_trigger where tgname in ('notifications_rider_alert_nudge_ins', 'notifications_rider_alert_nudge_upd')`)).n === 2 && Boolean(await openOffer(rider1Id, o21)));
ok("the withdrawn-request notice runs at commit (deferred constraint trigger)", (await one(`select tgdeferrable, tginitdeferred from pg_trigger where tgname = 'delivery_assignments_withdrawn_notice_trg'`)).tginitdeferred === true);
ok("no code path wrote delivery_assignments: the alert functions only read them", !/(insert into|update|delete from) public\.delivery_assignments/i.test(read("supabase/migrations/0058_rider_alerts.sql")));

panelServer.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
