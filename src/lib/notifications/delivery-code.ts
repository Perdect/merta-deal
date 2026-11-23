import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliveryOtpSmsConfig, deliveryOtpSmsMissing, sendDeliveryOtpSms } from "@/lib/sms/otp-sms";
import { sendDeliveryCode, type DeliveryCodeClaim, type DeliveryCodeOutcome, type DeliveryCodePorts } from "./delivery-code-core";

export type { DeliveryCodeOutcome } from "./delivery-code-core";

/** Whether the delivery code SMS can be sent at all from this server, and what is missing when it cannot (env var names only). */
export function deliveryCodeSmsStatus(): { configured: boolean; missing: string[] } {
  const missing = deliveryOtpSmsMissing();
  return { configured: missing.length === 0, missing };
}

/**
 * Sends the delivery code SMS that a rider's "reached the customer" (or resend) asked for (0059).
 * The database grants one claim per request (`delivery_otp_claim`, service role only) after re-checking
 * that the delivery is still in progress with this assignment, so calling this twice never sends twice.
 * Without an approved delivery-code template on the server the request is recorded as not configured
 * and nothing is minted or sent: the customer's own order screen shows a code instead. Before migration
 * 0059 is applied this returns `held: not_migrated` and changes nothing.
 */
export async function deliverDeliveryCode(assignmentId: string): Promise<DeliveryCodeOutcome> {
  const admin = createAdminClient();
  // Without the service role nothing can be claimed; the request stays pending and the rider app says the SMS was not sent.
  if (!admin) return { status: "held", reason: "service_role_missing" };
  const cfg = deliveryOtpSmsConfig();
  let migrated = true;

  const ports: DeliveryCodePorts = {
    smsConfigured: () => deliveryOtpSmsMissing().length === 0,
    smsUnavailableReason: () => `The delivery code SMS is not configured on the server (${deliveryOtpSmsMissing().join(", ")}).`,
    async claim(id): Promise<DeliveryCodeClaim> {
      const { data, error } = await admin.rpc("delivery_otp_claim" as never, { p_assignment_id: id } as never);
      if (error) { if (notMigrated(error)) migrated = false; return { send: false, reason: migrated ? "claim_failed" : "not_migrated" }; }
      // A claim that could not be read is not a grant: nothing is sent.
      return (data as unknown as DeliveryCodeClaim | null) ?? { send: false, reason: "claim_failed" };
    },
    async record(id, status, providerId, err) {
      const { error } = await admin.rpc("delivery_otp_record" as never, { p_assignment_id: id, p_status: status, p_provider_id: providerId, p_error: err } as never);
      if (error && notMigrated(error)) migrated = false;
    },
    sendSms: (mobile, code) => sendDeliveryOtpSms(cfg, mobile, code),
  };

  try {
    const out = await sendDeliveryCode(ports, assignmentId);
    return migrated ? out : { status: "held", reason: "not_migrated" };
  } catch {
    // Nothing from the failure is passed on: it could carry the claim.
    return { status: "held", reason: "error" };
  }
}

type RpcError = { code?: string; message: string };
/** The 0059 functions are missing: the migration has not been applied to this database yet. */
function notMigrated(e: RpcError): boolean {
  return e.code === "PGRST202" || e.code === "42883" || (/delivery_otp_(claim|record)/.test(e.message) && /find|exist/i.test(e.message));
}
