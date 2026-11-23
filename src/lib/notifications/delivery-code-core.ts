/**
 * Delivery code by SMS (0059): the one send that follows "the rider has reached the customer", and the
 * rider's explicit resends.
 *
 * This file decides nothing about who gets a code. The database does, in `delivery_otp_claim`: under
 * locks it re-checks that the delivery is still in progress with this assignment, mints the code, keeps
 * only its hash and hands the plain code out once. The function below asks, sends what was granted
 * through the SMS panel, and reports the panel's real answer through `delivery_otp_record`. The code is
 * held in one local variable for the length of one request: it is never returned, logged or put into
 * an error.
 *
 * No server imports and no path aliases on purpose: `scripts/test-delivery-otp.mjs` loads this file
 * directly under Node and runs it against PGlite with a stand-in for the SMS panel.
 */

/** What `delivery_otp_claim` returns: a code and a number to send it to, or why nothing is to be sent. */
export type DeliveryCodeClaim =
  | { send: true; code: string; mobile: string; expires_in_minutes: number }
  | { send: false; reason: string };

export type DeliveryCodePanelResult = { ok: true; messageId: string } | { ok: false; code: number | null; reason: string };

export type DeliveryCodePorts = {
  /** True only when every credential and the approved delivery-code template are present. */
  smsConfigured(): boolean;
  /** Recorded for staff when it is not (env var names only). */
  smsUnavailableReason(): string;
  claim(assignmentId: string): Promise<DeliveryCodeClaim>;
  record(assignmentId: string, status: "sent" | "failed" | "unavailable", providerId: string | null, error: string | null): Promise<void>;
  /** Never pretends: the panel's real answer. */
  sendSms(mobile: string, code: string): Promise<DeliveryCodePanelResult>;
};

/**
 * What happened, for the caller's own flow control. The rider and the customer never read this: their
 * screens read the state the database recorded.
 *   sent         the SMS panel accepted the message
 *   failed       the panel refused it or did not answer; the customer's order screen is the way through
 *   unavailable  no delivery-code SMS template on the server: nothing was minted for SMS, nothing sent
 *   held         the database had nothing to send (already sent, in flight, switched off, no number, …)
 */
export type DeliveryCodeOutcome =
  | { status: "sent" }
  | { status: "failed"; detail: string }
  | { status: "unavailable"; detail: string }
  | { status: "held"; reason: string };

/** Whatever a provider says back is recorded for staff, so the code must not be in it. */
function scrub(text: string, code: string): string {
  return text.split(code).join("[code]").slice(0, 300);
}

/**
 * One request → at most one SMS. Safe to call again for the same assignment (a retry, a refresh, an
 * overlapping run): the claim is granted once, and every later call is `held`.
 */
export async function sendDeliveryCode(ports: DeliveryCodePorts, assignmentId: string): Promise<DeliveryCodeOutcome> {
  if (!ports.smsConfigured()) {
    const detail = ports.smsUnavailableReason();
    // Answers a pending request only; anything else is left as it is by the database.
    await ports.record(assignmentId, "unavailable", null, detail);
    return { status: "unavailable", detail };
  }
  const claim = await ports.claim(assignmentId);
  if (!claim.send) return { status: "held", reason: claim.reason };

  let res: DeliveryCodePanelResult;
  try { res = await ports.sendSms(claim.mobile, claim.code); }
  catch { res = { ok: false, code: null, reason: "Could not reach the SMS panel" }; }

  if (res.ok) {
    // The panel's message id is a long number of its own; one that is exactly the code is not kept.
    await ports.record(assignmentId, "sent", res.messageId === claim.code ? null : res.messageId.slice(0, 100), null);
    return { status: "sent" };
  }
  const detail = scrub(`SMS panel${res.code ? ` ${res.code}` : ""}: ${res.reason}`, claim.code);
  await ports.record(assignmentId, "failed", null, detail);
  return { status: "failed", detail };
}
