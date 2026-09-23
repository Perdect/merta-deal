import "server-only";
import type { NotificationPayload, NotificationProvider, SendResult } from "../types";

const ENV_VARS = ["RESEND_API_KEY", "EMAIL_FROM"];

/**
 * Email (Resend) — interface-complete stub. The transport is NOT implemented yet, so this provider
 * always reports `not_configured` with the env vars a real integration will need. It never pretends to send.
 * To implement: `npm i resend`, then `new Resend(RESEND_API_KEY).emails.send({ from: EMAIL_FROM, to, subject: title, html })`
 * with the recipient's email from auth.users (service-role `admin.auth.admin.getUserById`).
 */
export const emailProvider: NotificationProvider = {
  channel: "email",
  isConfigured() { return false; },
  async send(_payload: NotificationPayload): Promise<SendResult> {
    void _payload;
    const missing = ENV_VARS.filter((k) => !process.env[k]);
    return { sent: false, reason: "not_configured", detail: missing.length ? `Email transport not implemented; set ${missing.join(", ")} and wire Resend in src/lib/notifications/providers/email.ts.` : "Resend keys present but the email transport is not implemented yet (src/lib/notifications/providers/email.ts).", envVars: ENV_VARS };
  },
};
