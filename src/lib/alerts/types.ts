import type { OrderStatus, PaymentMethod } from "@/types/app";

/** One row of admin_order_alerts(): an order nobody has accepted yet. Carries no customer name or phone. */
export type AlertOrder = {
  id: string; order_number: string; status: OrderStatus; item_count: number; total: number;
  payment_method: PaymentMethod; payment_status: string; delivery_type: string;
  area: string | null; city: string | null; created_at: string; promised_at: string | null;
  /** Direct UPI (0042): waiting for the admin to find the payment in the bank; accept = confirm the payment. */
  upi_pending?: boolean; upi_reference?: string | null; upi_claimed_at?: string | null;
};

export type AlertFeed = { now: string; ring_seconds: number; reminder_seconds: number; /** False = no-accept mode (0046): orders only ring, nothing waits. */ require_accept?: boolean; orders: AlertOrder[] };

export type AcceptResult = { ok: true; already: boolean; status: OrderStatus; accepted_at: string | null; accepted_by: string | null; accepted_by_name: string | null };

/** How long a reminder ring lasts once the first ring window has passed. */
export const REMINDER_RING_SECONDS = 15;

/** True while this order should be ringing under the configured policy (first window, then reminders). */
export function shouldRing(o: Pick<AlertOrder, "created_at">, feed: Pick<AlertFeed, "ring_seconds" | "reminder_seconds">, serverNowMs: number) {
  const age = (serverNowMs - new Date(o.created_at).getTime()) / 1000;
  if (age < 0) return true;
  if (age < feed.ring_seconds) return true;
  if (feed.reminder_seconds <= 0) return false;
  return ((age - feed.ring_seconds) % feed.reminder_seconds) < REMINDER_RING_SECONDS;
}
