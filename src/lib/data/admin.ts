import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Enums, Json, Tables } from "@/types/database";
import type { AdminStats, Coupon, DeliveryZone, OrderTracking, Product, Setting } from "@/types/app";

/* ------------------------------------------------------------------------------------------------
 * Shared helpers
 * ---------------------------------------------------------------------------------------------- */

export const PAGE_SIZE = 25;

/** Calls an RPC that is not yet in the generated `Database["public"]["Functions"]` (see 0009_admin.sql). Run `pnpm gen:types` to type them. */
export async function adminRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<{ data: T | null; error: { message: string } | null }> {
  const supabase = await createClient();
  // Bound to the client: `rpc` reads `this.rest`, so a detached reference throws
  // "Cannot read properties of undefined (reading 'rest')" and takes the whole page down.
  const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const r = await rpc(fn, args);
  return { data: (r.data as T) ?? null, error: r.error };
}

/** PostgREST `or()` filters are comma/paren delimited; strip those from free text before interpolating. */
export function safeLike(q: string) {
  return `%${q.replace(/[,()%]/g, " ").trim()}%`;
}

export type SP = Record<string, string | string[] | undefined>;
export function spGet(sp: SP, k: string) { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; }
export function spPage(sp: SP) { const n = Number(spGet(sp, "page")); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1; }
export function pageRange(page: number, size = PAGE_SIZE): [number, number] { return [(page - 1) * size, page * size - 1]; }

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

/* ------------------------------------------------------------------------------------------------
 * Dashboard
 * ---------------------------------------------------------------------------------------------- */

export const getAdminStats = cache(async (): Promise<AdminStats | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dashboard_stats");
  if (error) { console.error("admin_dashboard_stats", error.message); return null; }
  return data as unknown as AdminStats;
});

export type AttentionItems = {
  pendingReviews: number;
  openTickets: { id: string; ticket_number: string; subject: string; priority: Enums<"ticket_priority">; created_at: string }[];
  refundsPending: { id: string; order_id: string; amount: number; refund_amount: number; created_at: string; order: { order_number: string } | null }[];
  unassignedReady: { id: string; order_number: string; ready_at: string | null; created_at: string }[];
};

export const getAttentionItems = cache(async (): Promise<AttentionItems> => {
  const supabase = await createClient();
  const [reviews, tickets, refunds, ready] = await Promise.all([
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("support_tickets").select("id, ticket_number, subject, priority, created_at").in("status", ["open", "in_progress"]).order("priority", { ascending: false }).order("created_at").limit(8),
    supabase.from("payments").select("id, order_id, amount, refund_amount, created_at, order:orders(order_number)").eq("refund_required", true).neq("status", "refunded").order("created_at").limit(8),
    supabase.from("orders").select("id, order_number, ready_at, created_at").eq("status", "ready_for_pickup").order("ready_at", { ascending: true, nullsFirst: false }).limit(20),
  ]);
  let unassignedReady = (ready.data ?? []) as unknown as AttentionItems["unassignedReady"];
  if (unassignedReady.length) {
    const { data: live } = await supabase.from("delivery_assignments").select("order_id").in("order_id", unassignedReady.map((o) => o.id)).in("status", ["offered", "accepted", "picked_up"]);
    const busy = new Set((live ?? []).map((a) => a.order_id));
    unassignedReady = unassignedReady.filter((o) => !busy.has(o.id));
  }
  return {
    pendingReviews: reviews.count ?? 0,
    openTickets: (tickets.data ?? []) as AttentionItems["openTickets"],
    refundsPending: (refunds.data ?? []) as unknown as AttentionItems["refundsPending"],
    unassignedReady,
  };
});

/* ------------------------------------------------------------------------------------------------
 * Users
 * ---------------------------------------------------------------------------------------------- */

export type ProfileRow = Tables<"profiles">;

export const listUsers = cache(async (opts: { q?: string; role?: string; active?: string; page?: number }): Promise<Paged<ProfileRow>> => {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  let q = supabase.from("profiles").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  if (opts.role) q = q.eq("role", opts.role as Enums<"user_role">);
  if (opts.active === "1") q = q.eq("is_active", true);
  if (opts.active === "0") q = q.eq("is_active", false);
  if (opts.q) { const like = safeLike(opts.q); q = q.or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like},referral_code.ilike.${like}`); }
  const { data, count } = await q;
  return { items: (data ?? []) as ProfileRow[], total: count ?? 0, page, pageSize: PAGE_SIZE };
});

export type UserStats = { addresses: number; orders: number; delivered_orders: number; cancelled_orders: number; spent: number; last_order_at: string | null; reviews: number; tickets: number; email_auth: string | null; last_sign_in_at: string | null };
export type UserOrderRow = Pick<Tables<"orders">, "id" | "order_number" | "status" | "total" | "payment_method" | "payment_status" | "created_at" | "item_count">;

export const getUserDetail = cache(async (id: string) => {
  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  // A failed query surfaces the route error screen (with Try again); only a missing row is "not found".
  if (error) throw new Error(`Could not load this user: ${error.message}`);
  if (!profile) return null;
  const [stats, orders, wallet, rider] = await Promise.all([
    adminRpc<UserStats>("admin_user_stats", { p_user_id: id }),
    supabase.from("orders").select("id, order_number, status, total, payment_method, payment_status, created_at, item_count").eq("user_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("wallet_transactions").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("delivery_partners").select("id, status, is_online, vehicle_type").eq("user_id", id).maybeSingle(),
  ]);
  return {
    profile: profile as ProfileRow,
    stats: stats.data,
    orders: (orders.data ?? []) as unknown as UserOrderRow[],
    wallet: wallet.data ?? [],
    rider: rider.data,
  };
});

/* ------------------------------------------------------------------------------------------------
 * Products / categories / brands
 * ---------------------------------------------------------------------------------------------- */

export type ProductListRow = Pick<Product, "id" | "name" | "slug" | "pack_label" | "mrp" | "image_url" | "is_active" | "is_local" | "is_veg" | "popularity_score" | "created_at"> & { category: { name: string } | null; brand: { name: string } | null };

export const listProducts = cache(async (opts: { q?: string; category?: string; brand?: string; active?: string; page?: number }): Promise<Paged<ProductListRow>> => {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  let q = supabase.from("products").select("id, name, slug, pack_label, mrp, image_url, is_active, is_local, is_veg, popularity_score, created_at, category:categories(name), brand:brands(name)", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  if (opts.category) q = q.eq("category_id", opts.category);
  if (opts.brand) q = q.eq("brand_id", opts.brand);
  if (opts.active === "1") q = q.eq("is_active", true);
  if (opts.active === "0") q = q.eq("is_active", false);
  if (opts.q) { const like = safeLike(opts.q); q = q.or(`name.ilike.${like},slug.ilike.${like},pack_label.ilike.${like}`); }
  const { data, count } = await q;
  return { items: (data ?? []) as unknown as ProductListRow[], total: count ?? 0, page, pageSize: PAGE_SIZE };
});

export type ProductOfferRow = Tables<"inventory">;

export const getProductAdmin = cache(async (id: string) => {
  const supabase = await createClient();
  const { data: product, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load this product: ${error.message}`);
  if (!product) return null;
  const offers = await supabase.from("inventory").select("*").eq("product_id", id);
  return { product: product as Product, offers: (offers.data ?? []) as ProductOfferRow[] };
});

export type CategoryRow = Tables<"categories">;
export const getAllCategories = cache(async (): Promise<CategoryRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").order("sort_order").order("name");
  return (data ?? []) as CategoryRow[];
});

export const getCategoryProductCounts = cache(async (): Promise<Record<string, number>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("category_id");
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.category_id] = (out[r.category_id] ?? 0) + 1;
  return out;
});

export type BrandRow = Tables<"brands">;
export const getAllBrands = cache(async (): Promise<BrandRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("*").order("name");
  return (data ?? []) as BrandRow[];
});

export const getBrandProductCounts = cache(async (): Promise<Record<string, number>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("brand_id").not("brand_id", "is", null);
  const out: Record<string, number> = {};
  for (const r of data ?? []) if (r.brand_id) out[r.brand_id] = (out[r.brand_id] ?? 0) + 1;
  return out;
});

/* ------------------------------------------------------------------------------------------------
 * Orders
 * ---------------------------------------------------------------------------------------------- */

export type OrderListRow = Pick<Tables<"orders">, "id" | "order_number" | "short_code" | "status" | "payment_method" | "payment_status" | "total" | "item_count" | "delivery_type" | "created_at" | "promised_at" | "delivered_at" | "address_snapshot"> & { customer: { full_name: string | null; phone: string | null } | null };

export type OrderFilters = { q?: string; status?: string; payment?: string; method?: string; from?: string; to?: string; late?: string; delivery?: string };

/** Status tabs map to one or more raw statuses; a raw status value is also accepted. */
export const ORDER_STATUS_GROUPS: Record<string, Enums<"order_status">[]> = {
  active: ["placed", "confirmed", "preparing", "ready_for_pickup", "rider_assigned", "out_for_delivery"],
  new: ["placed"],
  packing: ["placed", "confirmed", "preparing"],
  ready: ["ready_for_pickup"],
  on_the_way: ["rider_assigned", "out_for_delivery"],
  done: ["delivered", "completed"],
  cancelled_all: ["cancelled", "rejected"],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyOrderFilters<Q extends { in: any; eq: any; gte: any; lt: any; or: any }>(query: Q, opts: OrderFilters, withStatus = true): Q {
  let q = query;
  if (withStatus && opts.status) q = ORDER_STATUS_GROUPS[opts.status] ? q.in("status", ORDER_STATUS_GROUPS[opts.status]) : q.eq("status", opts.status as Enums<"order_status">);
  if (opts.late === "1") q = q.in("status", ORDER_STATUS_GROUPS.active).lt("promised_at", new Date().toISOString());
  if (opts.payment) q = q.eq("payment_status", opts.payment as Enums<"payment_status">);
  if (opts.method) q = q.eq("payment_method", opts.method as Enums<"payment_method">);
  if (opts.delivery) q = q.eq("delivery_type", opts.delivery);
  if (opts.from) q = q.gte("created_at", new Date(`${opts.from}T00:00:00+05:30`).toISOString());
  if (opts.to) q = q.lt("created_at", new Date(new Date(`${opts.to}T00:00:00+05:30`).getTime() + 86400000).toISOString());
  if (opts.q) { const like = safeLike(opts.q); q = q.or(`order_number.ilike.${like},short_code.ilike.${like},address_snapshot->>phone.ilike.${like},address_snapshot->>full_name.ilike.${like}`); }
  return q;
}

export const listOrders = cache(async (opts: OrderFilters & { page?: number }): Promise<Paged<OrderListRow>> => {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  const base = supabase.from("orders").select("id, order_number, short_code, status, payment_method, payment_status, total, item_count, delivery_type, created_at, promised_at, delivered_at, address_snapshot, customer:profiles!orders_user_id_fkey(full_name, phone)", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  const { data, count, error } = await applyOrderFilters(base, opts);
  if (error) console.error("listOrders", error.message);
  return { items: (data ?? []) as unknown as OrderListRow[], total: count ?? 0, page, pageSize: PAGE_SIZE };
});

/** Head-only counts for each status tab, honouring the search and the other filters. */
export const countOrdersByTab = cache(async (opts: OrderFilters, tabs: string[]): Promise<Record<string, number>> => {
  const supabase = await createClient();
  const res = await Promise.all(tabs.map((t) => {
    const q = applyOrderFilters(supabase.from("orders").select("id", { count: "exact", head: true }), { ...opts, status: t || undefined });
    return q.then((r: { count: number | null }) => [t, r.count ?? 0] as const);
  }));
  return Object.fromEntries(res);
});

export const getOrderAdmin = cache(async (id: string): Promise<OrderTracking | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_tracking", { p_order_id: id });
  if (error || !data) return null;
  return data as unknown as OrderTracking;
});

export type AssignmentRow = Tables<"delivery_assignments"> & { rider: { id: string; user: { full_name: string | null; phone: string | null } | null } | null };
export const getOrderAssignments = cache(async (orderId: string): Promise<AssignmentRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("delivery_assignments").select("*, rider:delivery_partners(id, user:profiles(full_name, phone))").eq("order_id", orderId).order("created_at", { ascending: false });
  return (data ?? []) as unknown as AssignmentRow[];
});

export type LiveRider = { id: string; user_id: string; name: string | null; phone: string | null; avatar_url: string | null; vehicle_type: Enums<"vehicle_type">; vehicle_number: string | null; rating_avg: number; lat: number | null; lng: number | null; last_location_at: string | null; busy: boolean; current_order: { id: string; order_number: string; status: string } | null };
export const getLiveRiders = cache(async (): Promise<LiveRider[]> => {
  const { data } = await adminRpc<LiveRider[]>("admin_live_riders");
  return data ?? [];
});

/* ------------------------------------------------------------------------------------------------
 * Delivery: cities, zones, settings
 * ---------------------------------------------------------------------------------------------- */

export type CityRow = Tables<"cities">;
export const getCities = cache(async (): Promise<CityRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("cities").select("*").order("is_active", { ascending: false }).order("name");
  return (data ?? []) as CityRow[];
});

export const getZones = cache(async (): Promise<DeliveryZone[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("delivery_zones").select("*").order("name");
  return (data ?? []) as DeliveryZone[];
});

export const getSettings = cache(async (group?: string): Promise<Setting[]> => {
  const supabase = await createClient();
  let q = supabase.from("settings").select("*").order("group").order("key");
  if (group) q = q.eq("group", group);
  const { data } = await q;
  return (data ?? []) as Setting[];
});

/* ------------------------------------------------------------------------------------------------
 * Riders
 * ---------------------------------------------------------------------------------------------- */

export type RiderRow = Tables<"delivery_partners"> & { user: { full_name: string | null; phone: string | null; email: string | null; avatar_url: string | null; is_active: boolean } | null };

export const listRiders = cache(async (opts: { q?: string; status?: string; online?: string; page?: number }): Promise<Paged<RiderRow>> => {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  let q = supabase.from("delivery_partners").select("*, user:profiles(full_name, phone, email, avatar_url, is_active)", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  if (opts.status) q = q.eq("status", opts.status as Enums<"rider_status">);
  if (opts.online === "1") q = q.eq("is_online", true);
  if (opts.online === "0") q = q.eq("is_online", false);
  if (opts.q) { const like = safeLike(opts.q); q = q.or(`vehicle_number.ilike.${like},license_number.ilike.${like}`); }
  const { data, count } = await q;
  return { items: (data ?? []) as unknown as RiderRow[], total: count ?? 0, page, pageSize: PAGE_SIZE };
});

export type RiderAssignmentRow = Tables<"delivery_assignments"> & { order: { id: string; order_number: string; status: Enums<"order_status">; total: number } | null };

export const getRiderDetail = cache(async (id: string) => {
  const supabase = await createClient();
  const { data: rider, error } = await supabase.from("delivery_partners").select("*, user:profiles(full_name, phone, email, avatar_url, is_active, created_at)").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load this rider: ${error.message}`);
  if (!rider) return null;
  const [assignments, reviews] = await Promise.all([
    supabase.from("delivery_assignments").select("*, order:orders(id, order_number, status, total)").eq("rider_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("reviews").select("id, rating, comment, created_at, status").eq("rider_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  return { rider: rider as unknown as RiderRow & { user: { created_at: string } | null }, assignments: (assignments.data ?? []) as unknown as RiderAssignmentRow[], reviews: reviews.data ?? [] };
});

/* ------------------------------------------------------------------------------------------------
 * Coupons / promotions / banners
 * ---------------------------------------------------------------------------------------------- */

export type CouponStats = Record<string, { uses: number; unique_users: number; discount_total: number; last_used_at: string | null }>;

export const listCoupons = cache(async (opts: { q?: string; status?: string; page?: number }): Promise<Paged<Coupon>> => {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  let q = supabase.from("coupons").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  if (opts.status === "active") q = q.eq("is_active", true);
  if (opts.status === "inactive") q = q.eq("is_active", false);
  if (opts.status === "expired") q = q.lt("expires_at", new Date().toISOString());
  if (opts.q) { const like = safeLike(opts.q); q = q.or(`code.ilike.${like},title.ilike.${like}`); }
  const { data, count } = await q;
  return { items: (data ?? []) as Coupon[], total: count ?? 0, page, pageSize: PAGE_SIZE };
});

export const getCouponStats = cache(async (): Promise<CouponStats> => {
  const { data } = await adminRpc<CouponStats>("admin_coupon_stats");
  return data ?? {};
});

export type BannerRow = Tables<"banners">;
export type PromotionRow = Tables<"promotions">;

export const getBanners = cache(async (): Promise<BannerRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("banners").select("*").order("placement").order("sort_order");
  return (data ?? []) as BannerRow[];
});

export const getPromotions = cache(async (): Promise<PromotionRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("promotions").select("*").order("sort_order").order("created_at", { ascending: false });
  return (data ?? []) as PromotionRow[];
});

export const getProductOptions = cache(async (ids: string[]) => {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id, name, pack_label").in("id", ids);
  return data ?? [];
});

/* ------------------------------------------------------------------------------------------------
 * Payments / payouts
 * ---------------------------------------------------------------------------------------------- */

export type PaymentRow = Tables<"payments"> & { order: { order_number: string; status: Enums<"order_status">; total: number } | null; user: { full_name: string | null; phone: string | null } | null };

export const listPayments = cache(async (opts: { q?: string; status?: string; provider?: string; method?: string; refunds?: boolean; from?: string; to?: string; page?: number }): Promise<Paged<PaymentRow>> => {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  let q = supabase.from("payments").select("*, order:orders(order_number, status, total), user:profiles!payments_user_id_fkey(full_name, phone)", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  if (opts.refunds) q = q.eq("refund_required", true).neq("status", "refunded");
  if (opts.status) q = q.eq("status", opts.status as Enums<"payment_status">);
  if (opts.provider) q = q.eq("provider", opts.provider as Enums<"payment_provider">);
  if (opts.method) q = q.eq("method", opts.method as Enums<"payment_method">);
  if (opts.from) q = q.gte("created_at", new Date(`${opts.from}T00:00:00+05:30`).toISOString());
  if (opts.to) q = q.lt("created_at", new Date(new Date(`${opts.to}T00:00:00+05:30`).getTime() + 86400000).toISOString());
  if (opts.q) { const like = safeLike(opts.q); q = q.or(`provider_order_id.ilike.${like},provider_payment_id.ilike.${like},refund_id.ilike.${like}`); }
  const { data, count, error } = await q;
  if (error) console.error("listPayments", error.message);
  return { items: (data ?? []) as unknown as PaymentRow[], total: count ?? 0, page, pageSize: PAGE_SIZE };
});

export const countPendingRefunds = cache(async () => {
  const supabase = await createClient();
  const { count } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("refund_required", true).neq("status", "refunded");
  return count ?? 0;
});

/* ------------------------------------------------------------------------------------------------
 * Reports
 * ---------------------------------------------------------------------------------------------- */

export type AdminReport = {
  range: { start: string; end: string };
  orders: number; delivered: number; cancelled: number; gmv: number; item_sales: number; delivery_fees: number; platform_fees: number; taxes: number; rider_earnings: number; coupon_discounts: number; net_revenue: number; avg_order_value: number; avg_delivery_minutes: number | null; new_customers: number;
  payment_methods: Record<string, number>;
  daily: { day: string; orders: number; gmv: number; cancelled: number }[];
  top_products: { product_id: string; name: string; quantity: number; revenue: number; orders: number }[];
  top_categories: { category_id: string; name: string; quantity: number; revenue: number }[];
  riders: { rider_id: string; name: string | null; deliveries: number; earnings: number; avg_minutes: number | null; distance_km: number; rating: number }[];
};

export const getReport = cache(async (start: string, end: string): Promise<AdminReport | null> => {
  const { data, error } = await adminRpc<AdminReport>("admin_report", { p_start: start, p_end: end });
  if (error) { console.error("admin_report", error.message); return null; }
  return data;
});

/* ------------------------------------------------------------------------------------------------
 * Notifications / support / reviews / audit
 * ---------------------------------------------------------------------------------------------- */

export const getAdminNotifications = cache(async (limit = 50) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { items: [], unread: 0 };
  const [{ data }, { count }] = await Promise.all([
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
  ]);
  return { items: (data ?? []) as Tables<"notifications">[], unread: count ?? 0 };
});

export const getRecentBroadcasts = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("audit_logs").select("id, created_at, after_data, actor_id").eq("action", "notification.broadcast").order("created_at", { ascending: false }).limit(10);
  return (data ?? []) as { id: number; created_at: string; after_data: Json; actor_id: string | null }[];
});

export type TicketRow = Tables<"support_tickets"> & { user: { full_name: string | null; phone: string | null; email: string | null } | null; assignee: { full_name: string | null } | null; order: { order_number: string } | null };

export const listTickets = cache(async (opts: { q?: string; status?: string; priority?: string; category?: string; page?: number }): Promise<Paged<TicketRow>> => {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  let q = supabase.from("support_tickets").select("*, user:profiles!support_tickets_user_id_fkey(full_name, phone, email), assignee:profiles!support_tickets_assigned_to_fkey(full_name), order:orders(order_number)", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  if (opts.status === "open_all") q = q.in("status", ["open", "in_progress"]);
  else if (opts.status) q = q.eq("status", opts.status as Enums<"ticket_status">);
  if (opts.priority) q = q.eq("priority", opts.priority as Enums<"ticket_priority">);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.q) { const like = safeLike(opts.q); q = q.or(`ticket_number.ilike.${like},subject.ilike.${like}`); }
  const { data, count, error } = await q;
  if (error) console.error("listTickets", error.message);
  return { items: (data ?? []) as unknown as TicketRow[], total: count ?? 0, page, pageSize: PAGE_SIZE };
});

export type TicketMessage = Tables<"support_messages"> & { sender: { full_name: string | null; role: Enums<"user_role"> } | null };

export const getTicketAdmin = cache(async (id: string) => {
  const supabase = await createClient();
  const { data: ticket, error } = await supabase.from("support_tickets").select("*, user:profiles!support_tickets_user_id_fkey(full_name, phone, email), assignee:profiles!support_tickets_assigned_to_fkey(full_name), order:orders(order_number)").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load this ticket: ${error.message}`);
  if (!ticket) return null;
  const { data: messages } = await supabase.from("support_messages").select("*, sender:profiles(full_name, role)").eq("ticket_id", id).order("created_at");
  return { ticket: ticket as unknown as TicketRow, messages: (messages ?? []) as unknown as TicketMessage[] };
});

export type ReviewRow = Tables<"reviews"> & { user: { full_name: string | null } | null; product: { name: string; slug: string } | null; rider: { id: string; user: { full_name: string | null } | null } | null; order: { order_number: string } | null };

export const listReviews = cache(async (opts: { status?: string; target?: string; page?: number }): Promise<Paged<ReviewRow>> => {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  let q = supabase.from("reviews").select("*, user:profiles!reviews_user_id_fkey(full_name), product:products(name, slug), rider:delivery_partners(id, user:profiles(full_name)), order:orders(order_number)", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  q = q.eq("status", (opts.status || "pending") as Enums<"review_status">);
  if (opts.target) q = q.eq("target", opts.target as Enums<"review_target">);
  const { data, count, error } = await q;
  if (error) console.error("listReviews", error.message);
  return { items: (data ?? []) as unknown as ReviewRow[], total: count ?? 0, page, pageSize: PAGE_SIZE };
});

export const getReviewCounts = cache(async () => {
  const supabase = await createClient();
  const [p, a, r] = await Promise.all([
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "rejected"),
  ]);
  return { pending: p.count ?? 0, approved: a.count ?? 0, rejected: r.count ?? 0 };
});

export type AuditRow = Tables<"audit_logs"> & { actor: { full_name: string | null; role: Enums<"user_role"> } | null };

export const listAuditLogs = cache(async (opts: { entity?: string; action?: string; actor?: string; q?: string; page?: number }): Promise<Paged<AuditRow>> => {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  let q = supabase.from("audit_logs").select("*, actor:profiles(full_name, role)", { count: "exact" }).order("id", { ascending: false }).range(...pageRange(page));
  if (opts.entity) q = q.eq("entity", opts.entity);
  if (opts.action) q = q.ilike("action", `${opts.action.replace(/[,()%]/g, "")}%`);
  if (opts.actor) q = q.eq("actor_id", opts.actor);
  if (opts.q) q = q.ilike("entity_id", safeLike(opts.q));
  const { data, count, error } = await q;
  if (error) console.error("listAuditLogs", error.message);
  return { items: (data ?? []) as unknown as AuditRow[], total: count ?? 0, page, pageSize: PAGE_SIZE };
});

export const getAuditFacets = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("audit_logs").select("entity, action").order("id", { ascending: false }).limit(2000);
  const entities = new Set<string>(); const actions = new Set<string>();
  for (const r of data ?? []) { entities.add(r.entity); actions.add(r.action); }
  return { entities: [...entities].sort(), actions: [...actions].sort() };
});

export const getAdminUsers = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, role").in("role", ["admin", "super_admin"]).order("full_name");
  return data ?? [];
});

/* ------------------------------------------------------------------------------------------------
 * Photo studio — catalogue image coverage
 * ---------------------------------------------------------------------------------------------- */

export type PhotoRow = { id: string; name: string; slug: string; pack_label: string | null; image_url: string | null; images: string[]; brand: { name: string } | null; category: { name: string } | null };

/** Products split by whether they have a photo, so the studio can show what still needs one. */
export const listPhotoQueue = cache(async (opts: { q?: string; have?: string; category?: string; brand?: string; page?: number }): Promise<Paged<PhotoRow> & { withPhoto: number; totalProducts: number }> => {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  const select = "id, name, slug, pack_label, image_url, images, brand:brands(name), category:categories(name)";
  let q = supabase.from("products").select(select, { count: "exact" }).eq("is_active", true).order("popularity_score", { ascending: false }).order("name").range(...pageRange(page));
  if (opts.have === "1") q = q.not("image_url", "is", null);
  else if (opts.have !== "all") q = q.is("image_url", null);
  if (opts.category) q = q.eq("category_id", opts.category);
  if (opts.brand) q = q.eq("brand_id", opts.brand);
  if (opts.q) { const like = safeLike(opts.q); q = q.or(`name.ilike.${like},slug.ilike.${like}`); }
  const [{ data, count }, withPhoto, totalProducts] = await Promise.all([
    q,
    supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true).not("image_url", "is", null),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  return { items: (data ?? []) as unknown as PhotoRow[], total: count ?? 0, page, pageSize: PAGE_SIZE, withPhoto: withPhoto.count ?? 0, totalProducts: totalProducts.count ?? 0 };
});
