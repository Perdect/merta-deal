import "server-only";
import type { NotificationPayload, NotificationProvider, SendResult } from "../types";

const ENV_VARS = ["MSG91_AUTH_KEY", "MSG91_SENDER_ID", "MSG91_TEMPLATE_ID"];

/**
 * SMS (MSG91) — interface-complete stub. The transport is NOT implemented yet, so this provider
 * always reports `not_configured` with the env vars a real integration will need. It never pretends to send.
 * To implement: POST https://control.msg91.com/api/v5/flow/ with { template_id, sender, recipients:[{ mobiles, VAR1, VAR2 }] }
 * and header `authkey: MSG91_AUTH_KEY`; look up the user's phone via the service-role client as the WhatsApp provider does.
 */
export const smsProvider: NotificationProvider = {
  channel: "sms",
  isConfigured() { return false; },
  async send(_payload: NotificationPayload): Promise<SendResult> {
    void _payload;
    const missing = ENV_VARS.filter((k) => !process.env[k]);
    return { sent: false, reason: "not_configured", detail: missing.length ? `SMS transport not implemented; set ${missing.join(", ")} and wire MSG91 in src/lib/notifications/providers/sms.ts.` : "MSG91 keys present but the SMS transport is not implemented yet (src/lib/notifications/providers/sms.ts).", envVars: ENV_VARS };
  },
};
