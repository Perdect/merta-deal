import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Login OTP by SMS through the Parken panel (sms.par-ken.com), called by Supabase Auth's Send SMS hook.
 * Supabase still creates, stores and checks the code; this only carries it to the phone.
 *
 * The same panel also carries delivery-request SMS to riders (0058, bottom of this file), on a separate
 * approved template: the two never share a template or its ID.
 *
 * Nothing here is imported by client code. It has no `server-only` marker and no path aliases on purpose,
 * so `scripts/test-sms-hook.mjs` and `scripts/test-rider-alerts.mjs` can load it directly under Node.
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

/**
 * One message through the panel's HTTP API. The text must be an approved DLT template with its variables filled
 * in, sent with that template's ID, sender and route; the panel (and the operators behind it) refuse anything else.
 * Never logs or returns the key or the message text.
 */
export async function sendParkenSms(p: { apiUrl: string; key: string; sender: string; route: string; templateId: string; mobile: string; text: string }, timeoutMs = 4000): Promise<ParkenResult> {
  const q = new URLSearchParams({ key: p.key, route: p.route, type: "1", sender: p.sender, number: p.mobile, sms: p.text, templateid: p.templateId });
  try {
    const res = await fetch(`${p.apiUrl}?${q.toString()}`, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.text();
    if (!res.ok) return { ok: false, code: null, reason: `SMS panel answered HTTP ${res.status}` };
    return parseParkenResponse(body);
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, code: null, reason: timedOut ? "SMS panel did not answer in time" : "Could not reach the SMS panel" };
  }
}

/** Sends one OTP. Never logs or returns the key, the code or the message text. */
export async function sendOtpSms(cfg: OtpSmsConfig, mobile: string, otp: string, timeoutMs = 4000): Promise<ParkenResult> {
  return sendParkenSms({ apiUrl: cfg.apiUrl, key: cfg.key, sender: cfg.sender, route: cfg.route, templateId: cfg.templateId, mobile, text: renderOtpSms(cfg.template, otp) }, timeoutMs);
}

/** What a saved API key looks like, without the key: for telling a mis-pasted value from a wrong one. */
export function keyShape(key: string): string {
  const k = key.trim();
  const kind = /^[0-9a-f]{32}$/i.test(k) ? "32 hex characters (as the panel issues)" : /^https?:/i.test(k) ? "a URL" : /key=/i.test(k) ? "contains 'key='" : /\s/.test(k) ? "contains spaces" : "unexpected";
  return `${kind}, length ${k.length}${key !== k ? ", had surrounding whitespace" : ""}`;
}

/* ------------------------------------------------------------------------------------------------
 * Delivery-request SMS to riders (0058).
 *
 * In India every SMS must match a template registered on the DLT platform, sent under that template's
 * ID. The login template above is an OTP template: its text is fixed around the code, so it cannot
 * carry a delivery alert, and sending other words under its ID is refused by the operators. Rider
 * alerts therefore need their OWN approved template (a service / transactional one) with its own ID,
 * and the panel route that template was approved for. Until those are set here the channel reports
 * "not configured" and nothing is sent. The API key is the panel account's and is shared.
 * ---------------------------------------------------------------------------------------------- */

export type RiderAlertSmsConfig = { apiUrl: string; key: string; sender: string; templateId: string; template: string; route: string };

/** `PARKEN_SMS_KEY` is the panel account's key (shared with OTP); the sender falls back to the OTP header when the alert template was approved under the same one. */
export const RIDER_ALERT_SMS_ENV = ["PARKEN_SMS_KEY", "PARKEN_RIDER_ALERT_TEMPLATE_ID", "PARKEN_RIDER_ALERT_TEMPLATE", "PARKEN_RIDER_ALERT_ROUTE"] as const;

export function riderAlertSmsConfig(e: Record<string, string | undefined> = process.env): RiderAlertSmsConfig {
  return {
    apiUrl: e.PARKEN_SMS_API_URL || "https://sms.par-ken.com/api/smsapi",
    key: (e.PARKEN_SMS_KEY ?? "").trim(),
    sender: (e.PARKEN_RIDER_ALERT_SENDER ?? e.PARKEN_SMS_SENDER ?? "").trim(),
    templateId: (e.PARKEN_RIDER_ALERT_TEMPLATE_ID ?? "").trim(),
    template: e.PARKEN_RIDER_ALERT_TEMPLATE ?? "",
    // No default: the route an alert template may use is set by its DLT approval, and guessing it sends nothing or bills the wrong route.
    route: (e.PARKEN_RIDER_ALERT_ROUTE ?? "").trim(),
  };
}

/** Names of what is still missing for rider SMS alerts (names only, never values). Empty = configured. */
export function riderAlertSmsMissing(e: Record<string, string | undefined> = process.env): string[] {
  const missing: string[] = RIDER_ALERT_SMS_ENV.filter((k) => !(e[k] ?? "").trim());
  if (!(e.PARKEN_RIDER_ALERT_SENDER ?? e.PARKEN_SMS_SENDER ?? "").trim()) missing.push("PARKEN_RIDER_ALERT_SENDER (or PARKEN_SMS_SENDER)");
  const template = e.PARKEN_RIDER_ALERT_TEMPLATE ?? "";
  if (template && !template.includes("{order}")) missing.push("PARKEN_RIDER_ALERT_TEMPLATE (must contain {order})");
  // The login template cannot be reused: same ID or same words means it is the OTP template, not an alert template.
  if (template && template.includes("{otp}")) missing.push("PARKEN_RIDER_ALERT_TEMPLATE (this is an OTP template; alerts need their own approved template)");
  const id = (e.PARKEN_RIDER_ALERT_TEMPLATE_ID ?? "").trim();
  if (id && id === (e.PARKEN_SMS_TEMPLATE_ID ?? "").trim()) missing.push("PARKEN_RIDER_ALERT_TEMPLATE_ID (same as the OTP template ID; alerts need their own approved template)");
  return missing;
}

/** A DLT variable holds at most 30 characters and no line breaks; an order number is letters, digits and dashes. */
export function smsOrderNumber(orderNumber: string): string | null {
  const v = orderNumber.trim();
  return /^[A-Za-z0-9-]{1,30}$/.test(v) ? v : null;
}

/** The approved text with the order number in place. Nothing else is variable: no name, address, amount or link with ids. */
export function renderRiderAlertSms(template: string, orderNumber: string): string {
  return template.split("{order}").join(orderNumber);
}

/** Sends one delivery-request SMS. Never logs or returns the key, the number or the message text. */
export async function sendRiderAlertSms(cfg: RiderAlertSmsConfig, mobile: string, orderNumber: string, timeoutMs = 4000): Promise<ParkenResult> {
  const order = smsOrderNumber(orderNumber);
  if (!order) return { ok: false, code: null, reason: "Order number does not fit the SMS template variable" };
  return sendParkenSms({ apiUrl: cfg.apiUrl, key: cfg.key, sender: cfg.sender, route: cfg.route, templateId: cfg.templateId, mobile, text: renderRiderAlertSms(cfg.template, order) }, timeoutMs);
}
