/** Wholesale for kirana shops (0045): hand-typed shapes of the JSON the RPCs return, plus labels. */
export type ShopStatus = "pending" | "approved" | "rejected" | "suspended";
export type WholesaleOrderStatus = "proposed" | "approved" | "placed" | "declined" | "cancelled" | "expired";

export type KiranaShop = {
  id: string; owner_id: string; shop_name: string; owner_name: string; phone: string; gstin: string | null; address_id: string | null;
  monthly_needs: string | null; status: ShopStatus; review_note: string | null; reviewed_at: string | null; created_at: string;
  address?: { house: string; street: string | null; area: string | null; city: string; pincode: string; full_name: string } | null;
};
export type WholesaleCatalogueItem = {
  product_id: string; name: string; slug: string; image_url: string | null; pack_label: string | null; brand_name: string | null; category: string | null;
  case_size: number; moq_cases: number; max_cases: number | null; quote_required: boolean;
  /** Only for the owner of an approved shop or an admin. */ price_per_case: number | null; unit_price: number | null; retail_price: number | null; mrp: number | null;
  is_available: boolean; in_stock_cases: number;
};
export type WholesaleLine = { product_id: string; name: string; pack_label: string | null; image_url: string | null; cases: number; case_size: number; units: number; price_per_case: number | null; line_total: number | null };
export type WholesaleList = { id: string; shop_id: string; name: string; restock_day: number; next_run_date: string; is_active: boolean; items: { product_id: string; cases: number; name: string; pack_label: string | null; image_url: string | null }[] };
export type WholesaleOrder = {
  id: string; shop_id: string; list_id: string | null; restock_date: string; status: WholesaleOrderStatus; items: WholesaleLine[]; subtotal: number; delivery_fee: number; has_unpriced: boolean;
  shop_note: string | null; admin_note: string | null; order_id: string | null; created_at: string; approved_at: string | null; placed_at: string | null;
  order_number?: string | null; order_status?: string | null; shop_name?: string; shop_phone?: string; owner_name?: string;
};
export type MyShop = { shop: KiranaShop | null; list?: WholesaleList | null; orders?: WholesaleOrder[]; settings?: { min_order_amount: number; delivery_fee: number; lead_days: number } };
export type AdminWholesaleProduct = { product_id: string; case_size: number; moq_cases: number; max_cases: number | null; price_per_case: number | null; is_available: boolean; updated_at: string; name: string; pack_label: string | null; image_url: string | null; retail_price: number | null; stock_qty: number | null; product_active: boolean };
export type AdminWholesaleOverview = { shops: (KiranaShop & { list: WholesaleList | null; orders_placed: number })[]; orders: WholesaleOrder[]; products: AdminWholesaleProduct[]; counts: { pending_shops: number; approved_orders: number } };

export const SHOP_STATUS_LABEL: Record<ShopStatus, string> = { pending: "Under review", approved: "Approved", rejected: "Not approved", suspended: "Paused" };
export const WHOLESALE_ORDER_LABEL: Record<WholesaleOrderStatus, string> = { proposed: "Awaiting your review", approved: "Approved · being confirmed", placed: "Placed", declined: "Skipped", cancelled: "Cancelled", expired: "Lapsed" };
export const WHOLESALE_ORDER_LABEL_ADMIN: Record<WholesaleOrderStatus, string> = { proposed: "Awaiting shop review", approved: "Approved · confirm to place", placed: "Placed", declined: "Skipped by shop", cancelled: "Cancelled", expired: "Lapsed" };

export const restockDateLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
