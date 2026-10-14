import type { Enums } from "@/types/database";

/** Client-safe constants shared by the merchant portal (no server imports here). */

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UPI_RE = /^[\w.\-]{2,}@[A-Za-z]{2,}$/;

export const WEIGHT_UNITS = ["g", "kg", "ml", "l", "pcs", "pack"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const STOCK_REASONS: { value: string; label: string }[] = [
  { value: "restock", label: "Restock (new supply)" },
  { value: "manual_adjust", label: "Manual correction" },
  { value: "stock_count", label: "Physical count" },
  { value: "damage", label: "Damaged / spoiled" },
  { value: "expired", label: "Expired" },
];

export const DOC_TYPES: { value: string; label: string }[] = [
  { value: "shop_license", label: "Shop / Gumasta licence" },
  { value: "gst_certificate", label: "GST certificate" },
  { value: "pan_card", label: "PAN card" },
  { value: "fssai", label: "FSSAI licence" },
  { value: "bank_proof", label: "Bank proof (cancelled cheque / passbook)" },
  { value: "owner_id", label: "Owner ID (Aadhaar / Voter ID)" },
];

export type StoreOrderTab = "new" | "ready" | "on_the_way" | "completed" | "cancelled";
export const STORE_ORDER_TABS: { value: StoreOrderTab; label: string; statuses: Enums<"order_status">[] }[] = [
  // Orders are confirmed automatically (quick commerce): everything not yet packed is one queue.
  { value: "new", label: "To pack", statuses: ["placed", "store_confirmed", "preparing"] },
  { value: "ready", label: "Packed", statuses: ["ready_for_pickup", "rider_assigned"] },
  { value: "on_the_way", label: "On the way", statuses: ["out_for_delivery"] },
  { value: "completed", label: "Completed", statuses: ["delivered", "completed"] },
  { value: "cancelled", label: "Cancelled", statuses: ["cancelled", "rejected"] },
];

export const INVENTORY_STATUS_META: Record<Enums<"inventory_status">, { label: string; tone: "success" | "warning" | "danger" }> = {
  in_stock: { label: "In stock", tone: "success" },
  low_stock: { label: "Low stock", tone: "warning" },
  out_of_stock: { label: "Out of stock", tone: "danger" },
};

export const STORE_STATUS_META: Record<Enums<"store_status">, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  active: { label: "Active", tone: "success" },
  pending: { label: "Pending approval", tone: "warning" },
  suspended: { label: "Suspended", tone: "danger" },
  closed: { label: "Closed", tone: "neutral" },
};

export const DOC_STATUS_META: Record<Enums<"document_status">, { label: string; tone: "success" | "warning" | "danger" }> = {
  pending: { label: "Under review", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const PAYOUT_STATUS_META: Record<Enums<"payout_status">, { label: string; tone: "success" | "warning" | "danger" | "info" }> = {
  pending: { label: "Pending", tone: "warning" },
  processing: { label: "Processing", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

/** True when an online order is still unpaid — the DB refuses `accept` until payment lands (pay-first rule, 0007). */
export function isPaymentPending(o: { payment_method: Enums<"payment_method">; payment_status: Enums<"payment_status"> }) {
  return o.payment_method !== "cod" && !["paid", "authorized"].includes(o.payment_status);
}
