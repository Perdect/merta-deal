/**
 * Rider alert delivery (0058): a delivery request, or a "no longer yours" notice, sent to the rider's
 * phone by push and, for requests, by SMS when that is configured and the rider has switched it on.
 *
 * This file decides nothing about who is alerted. The database does, in `rider_alert_claim`: under a
 * lock it re-reads the assignment immediately before every send, refuses what is no longer this
 * rider's, and hands out at most one claim per event and channel. The loop here only asks, sends what
 * was granted, and reports the provider's real answer through `rider_alert_record`.
 *
 * No server imports and no path aliases on purpose: `scripts/test-rider-alerts.mjs` loads this file
 * directly under Node and runs it against PGlite with stub providers.
 */

export const RIDER_ALERT_TYPES = ["delivery_offer", "delivery_cancelled"] as const;
export const RIDER_ALERT_CHANNELS = ["push", "sms"] as const;
export type RiderAlertChannel = (typeof RIDER_ALERT_CHANNELS)[number];
export type RiderAlertLang = "en" | "hi";

/** What `rider_alert_claim` grants: the order number and ids, nothing about the customer. */
export type RiderAlertGrant = {
  send: true; event_key: string; kind: "offer" | "released"; attempt: number; user_id: string;
  order_id: string; order_number: string; assignment_id: string;
  /** Seconds until the request runs out (requests only): the push service drops it after that. */
  expires_in_seconds: number | null;
  /** Why a delivery was taken away: taken | withdrawn | order_cancelled | unassigned. */
  reason: string | null; after_pickup: boolean; sticky: boolean; lang: RiderAlertLang;
};
export type RiderAlertRefusal = { send: false; reason: string; skipped?: boolean; event_key?: string };
export type RiderAlertClaim = RiderAlertGrant | RiderAlertRefusal;

/** The whole of what leaves the server for a lock screen. */
export type RiderAlertMessage = {
  type: "delivery_offer" | "delivery_cancelled"; title: string; body: string;
  /** Opens the rider app at this delivery; ids only. */
  url: string;
  /** One notification per order on the phone: a later alert for the same order replaces the earlier one. */
  tag: string; sticky: boolean; ttlSeconds: number; data: { assignment_id: string; order_id: string };
};

export type ChannelOutcome =
  | { status: "sent"; providerId?: string | null }
  | { status: "no_recipient"; detail: string }
  | { status: "failed"; detail: string }
  | { status: "unavailable"; detail: string };

export type RiderAlertChannelPort = {
  /** True only when every credential the transport needs is present. */
  configured(): boolean;
  /** Recorded for staff when it is not. */
  unavailableReason(): string;
  /** Never pretends: the provider's real answer, or `failed` with its error. */
  send(grant: RiderAlertGrant, message: RiderAlertMessage): Promise<ChannelOutcome>;
};

export type RiderAlertPorts = {
  queue(limit: number, orderId: string | null): Promise<{ id: string; type: string }[]>;
  claim(notificationId: string, channel: RiderAlertChannel): Promise<RiderAlertClaim>;
  record(notificationId: string, channel: RiderAlertChannel, status: ChannelOutcome["status"], providerId: string | null, error: string | null, eventKey: string | null): Promise<void>;
  channels: Record<RiderAlertChannel, RiderAlertChannelPort>;
};

export type RiderChannelTotals = { sent: number; failed: number; no_recipient: number; unavailable: number; skipped: number; held: number };
export type RiderAlertSummary = {
  ok: boolean; reason?: string; detail?: string; notifications: number;
  channels: Record<RiderAlertChannel, RiderChannelTotals>;
  /** Why sends were not made, counted by the database's reason (taken, expired, sms_not_opted_in, in_flight, …). */
  refusals: Record<string, number>;
};

const TEXT: Record<RiderAlertLang, {
  offerTitle: string; offerBody: (n: string) => string;
  closedTitle: string; taken: (n: string) => string; orderCancelledOffer: (n: string) => string; withdrawn: (n: string) => string;
  goneTitle: string; unassigned: (n: string) => string;
  cancelledTitle: string; cancelledBeforePickup: (n: string) => string; cancelledAfterPickup: (n: string) => string;
}> = {
  en: {
    offerTitle: "New delivery request",
    offerBody: (n) => `Order ${n}. Open the rider app to accept or decline.`,
    closedTitle: "Request closed",
    taken: (n) => `Order ${n}: another rider accepted it. It is no longer offered to you.`,
    orderCancelledOffer: (n) => `Order ${n} was cancelled. It is no longer offered to you.`,
    withdrawn: (n) => `Order ${n} is no longer offered to you.`,
    goneTitle: "Delivery no longer assigned to you",
    unassigned: (n) => `Order ${n} is no longer assigned to you.`,
    cancelledTitle: "Delivery cancelled",
    cancelledBeforePickup: (n) => `Order ${n} was cancelled. No need to collect it.`,
    cancelledAfterPickup: (n) => `Order ${n} was cancelled. Please bring it back to the pickup point.`,
  },
  hi: {
    offerTitle: "नई डिलीवरी रिक्वेस्ट",
    offerBody: (n) => `ऑर्डर ${n}. स्वीकार या मना करने के लिए राइडर ऐप खोलें।`,
    closedTitle: "रिक्वेस्ट बंद हुई",
    taken: (n) => `ऑर्डर ${n}: दूसरे राइडर ने ले लिया। अब यह आपके लिए नहीं है।`,
    orderCancelledOffer: (n) => `ऑर्डर ${n} रद्द हो गया। अब यह आपके लिए नहीं है।`,
    withdrawn: (n) => `ऑर्डर ${n} अब आपके लिए नहीं है।`,
    goneTitle: "यह डिलीवरी अब आपकी नहीं है",
    unassigned: (n) => `ऑर्डर ${n} अब आपको नहीं सौंपा गया है।`,
    cancelledTitle: "डिलीवरी रद्द हुई",
    cancelledBeforePickup: (n) => `ऑर्डर ${n} रद्द हो गया। इसे लेने की ज़रूरत नहीं।`,
    cancelledAfterPickup: (n) => `ऑर्डर ${n} रद्द हो गया। कृपया इसे पिकअप पॉइंट पर वापस लाएँ।`,
  },
};

/** How long a "no longer yours" push is worth delivering to a phone that was offline. */
const RELEASE_TTL_SECONDS = 15 * 60;

/**
 * The message for a grant: a short title, the order number, and a path with ids only. No customer
 * name, phone, address, amount or token is available to this function, so none can leak into it.
 */
export function riderAlertMessage(g: RiderAlertGrant): RiderAlertMessage {
  const t = TEXT[g.lang === "hi" ? "hi" : "en"];
  const base = { url: `/rider?a=${g.assignment_id}`, tag: `delivery-${g.order_id}`, data: { assignment_id: g.assignment_id, order_id: g.order_id } };
  if (g.kind === "offer") {
    return { ...base, type: "delivery_offer", title: t.offerTitle, body: t.offerBody(g.order_number), sticky: true, ttlSeconds: Math.max(30, Math.min(g.expires_in_seconds ?? 180, 3600)) };
  }
  const wasOnTheJob = g.sticky;
  const [title, body] = g.reason === "taken" ? [t.closedTitle, t.taken(g.order_number)]
    : g.reason === "order_cancelled" ? (wasOnTheJob ? [t.cancelledTitle, g.after_pickup ? t.cancelledAfterPickup(g.order_number) : t.cancelledBeforePickup(g.order_number)] : [t.closedTitle, t.orderCancelledOffer(g.order_number)])
    : g.reason === "unassigned" ? [t.goneTitle, t.unassigned(g.order_number)]
    : [t.closedTitle, t.withdrawn(g.order_number)];
  return { ...base, type: "delivery_cancelled", title, body, sticky: wasOnTheJob, ttlSeconds: RELEASE_TTL_SECONDS };
}

const zero = (): RiderChannelTotals => ({ sent: 0, failed: 0, no_recipient: 0, unavailable: 0, skipped: 0, held: 0 });
export const emptyRiderSummary = (): RiderAlertSummary => ({ ok: true, notifications: 0, channels: { push: zero(), sms: zero() }, refusals: {} });

/** A request goes by push and SMS; a "no longer yours" notice by push only. */
export function channelsFor(type: string): RiderAlertChannel[] {
  return type === "delivery_offer" ? ["push", "sms"] : ["push"];
}

/**
 * One sweep. Safe to run from several places at once (the scheduler, a server action, an open staff
 * app): each send is claimed in the database first, so a second runner is refused, and a channel that
 * already answered "sent" is never sent again. Channels are independent: SMS failing never blocks push.
 */
export async function runRiderAlerts(ports: RiderAlertPorts, opts: { orderId?: string | null; limit?: number } = {}): Promise<RiderAlertSummary> {
  const summary = emptyRiderSummary();
  const list = await ports.queue(opts.limit ?? 50, opts.orderId ?? null);
  summary.notifications = list.length;
  for (const n of list) {
    await Promise.all(channelsFor(n.type).map(async (channel) => {
      const port = ports.channels[channel]; const totals = summary.channels[channel];
      if (!port.configured()) {
        await ports.record(n.id, channel, "unavailable", null, port.unavailableReason(), null);
        totals.unavailable++;
        return;
      }
      const claim = await ports.claim(n.id, channel);
      if (!claim.send) {
        summary.refusals[claim.reason] = (summary.refusals[claim.reason] ?? 0) + 1;
        if (claim.skipped) totals.skipped++; else totals.held++;
        return;
      }
      let out: ChannelOutcome;
      try { out = await port.send(claim, riderAlertMessage(claim)); }
      catch (e) { out = { status: "failed", detail: e instanceof Error ? e.message : String(e) }; }
      await ports.record(n.id, channel, out.status, out.status === "sent" ? out.providerId ?? null : null, out.status === "sent" ? null : out.detail, claim.event_key);
      totals[out.status]++;
    }));
  }
  return summary;
}
