/** Inventory reservations and passbook (0048): hand-typed shapes of the admin RPC results, plus labels. */
export type PassbookKind = "reserve" | "release" | "deliver" | "exception_release" | "receive" | "adjust" | "correction" | "opening";

export type InventoryRow = {
  id: string; product_id: string; name: string; slug: string; pack_label: string | null; image_url: string | null; brand_name: string | null;
  category_name: string | null; category_id: string | null;
  available: number; reserved: number; physical: number; low_stock_threshold: number; status: "in_stock" | "low_stock" | "out_of_stock"; is_active: boolean;
  selling_price: number; avg_cost: number | null; updated_at: string; last_move_at: string | null; open_orders: number;
};
export type InventoryOverview = {
  rows: InventoryRow[]; total: number;
  counts: { all: number; low: number; out: number; reserved: number; paused: number };
  totals: { available: number; reserved: number; physical: number; low: number; out: number };
};
export type PassbookEntry = {
  id: number; inventory_id: string; product_id: string | null; kind: PassbookKind; delta_available: number; delta_reserved: number;
  available_before: number; available_after: number; reserved_before: number; reserved_after: number; physical_before: number; physical_after: number;
  order_id: string | null; reference_id: string | null; reference_type: string | null; actor_id: string | null; actor_name: string | null; note: string | null; created_at: string;
  product_name: string | null; pack_label: string | null; image_url: string | null; order_number: string | null;
};
export type PassbookPage = { rows: PassbookEntry[]; total: number };

export const PASSBOOK_KIND_LABEL: Record<PassbookKind, string> = {
  reserve: "Reserved for order", release: "Released (cancelled)", deliver: "Delivered", exception_release: "Released (item short)",
  receive: "Stock received", adjust: "Manual adjustment", correction: "Stock correction", opening: "Opening balance",
};
export const PASSBOOK_KIND_TONE: Record<PassbookKind, "neutral" | "green" | "amber" | "red" | "blue" | "violet"> = {
  reserve: "blue", release: "amber", deliver: "green", exception_release: "amber", receive: "green", adjust: "neutral", correction: "violet", opening: "neutral",
};
export const INVENTORY_TABS = [
  { value: "", label: "All" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
  { value: "reserved", label: "Reserved" },
  { value: "paused", label: "Paused" },
] as const;
/** Reasons an admin can pick for a manual stock change; the DB maps them to passbook kinds. */
export const STOCK_ADJUST_REASONS = [
  { value: "restock", label: "Stock received (not via a purchase order)" },
  { value: "correction", label: "Count correction" },
  { value: "damage", label: "Damaged or expired" },
  { value: "manual_adjust", label: "Other adjustment" },
] as const;
