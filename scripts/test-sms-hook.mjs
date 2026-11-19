// Checks for the login-OTP SMS path (src/lib/sms/otp-sms.ts): hook signature, number handling, message
// text, the panel's answers, and one real HTTP round trip against a local stand-in for the panel.
// Run: node scripts/test-sms-hook.mjs "$PWD"      (Node 24: loads the .ts file directly)
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.argv[2] ?? process.cwd();
const m = await import(pathToFileURL(path.join(root, "src/lib/sms/otp-sms.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) { pass++; console.log("ok   ", name); } else { fail++; console.log("FAIL ", name, extra); } };

// ---- signature -------------------------------------------------------------
const secretB64 = Buffer.from("merta-deal-test-secret-0123456789").toString("base64");
const secret = `v1,whsec_${secretB64}`;
const body = JSON.stringify({ user: { phone: "919876543210" }, sms: { otp: "482913" } });
const now = Date.now();
const ts = String(Math.floor(now / 1000));
const sign = (id, t, b, key = secretB64) => "v1," + createHmac("sha256", Buffer.from(key, "base64")).update(`${id}.${t}.${b}`).digest("base64");
const h = (over = {}) => ({ id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), ...over });

check("valid signature is accepted", m.verifyHookSignature(body, h(), secret, now).ok === true);
check("changed body is refused", m.verifyHookSignature(body + " ", h(), secret, now).ok === false);
check("wrong secret is refused", m.verifyHookSignature(body, h(), "v1,whsec_" + Buffer.from("other").toString("base64"), now).ok === false);
check("missing headers are refused", m.verifyHookSignature(body, { id: null, timestamp: ts, signature: null }, secret, now).ok === false);
check("empty secret is refused", m.verifyHookSignature(body, h(), "", now).ok === false);
const oldTs = String(Math.floor(now / 1000) - 600);
check("a ten-minute-old request is refused", m.verifyHookSignature(body, { id: "msg_1", timestamp: oldTs, signature: sign("msg_1", oldTs, body) }, secret, now).ok === false);
check("one good signature among several is accepted", m.verifyHookSignature(body, h({ signature: `v1,AAAA ${sign("msg_1", ts, body)}` }), secret, now).ok === true);
check("second of two rotated secrets is accepted", m.verifyHookSignature(body, h(), `v1,whsec_${Buffer.from("old").toString("base64")}|${secret}`, now).ok === true);
check("bare base64 secret works too", m.verifyHookSignature(body, h(), secretB64, now).ok === true);

// ---- numbers ---------------------------------------------------------------
check("+91 number", m.indianMobile("+919876543210") === "9876543210");
check("91 number without plus", m.indianMobile("919876543210") === "9876543210");
check("ten digits", m.indianMobile("9876543210") === "9876543210");
check("leading zero", m.indianMobile("09876543210") === "9876543210");
check("foreign number refused", m.indianMobile("+14155550123") === null);
check("landline-style number refused", m.indianMobile("+911234567890") === null);
check("empty refused", m.indianMobile("") === null);

// ---- text ------------------------------------------------------------------
const tpl = "{otp} is your Merta Deal login OTP. Do not share it with anyone. - Merta Deal";
check("OTP lands in the template", m.renderOtpSms(tpl, "482913") === "482913 is your Merta Deal login OTP. Do not share it with anyone. - Merta Deal");
check("nothing else in the template moves", m.renderOtpSms("Code: {otp}. Valid 5 min.", "1234") === "Code: 1234. Valid 5 min.");

// ---- configuration ---------------------------------------------------------
check("empty env lists all five settings", m.otpSmsMissing({}).length === 5);
const full = { SEND_SMS_HOOK_SECRET: secret, PARKEN_SMS_KEY: "k", PARKEN_SMS_SENDER: "MRTADL", PARKEN_SMS_TEMPLATE_ID: "1207", PARKEN_SMS_TEMPLATE: tpl };
check("complete env has nothing missing", m.otpSmsMissing(full).length === 0);
check("template without {otp} is reported", m.otpSmsMissing({ ...full, PARKEN_SMS_TEMPLATE: "Your OTP" }).length === 1);
check("route defaults to 4 (Trans OTP)", m.otpSmsConfig(full).route === "4");
check("route can be set", m.otpSmsConfig({ ...full, PARKEN_SMS_ROUTE: "1" }).route === "1");

// ---- the panel's answers ---------------------------------------------------
check("message id means accepted", m.parseParkenResponse("987650").ok === true && m.parseParkenResponse("987650").messageId === "987650");
check("id with whitespace", m.parseParkenResponse(" 987650\n").ok === true);
for (const code of [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113]) {
  const r = m.parseParkenResponse(String(code));
  check(`code ${code} is a refusal`, r.ok === false && r.code === code);
}
check("empty answer is a refusal", m.parseParkenResponse("").ok === false);
check("answer with no number is a refusal", m.parseParkenResponse("<html>error</html>").ok === false);

// ---- one real round trip against a stand-in panel -----------------------------
let seen = null; let answer = "55501"; let delay = 0;
const stub = createServer((req, res) => { seen = new URL(req.url, "http://x"); setTimeout(() => { res.writeHead(200, { "Content-Type": "text/plain" }); res.end(answer); }, delay); });
await new Promise((r) => stub.listen(0, "127.0.0.1", r));
const cfg = m.otpSmsConfig({ ...full, PARKEN_SMS_KEY: "test-key", PARKEN_SMS_API_URL: `http://127.0.0.1:${stub.address().port}/api/smsapi` });

let r = await m.sendOtpSms(cfg, "9876543210", "482913");
check("accepted send returns the message id", r.ok === true && r.messageId === "55501");
check("number is sent as ten digits", seen?.searchParams.get("number") === "9876543210");
check("sender and template id are sent", seen?.searchParams.get("sender") === "MRTADL" && seen?.searchParams.get("templateid") === "1207");
check("route 4 and text type are sent", seen?.searchParams.get("route") === "4" && seen?.searchParams.get("type") === "1");
check("message arrives exactly as the template reads", seen?.searchParams.get("sms") === "482913 is your Merta Deal login OTP. Do not share it with anyone. - Merta Deal");

answer = "108";
r = await m.sendOtpSms(cfg, "9876543210", "482913");
check("low credits comes back as a refusal", r.ok === false && r.code === 108);
check("the refusal never carries the key or the code", !JSON.stringify(r).includes("test-key") && !JSON.stringify(r).includes("482913"));

answer = "55502"; delay = 400;
r = await m.sendOtpSms(cfg, "9876543210", "482913", 100);
check("a slow panel is a refusal, not a silent success", r.ok === false && /in time/.test(r.reason));
stub.close();

r = await m.sendOtpSms({ ...cfg, apiUrl: "http://127.0.0.1:1/api/smsapi" }, "9876543210", "482913", 500);
check("an unreachable panel is a refusal", r.ok === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
