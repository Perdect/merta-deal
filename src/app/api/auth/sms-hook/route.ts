import { NextResponse, type NextRequest } from "next/server";
import { indianMobile, otpSmsConfig, otpSmsMissing, sendOtpSms, verifyHookSignature } from "@/lib/sms/otp-sms";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** Supabase reads `{ error: { http_code, message } }` and hands the message to the app; `{}` with 200 means sent. */
function refuse(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status });
}

/**
 * Supabase Auth → Send SMS hook (Authentication → Hooks). Supabase makes and checks the OTP; this route only
 * delivers it through the Parken SMS panel on the DLT-approved template. The request is accepted only with a
 * valid Standard Webhooks signature, so nobody else can use it to send messages. Nothing is reported as sent
 * unless the panel accepted it: a refusal (no credits, sender or template not approved, …) goes back as an
 * error and the customer is told the OTP could not be sent.
 */
export async function POST(req: NextRequest) {
  const cfg = otpSmsConfig();
  const raw = await req.text();

  const sig = verifyHookSignature(raw, {
    id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature"),
  }, cfg.hookSecret);
  if (!sig.ok) {
    // Why a call was refused, without the secret itself: only its shape and length, so a mis-pasted value can be told from a wrong one.
    const shape = /^v1,whsec_[A-Za-z0-9+/=]+$/.test(cfg.hookSecret.trim()) ? "v1,whsec_<base64>" : /^https?:/i.test(cfg.hookSecret.trim()) ? "a URL" : "unexpected";
    console.error("sms-hook: refused,", sig.reason, "| secret shape:", shape, "| length:", cfg.hookSecret.length, "| has headers:", Boolean(req.headers.get("webhook-signature")));
    return refuse(sig.reason.includes("not configured") ? 503 : 401, sig.reason);
  }

  const missing = otpSmsMissing();
  if (missing.length) {
    console.error("sms-hook: not configured, missing", missing.join(", "));
    return refuse(503, "OTP by SMS is not set up yet. Please sign in with your mobile number and PIN.");
  }

  let payload: { user?: { phone?: string }; sms?: { otp?: string } };
  try { payload = JSON.parse(raw); } catch { return refuse(400, "Invalid JSON"); }
  const otp = payload.sms?.otp ?? "";
  const mobile = indianMobile(payload.user?.phone ?? "");
  if (!/^\d{4,8}$/.test(otp)) return refuse(400, "No OTP in the request");
  if (!mobile) return refuse(400, "OTP by SMS works for Indian mobile numbers only.");

  const sent = await sendOtpSms(cfg, mobile, otp);
  if (!sent.ok) {
    console.error("sms-hook: panel refused", sent.code ?? "-", sent.reason);
    return refuse(502, "We couldn't send the OTP right now. Please try again in a minute, or sign in with your PIN.");
  }
  console.log("sms-hook: accepted, message id", sent.messageId);
  return NextResponse.json({});
}
