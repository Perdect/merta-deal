import { cache } from "react";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { getOrderTracking } from "@/lib/data/orders";
import { STORE_ORDER_TABS, type StoreOrderTab } from "@/components/store/constants";
import type { Category, Inventory, Order, OrderTracking, Store, StoreStats } from "@/types/app";
import type { Enums, Tables } from "@/types/database";

/* ------------------------------------------------------------------------------------------------
 * Merchant portal readers. Every query is scoped to the caller's store (RLS enforces membership) and
 * is bounded (paginated or limited) so a busy store never pulls thousands of rows into a page.
 * ---------------------------------------------------------------------------------------------- */

export type StoreRole = "owner" | Enums<"store_staff_role">;
export type StoreMembership = { store: Store; role: StoreRole };

/** Minimal untyped RPC caller for functions added after `src/types/database.ts` was generated (0008). */
export type LooseRpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
export function looseRpc(client: unknown): LooseRpcClient["rpc"] {
  return (fn, args) => (client as LooseRpcClient).rpc(fn, args);
}

/** The signed-in user's store: owned store first, otherwise the first active staff membership. Cached per request. */
export const getMyStore = cache(async (): Promise<StoreMembership | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: owned } = await supabase.from("stores").select("*").eq("owner_id", user.id).order("created_at").limit(1).maybeSingle();
  if (owned) return { store: owned as Store, role: "owner" };
  const { data: staff } = await supabase.from("store_staff").select("store_id, role").eq("user_id", user.id).eq("is_active", true).order("created_at").limit(1).maybeSingle();
  if (!staff) return null;
  const { data: store } = await supabase.from("stores").select("*").eq("id", staff.store_id).maybeSingle();
  if (!store) return null;
  return { store: store as Store, role: staff.role };
});

export const getStoreStats = cache(async (storeId: string): Promise<StoreStats | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_dashboard_stats", { p_store_id: storeId });
  if (error) { console.error("store_dashboard_stats", error.message); return null; }
  return data as unknown as StoreStats;
});

/* Orders ------------------------------------------------------------------------------------- */

export type { StoreOrderTab };

export type StoreOrderRow = Pick<Order, "id" | "order_number" | "status" | "created_at" | "address_snapshot" | "item_count" | "total" | "payment_method" | "payment_status" | "delivery_type" | "promised_at" | "scheduled_slot_start" | "short_code">;
const ORDER_ROW_COLS = "id, order_number, status, created_at, address_snapshot, item_count, total, payment_method, payment_status, delivery_type, promised_at, scheduled_slot_start, short_code";

export const getStoreOrders = cache(async (storeId: string, opts: { tab?: StoreOrderTab; page?: number; pageSize?: number } = {}): Promise<{ orders: StoreOrderRow[]; total: number; page: number; pageSize: number }> => {
  const supabase = await createClient();
  const tab = STORE_ORDER_TABS.find((t) => t.value === (opts.tab ?? "new")) ?? STORE_ORDER_TABS[0];
  const page = Math.max(1, opts.page ?? 1); const pageSize = Math.min(50, opts.pageSize ?? 20);
  const ascending = tab.value === "new"; // oldest new order first: first come, first served
  const { data, count } = await supabase.from("orders").select(ORDER_ROW_COLS, { count: "exact" }).eq("store_id", storeId).in("status", tab.statuses).order("created_at", { ascending }).range((page - 1) * pageSize, page * pageSize - 1);
  return { orders: (data ?? []) as StoreOrderRow[], total: count ?? 0, page, pageSize };
});

/** Counts for the live tabs only (active orders are few); history tabs are left uncounted on purpose. */
export const getStoreOrderTabCounts = cache(async (storeId: string): Promise<Partial<Record<StoreOrderTab, number>>> => {
  const supabase = await createClient();
  const active = STORE_ORDER_TABS.filter((t) => !["completed", "cancelled"].includes(t.value));
  const { data } = await supabase.from("orders").select("status").eq("store_id", storeId).in("status", active.flatMap((t) => t.statuses)).limit(500);
  const counts: Partial<Record<StoreOrderTab, number>> = {};
  for (const t of active) counts[t.value] = (data ?? []).filter((o) => (t.statuses as string[]).includes(o.status)).length;
  return counts;
});

export const getPendingStoreOrders = cache(async (storeId: string, limit = 10): Promise<StoreOrderRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select(ORDER_ROW_COLS).eq("store_id", storeId).eq("status", "placed").order("created_at", { ascending: true }).limit(limit);
  return (data ?? []) as StoreOrderRow[];
});

/** Full order payload for the store view (rpc order_tracking, viewer = 'store'). Null when not ours. */
export const getStoreOrderTracking = cache(async (storeId: string, orderId: string): Promise<OrderTracking | null> => {
  const t = await getOrderTracking(orderId);
  if (!t || t.order.store_id !== storeId) return null;
  return t;
});

/* Products & inventory ----------------------------------------------------------------------- */

export type StoreInventoryRow = Inventory & {
  product: Pick<Tables<"products">, "id" | "name" | "slug" | "image_url" | "pack_label" | "weight_value" | "weight_unit" | "is_veg" | "is_local" | "brand_id" | "category_id" | "created_by_store_id" | "description" | "is_active" | "is_approved"> & {
    brand: { name: string } | null;
    category: Pick<Category, "id" | "name" | "slug" | "parent_id" | "is_active"> | null;
  };
};
const INVENTORY_COLS = "*, product:products!inner(id, name, slug, image_url, pack_label, weight_value, weight_unit, is_veg, is_local, brand_id, category_id, created_by_store_id, description, is_active, is_approved, brand:brands(name), category:categories(id, name, slug, parent_id, is_active))";

export const INVENTORY_SORTS = { recent: "Recently updated", name: "Name (A–Z)", stock_low: "Stock: low to high", price_low: "Price: low to high", price_high: "Price: high to low" } as const;
export type InventorySort = keyof typeof INVENTORY_SORTS;
export type InventoryFilter = { q?: string; status?: Enums<"inventory_status"> | ""; categoryId?: string; page?: number; pageSize?: number; activeOnly?: boolean; sort?: InventorySort };

export const getStoreInventory = cache(async (storeId: string, f: InventoryFilter = {}): Promise<{ items: StoreInventoryRow[]; total: number; page: number; pageSize: number; error: boolean }> => {
  const supabase = await createClient();
  const page = Math.max(1, f.page ?? 1); const pageSize = Math.min(60, f.pageSize ?? 24);
  let q = supabase.from("inventory").select(INVENTORY_COLS, { count: "exact" }).eq("store_id", storeId);
  if (f.q?.trim()) q = q.ilike("product.name", `%${f.q.trim().replace(/[%_]/g, "")}%`);
  if (f.status) q = q.eq("status", f.status);
  if (f.categoryId) q = q.eq("product.category_id", f.categoryId);
  if (f.activeOnly) q = q.eq("is_active", true);
  // Stable ordering: the chosen sort, then id, so pages never repeat or skip rows.
  q = f.sort === "name" ? q.order("product(name)", { ascending: true })
    : f.sort === "stock_low" ? q.order("stock_qty", { ascending: true })
    : f.sort === "price_low" ? q.order("selling_price", { ascending: true })
    : f.sort === "price_high" ? q.order("selling_price", { ascending: false })
    : q.order("updated_at", { ascending: false });
  const { data, count, error } = await q.order("id").range((page - 1) * pageSize, page * pageSize - 1);
  if (error) console.error("getStoreInventory", error.message);
  return { items: (data ?? []) as unknown as StoreInventoryRow[], total: count ?? 0, page, pageSize, error: Boolean(error) };
});

/** Listing counts per stock state (same search/category filters), for the filter chips. */
export const getStoreInventoryCounts = cache(async (storeId: string, f: Pick<InventoryFilter, "q" | "categoryId"> = {}): Promise<Record<"" | Enums<"inventory_status">, number> | null> => {
  const supabase = await createClient();
  const count = async (status?: Enums<"inventory_status">) => {
    let q = supabase.from("inventory").select("id, product:products!inner(id)", { count: "exact", head: true }).eq("store_id", storeId);
    if (f.q?.trim()) q = q.ilike("product.name", `%${f.q.trim().replace(/[%_]/g, "")}%`);
    if (f.categoryId) q = q.eq("product.category_id", f.categoryId);
    if (status) q = q.eq("status", status);
    const { count: n, error } = await q;
    return error ? null : n ?? 0;
  };
  const [all, inS, low, out] = await Promise.all([count(), count("in_stock"), count("low_stock"), count("out_of_stock")]);
  if (all === null || inS === null || low === null || out === null) return null;
  return { "": all, in_stock: inS, low_stock: low, out_of_stock: out };
});

export const getInventoryItem = cache(async (storeId: string, inventoryId: string): Promise<StoreInventoryRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("inventory").select(INVENTORY_COLS).eq("store_id", storeId).eq("id", inventoryId).maybeSingle();
  return (data as unknown as StoreInventoryRow) ?? null;
});

/** Product ids already listed by this store (bounded; used to mark catalog search results). */
export const getStoreProductIds = cache(async (storeId: string, limit = 500): Promise<string[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("inventory").select("product_id").eq("store_id", storeId).order("updated_at", { ascending: false }).limit(limit);
  return (data ?? []).map((r) => r.product_id);
});

/** Items that need attention: low or out of stock (bounded). */
export const getLowStockItems = cache(async (storeId: string, limit = 40): Promise<StoreInventoryRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("inventory").select(INVENTORY_COLS).eq("store_id", storeId).eq("is_active", true).in("status", ["low_stock", "out_of_stock"]).order("stock_qty", { ascending: true }).limit(limit);
  return (data ?? []) as unknown as StoreInventoryRow[];
});

export type MovementRow = Tables<"inventory_movements"> & { inventory: { store_id: string; product: { name: string } | null } | null };
export const getRecentMovements = cache(async (storeId: string, limit = 30): Promise<MovementRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("inventory_movements").select("*, inventory:inventory!inner(store_id, product:products(name))").eq("inventory.store_id", storeId).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as unknown as MovementRow[];
});

/** Leaf categories grouped under their parent (for the product form select and list filter). */
export type CategoryGroup = { parent: Category; children: Category[] };
export const getCategoryGroups = cache(async (): Promise<CategoryGroup[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").eq("is_active", true).order("sort_order").order("name");
  const all = (data ?? []) as Category[];
  const parents = all.filter((c) => !c.parent_id);
  // A top-level category with no sub-categories is itself the leaf products are filed under (30+ catalog
  // products use one), so it is offered as its own option instead of disappearing from the list.
  return parents.map((p) => {
    const children = all.filter((c) => c.parent_id === p.id);
    return { parent: p, children: children.length ? children : [p] };
  });
});

/* Customers ---------------------------------------------------------------------------------- */

export type StoreCustomer = { user_id: string; name: string; phone: string; orders: number; spent: number; last_order_at: string; last_status: Enums<"order_status"> };
const CUSTOMER_SAMPLE = 500;

/** Derived from the store's most recent orders (bounded sample; the UI states the window). */
export const getStoreCustomers = cache(async (storeId: string): Promise<{ customers: StoreCustomer[]; sampled: number; capped: boolean }> => {
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("user_id, address_snapshot, total, status, created_at").eq("store_id", storeId).order("created_at", { ascending: false }).limit(CUSTOMER_SAMPLE);
  const rows = data ?? [];
  const map = new Map<string, StoreCustomer>();
  for (const o of rows) {
    const snap = (o.address_snapshot ?? {}) as { full_name?: string; phone?: string };
    const counted = !["cancelled", "rejected"].includes(o.status);
    const cur = map.get(o.user_id);
    if (cur) { cur.orders += counted ? 1 : 0; cur.spent += counted ? Number(o.total) : 0; }
    else map.set(o.user_id, { user_id: o.user_id, name: snap.full_name ?? "Customer", phone: snap.phone ?? "", orders: counted ? 1 : 0, spent: counted ? Number(o.total) : 0, last_order_at: o.created_at, last_status: o.status });
  }
  const customers = [...map.values()].sort((a, b) => b.spent - a.spent);
  return { customers, sampled: rows.length, capped: rows.length >= CUSTOMER_SAMPLE };
});

/* Payments & earnings ------------------------------------------------------------------------ */

export type StorePaymentRow = Tables<"payments"> & { order: { order_number: string; store_id: string; status: Enums<"order_status"> } | null };
export const getStorePayments = cache(async (storeId: string, opts: { page?: number; pageSize?: number } = {}): Promise<{ payments: StorePaymentRow[]; total: number; page: number; pageSize: number }> => {
  const supabase = await createClient();
  const page = Math.max(1, opts.page ?? 1); const pageSize = Math.min(50, opts.pageSize ?? 25);
  const { data, count } = await supabase.from("payments").select("*, order:orders!inner(order_number, store_id, status)", { count: "exact" }).eq("order.store_id", storeId).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  return { payments: (data ?? []) as unknown as StorePaymentRow[], total: count ?? 0, page, pageSize };
});

export type PaymentSummary = { days: number; cod_collected: number; cod_pending: number; online_paid: number; refunded: number; count: number };
/** Collected vs online for a recent window (bounded by date and row cap). */
export const getStorePaymentSummary = cache(async (storeId: string, days = 30): Promise<PaymentSummary> => {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase.from("payments").select("method, status, amount, refund_amount, order:orders!inner(store_id)").eq("order.store_id", storeId).gte("created_at", since).limit(2000);
  const s: PaymentSummary = { days, cod_collected: 0, cod_pending: 0, online_paid: 0, refunded: 0, count: 0 };
  for (const p of data ?? []) {
    s.count += 1;
    const amt = Number(p.amount);
    if (p.method === "cod") { if (p.status === "cod_collected") s.cod_collected += amt; else if (p.status === "cod_pending" || p.status === "pending") s.cod_pending += amt; }
    else if (p.status === "paid" || p.status === "authorized") s.online_paid += amt;
    if (p.status === "refunded" || p.status === "partially_refunded") s.refunded += Number(p.refund_amount);
  }
  return s;
});

export type EarningsBucket = { key: string; label: string; orders: number; gross: number; commission: number; net: number };
export type StoreEarnings = { daily: EarningsBucket[]; weekly: EarningsBucket[]; window_days: number; window_orders: number; window_gross: number; window_commission: number; window_net: number; capped: boolean };
const EARNINGS_DAYS = 56; const EARNINGS_CAP = 2000;

/** Delivered/completed orders in the last 8 weeks, bucketed by IST day and week. */
export const getStoreEarnings = cache(async (storeId: string): Promise<StoreEarnings> => {
  const supabase = await createClient();
  const since = new Date(Date.now() - EARNINGS_DAYS * 86400000).toISOString();
  const { data } = await supabase.from("orders").select("created_at, subtotal, commission_amount, store_payout_amount").eq("store_id", storeId).in("status", ["delivered", "completed"]).gte("created_at", since).order("created_at", { ascending: false }).limit(EARNINGS_CAP);
  const rows = data ?? [];
  const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(iso));
  const daily = new Map<string, EarningsBucket>(); const weekly = new Map<string, EarningsBucket>();
  const bump = (m: Map<string, EarningsBucket>, key: string, label: string, r: (typeof rows)[number]) => {
    const b = m.get(key) ?? { key, label, orders: 0, gross: 0, commission: 0, net: 0 };
    b.orders += 1; b.gross += Number(r.subtotal); b.commission += Number(r.commission_amount); b.net += Number(r.store_payout_amount);
    m.set(key, b);
  };
  const totals = { orders: 0, gross: 0, commission: 0, net: 0 };
  for (const r of rows) {
    bump(daily, dayKey(r.created_at), dayLabel(r.created_at), r);
    const d = new Date(r.created_at); const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); monday.setUTCHours(0, 0, 0, 0);
    bump(weekly, monday.toISOString().slice(0, 10), `Week of ${dayLabel(monday.toISOString())}`, r);
    totals.orders += 1; totals.gross += Number(r.subtotal); totals.commission += Number(r.commission_amount); totals.net += Number(r.store_payout_amount);
  }
  return {
    daily: [...daily.values()].sort((a, b) => (a.key < b.key ? 1 : -1)).slice(0, 14),
    weekly: [...weekly.values()].sort((a, b) => (a.key < b.key ? 1 : -1)).slice(0, 8),
    window_days: EARNINGS_DAYS, window_orders: totals.orders, window_gross: totals.gross, window_commission: totals.commission, window_net: totals.net, capped: rows.length >= EARNINGS_CAP,
  };
});

export const getStorePayouts = cache(async (storeId: string, limit = 50): Promise<Tables<"payouts">[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("payouts").select("*").eq("store_id", storeId).order("period_end", { ascending: false }).limit(limit);
  return data ?? [];
});

/* Profile, documents, staff ------------------------------------------------------------------ */

export const getStoreDocuments = cache(async (storeId: string): Promise<Tables<"store_documents">[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("store_documents").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(50);
  return data ?? [];
});

export type StaffMember = { id: string; user_id: string; role: Enums<"store_staff_role">; is_active: boolean; created_at: string; full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null };
export const getStoreStaff = cache(async (storeId: string): Promise<StaffMember[]> => {
  const supabase = await createClient();
  const { data, error } = await looseRpc(supabase)("store_list_staff", { p_store_id: storeId });
  if (error) { console.error("store_list_staff", error.message); return []; }
  return (data as StaffMember[] | null) ?? [];
});

/** Signed URL for a private store document (bucket store-documents), or null when unavailable. */
export async function getDocumentUrl(filePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("store-documents").createSignedUrl(filePath, 60 * 10);
  return data?.signedUrl ?? null;
}

