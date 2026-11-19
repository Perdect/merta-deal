import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Login OTP by SMS through the Parken panel (sms.par-ken.com), called by Supabase Auth's Send SMS hook.
 * Supabase still creates, stores and checks the code; this only carries it to the phone.
 *
 * Nothing here is imported by client code. It has no `server-only` marker and no path aliases on purpose,
 * so `scripts/test-sms-hook.mjs` can load it directly under Node.
 */

export type OtpSmsConfig = {
  /** `v1,whsec_<base64>` from Supabase → Authentication → Hooks → Send SMS. Several secrets may be joined with `|`. */
  hookSecret: string;
  apiUrl: string;
  key: string;
  /** The DLT header (sender ID) approved for the template. */
  sender: string;
  /** The DLT template ID. */
  templateId: string;
  /** The approved template text with `{otp}` where the code goes. Must match the DLT text character for character. */
  template: string;
  /** Parken route number; 4 is "Trans OTP". */
  route: string;
};

export const OTP_SMS_ENV = ["SEND_SMS_HOOK_SECRET", "PARKEN_SMS_KEY", "PARKEN_SMS_SENDER", "PARKEN_SMS_TEMPLATE_ID", "PARKEN_SMS_TEMPLATE"] as const;

export function otpSmsConfig(e: Record<string, string | undefined> = process.env): OtpSmsConfig {
  return {
    hookSecret: e.SEND_SMS_HOOK_SECRET ?? "",
    apiUrl: e.PARKEN_SMS_API_URL || "https://sms.par-ken.com/api/smsapi",
    // Pasted values often carry a stray space or line break; none of these may contain one.
    key: (e.PARKEN_SMS_KEY ?? "").trim(),
    sender: (e.PARKEN_SMS_SENDER ?? "").trim(),
    templateId: (e.PARKEN_SMS_TEMPLATE_ID ?? "").trim(),
    template: e.PARKEN_SMS_TEMPLATE ?? "",
    route: e.PARKEN_SMS_ROUTE || "4",
  };
}

/** Names of the settings that are still empty (names only, never values). */
export function otpSmsMissing(e: Record<string, string | undefined> = process.env): string[] {
  const missing: string[] = OTP_SMS_ENV.filter((k) => !e[k]);
  if (e.PARKEN_SMS_TEMPLATE && !e.PARKEN_SMS_TEMPLATE.includes("{otp}")) missing.push("PARKEN_SMS_TEMPLATE (must contain {otp})");
  return missing;
}

const TOLERANCE_S = 5 * 60;

/**
 * Standard Webhooks check, as Supabase signs its HTTP hooks: HMAC-SHA256 over `<id>.<timestamp>.<body>`
 * with the base64 secret, sent as `webhook-signature: v1,<base64> [v1,<base64> …]`.
 */
export function verifyHookSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "SEND_SMS_HOOK_SECRET not configured" };
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: "Missing webhook headers" };
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "Malformed timestamp" };
  if (Math.abs(nowMs / 1000 - ts) > TOLERANCE_S) return { ok: false, reason: "Timestamp outside the allowed window" };

  const received = headers.signature.split(" ").map((s) => s.trim()).filter((s) => s.startsWith("v1,")).map((s) => s.slice(3));
  if (!received.length) return { ok: false, reason: "No v1 signature" };

  for (const one of secret.split("|")) {
    const b64 = one.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
    if (!b64) continue;
    const expected = createHmac("sha256", Buffer.from(b64, "base64")).update(`${headers.id}.${headers.timestamp}.${rawBody}`, "utf8").digest();
    for (const sig of received) {
      const got = Buffer.from(sig, "base64");
      if (got.length === expected.length && timingSafeEqual(got, expected)) return { ok: true };
    }
  }
  return { ok: false, reason: "Signature mismatch" };
}

/** `+919876543210`, `919876543210`, `09876543210` or `9876543210` → `9876543210`; anything else is not an Indian mobile. */
export function indianMobile(phone: string): string | null {
  let d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function renderOtpSms(template: string, otp: string): string {
  return template.split("{otp}").join(otp);
}

/** The panel's documented refusals (Developer → Http Api). */
export const PARKEN_ERRORS: Record<number, string> = {
  101: "Invalid user (API key)",
  102: "Invalid sender ID",
  103: "Invalid contact(s)",
  104: "Invalid route",
  105: "Invalid message",
  106: "Spam blocked",
  107: "Promotional block",
  108: "Low credits in the specified route",
  109: "Promotional route works 9am to 8:45pm only",
  110: "Invalid DLT Template ID",
  111: "No SMSC",
  112: "Invalid Submit Type",
  113: "Invalid Long URL",
};

export type ParkenResult = { ok: true; messageId: string } | { ok: false; code: number | null; reason: string };

/**
 * The panel answers with a bare number: one of the codes above, or otherwise the message id of the accepted
 * slot. A body with no number in it is treated as a refusal, since nothing says the message was taken.
 */
export function parseParkenResponse(body: string): ParkenResult {
  const text = body.trim();
  const nums = text.match(/\d+/g) ?? [];
  if (nums.length === 1 && PARKEN_ERRORS[Number(nums[0])]) return { ok: false, code: Number(nums[0]), reason: PARKEN_ERRORS[Number(nums[0])] };
  if (nums.length) return { ok: true, messageId: nums.reduce((a, b) => (b.length > a.length ? b : a)) };
  return { ok: false, code: null, reason: `Unrecognised answer: ${text.slice(0, 120) || "(empty)"}` };
}

/** Sends one OTP. Never logs or returns the key, the code or the message text. */
export async function sendOtpSms(cfg: OtpSmsConfig, mobile: string, otp: string, timeoutMs = 4000): Promise<ParkenResult> {
  const q = new URLSearchParams({
    key: cfg.key, route: cfg.route, type: "1", sender: cfg.sender, number: mobile,
    sms: renderOtpSms(cfg.template, otp), templateid: cfg.templateId,
  });
  try {
    const res = await fetch(`${cfg.apiUrl}?${q.toString()}`, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.text();
    if (!res.ok) return { ok: false, code: null, reason: `SMS panel answered HTTP ${res.status}` };
    return parseParkenResponse(body);
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, code: null, reason: timedOut ? "SMS panel did not answer in time" : "Could not reach the SMS panel" };
  }
}

/** What a saved API key looks like, without the key: for telling a mis-pasted value from a wrong one. */
export function keyShape(key: string): string {
  const k = key.trim();
  const kind = /^[0-9a-f]{32}$/i.test(k) ? "32 hex characters (as the panel issues)" : /^https?:/i.test(k) ? "a URL" : /key=/i.test(k) ? "contains 'key='" : /\s/.test(k) ? "contains spaces" : "unexpected";
  return `${kind}, length ${k.length}${key !== k ? ", had surrounding whitespace" : ""}`;
}
