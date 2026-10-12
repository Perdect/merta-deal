import { ORDER_STATUS_META, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import type { Enums } from "@/types/database";
import { StatusPill, type Tone } from "./ui";

/* Status vocabularies for the admin. Each shows words plus colour; order status, payment method
   and payment status are always separate cells, never merged into one label. */

const ORDER_TONE: Record<OrderStatus, Tone> = {
  placed: "blue", store_confirmed: "blue", preparing: "violet", ready_for_pickup: "amber", rider_assigned: "blue",
  out_for_delivery: "blue", delivered: "green", completed: "green", cancelled: "red", rejected: "red",
};
export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  placed: "#60a5fa", store_confirmed: "#3b82f6", preparing: "#8b5cf6", ready_for_pickup: "#e0a100", rider_assigned: "#2563eb",
  out_for_delivery: "#1d4ed8", delivered: "#329537", completed: "#329537", cancelled: "#d9342b", rejected: "#9f1d16",
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return <StatusPill tone={ORDER_TONE[status] ?? "neutral"}>{ORDER_STATUS_META[status]?.short ?? status}</StatusPill>;
}

const PAY_TONE: Record<Enums<"payment_status">, Tone> = {
  pending: "amber", authorized: "blue", paid: "green", failed: "red", refunded: "neutral", partially_refunded: "neutral", cod_pending: "amber", cod_collected: "green",
};
const PAY_SHORT: Partial<Record<Enums<"payment_status">, string>> = { pending: "Pending", failed: "Failed", cod_pending: "COD due" };

export function PaymentStatusPill({ status }: { status: Enums<"payment_status"> }) {
  return <StatusPill tone={PAY_TONE[status] ?? "neutral"}>{PAY_SHORT[status] ?? PAYMENT_STATUS_LABEL[status] ?? status}</StatusPill>;
}

const METHOD_SHORT: Record<Enums<"payment_method">, string> = { cod: "Cash", upi: "UPI", card: "Card", netbanking: "Net banking", wallet: "Wallet", razorpay: "Online" };
export function paymentMethodLabel(m: Enums<"payment_method">, long = false) { return long ? PAYMENT_METHOD_LABEL[m] ?? m : METHOD_SHORT[m] ?? m; }

/** Generic lookup for the smaller vocabularies (stores, riders, tickets, payouts, reviews, coupons). */
const GENERIC: Record<string, Tone> = {
  active: "green", approved: "green", paid: "green", verified: "green", resolved: "green", delivered: "green", accepted: "blue",
  pending: "amber", processing: "blue", in_progress: "blue", open: "amber", offered: "amber", picked_up: "blue",
  suspended: "red", rejected: "red", failed: "red", cancelled: "red", urgent: "red", high: "amber",
  closed: "neutral", expired: "neutral", inactive: "neutral", low: "neutral", medium: "blue",
};
export function StatusText({ value, label }: { value: string; label?: string }) {
  const text = label ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return <StatusPill tone={GENERIC[value] ?? "neutral"}>{text}</StatusPill>;
}
