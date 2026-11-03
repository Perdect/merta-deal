import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";
import type { Coupon } from "@/types/app";
import { PAGE_SIZE, pageRange, safeLike, type AuditRow, type Paged, type PaymentRow, type ReviewRow, type TicketRow } from "./admin";

/* ================================================================================================
 * Read helpers for the marketing, finance, customer-care and system admin pages: list queries with
 * the filters those pages need, plus head-only counts for their status tabs. Read-only; every
 * mutation still goes through src/lib/actions/admin.ts.
 * ============================================================================================== */

// Supabase query builders are deeply generic; filters are applied through this loose shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

const istDayStart = (day: string) => new Date(`${day}T00:00:00+05:30`).toISOString();
const istDayEnd = (day: string) => new Date(new Date(`${day}T00:00:00+05:30`).getTime() + 86400000).toISOString();
const validDay = (s?: string) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));
function applyDates(q: Q, from?: string, to?: string, col = "created_at"): Q {
  let x = q;
  if (validDay(from)) x = x.gte(col, istDayStart(from!));
  if (validDay(to)) x = x.lt(col, istDayEnd(to!));
  return x;
}
async function headCounts(tabs: string[], build: (tab: string) => Q): Promise<Record<string, number>> {
  const res = await Promise.all(tabs.map(async (t) => { const r = await build(t); return [t, (r as { count: number | null }).count ?? 0] as const; }));
  return Object.fromEntries(res);
}

/* ------------------------------------------------------------------------------------------------
 * Coupons: Active = switched on and not past expiry; Inactive = switched off and not expired;
 * Expired = past expiry (whatever the switch says).
 * ---------------------------------------------------------------------------------------------- */

export const COUPON_TABS = ["", "active", "inactive", "expired"] as const;

function couponFilter(q: Q, status: string, nowIso: string, search?: string): Q {
  let x = q;
  const notExpired = `expires_at.is.null,expires_at.gt."${nowIso}"`;
  if (status === "active") x = x.eq("is_active", true).or(notExpired);
  if (status === "inactive") x = x.eq("is_active", false).or(notExpired);
  if (status === "expired") x = x.lte("expires_at", nowIso);
  if (search) { const like = safeLike(search); x = x.or(`code.ilike.${like},title.ilike.${like}`); }
  return x;
}

export const listCouponsAdmin = cache(async (opts: { q?: string; status?: string; page?: number; nowIso: string }): Promise<Paged<Coupon> & { error: boolean }> => {
  const supabase = await createClient();
  const page = opts.page ?? 1;
  const base = supabase.from("coupons").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  const { data, count, error } = await couponFilter(base, opts.status ?? "", opts.nowIso, opts.q);
  if (error) console.error("listCouponsAdmin", error.message);
  return { items: (data ?? []) as Coupon[], total: count ?? 0, page, pageSize: PAGE_SIZE, error: Boolean(error) };
});

export const countCoupons = cache(async (q: string, nowIso: string) => {
  const supabase = await createClient();
  return headCounts([...COUPON_TABS], (t) => couponFilter(supabase.from("coupons").select("id", { count: "exact", head: true }), t, nowIso, q));
});

/* ------------------------------------------------------------------------------------------------
 * Payments. Tabs group the raw payment statuses; "refunds" is the refund-due queue.
 * ---------------------------------------------------------------------------------------------- */

export const PAYMENT_TAB_STATUSES: Record<string, Enums<"payment_status">[]> = {
  due: ["pending", "cod_pending"],
  paid: ["paid", "authorized", "cod_collected"],
  failed: ["failed"],
  refunded: ["refunded", "partially_refunded"],
};
export const PAYMENT_TABS = ["", "refunds", "failed", "due", "paid", "refunded"] as const;

export type PaymentFilters = { q?: string; tab?: string; method?: string; provider?: string; from?: string; to?: string };

/** Order numbers are not on `payments`; resolve them to order ids first so search covers them. */
const orderIdsFor = cache(async (q: string): Promise<string[]> => {
  if (!q.trim()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("id").ilike("order_number", safeLike(q)).limit(50);
  return (data ?? []).map((o) => o.id);
});

function paymentFilter(q: Q, f: PaymentFilters, orderIds: string[]): Q {
  let x = q;
  if (f.tab === "refunds") x = x.eq("refund_required", true).neq("status", "refunded");
  else if (f.tab && PAYMENT_TAB_STATUSES[f.tab]) x = x.in("status", PAYMENT_TAB_STATUSES[f.tab]);
  if (f.method) x = x.eq("method", f.method);
  if (f.provider) x = x.eq("provider", f.provider);
  x = applyDates(x, f.from, f.to);
  if (f.q) {
    const like = safeLike(f.q);
    const ors = [`provider_order_id.ilike.${like}`, `provider_payment_id.ilike.${like}`, `refund_id.ilike.${like}`];
    if (orderIds.length) ors.push(`order_id.in.(${orderIds.join(",")})`);
    x = x.or(ors.join(","));
  }
  return x;
}

const PAYMENT_SELECT = "*, order:orders(order_number, status, total), user:profiles!payments_user_id_fkey(full_name, phone)";

export const listPaymentsAdmin = cache(async (f: PaymentFilters & { page?: number }): Promise<Paged<PaymentRow> & { error: boolean }> => {
  const supabase = await createClient();
  const page = f.page ?? 1;
  const ids = await orderIdsFor(f.q ?? "");
  const base = supabase.from("payments").select(PAYMENT_SELECT, { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  const { data, count, error } = await paymentFilter(base, f, ids);
  if (error) console.error("listPaymentsAdmin", error.message);
  return { items: (data ?? []) as unknown as PaymentRow[], total: count ?? 0, page, pageSize: PAGE_SIZE, error: Boolean(error) };
});

export const countPayments = cache(async (f: PaymentFilters) => {
  const supabase = await createClient();
  const ids = await orderIdsFor(f.q ?? "");
  return headCounts([...PAYMENT_TABS], (t) => paymentFilter(supabase.from("payments").select("id", { count: "exact", head: true }), { ...f, tab: t }, ids));
});

export type PaymentDetail = PaymentRow & { order: (PaymentRow["order"] & { id: string; payment_method: Enums<"payment_method">; payment_status: Enums<"payment_status">; created_at: string }) | null };

export const getPaymentAdmin = cache(async (id: string): Promise<PaymentDetail | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("*, order:orders(id, order_number, status, total, payment_method, payment_status, created_at), user:profiles!payments_user_id_fkey(full_name, phone)").eq("id", id).maybeSingle();
  return (data as unknown as PaymentDetail) ?? null;
});

/* ------------------------------------------------------------------------------------------------
 * Support tickets
 * ---------------------------------------------------------------------------------------------- */

export const TICKET_TABS = ["open_all", "open", "in_progress", "resolved", "closed", "all"] as const;

export const listTicketsAdmin = cache(async (f: { q?: string; status?: string; priority?: string; category?: string; page?: number }): Promise<Paged<TicketRow> & { error: boolean }> => {
  const supabase = await createClient();
  const page = f.page ?? 1;
  let q = supabase.from("support_tickets").select("*, user:profiles!support_tickets_user_id_fkey(full_name, phone, email), assignee:profiles!support_tickets_assigned_to_fkey(full_name), order:orders(order_number)", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  if (f.status === "open_all") q = q.in("status", ["open", "in_progress"]);
  else if (f.status && f.status !== "all") q = q.eq("status", f.status as Enums<"ticket_status">);
  if (f.priority) q = q.eq("priority", f.priority as Enums<"ticket_priority">);
  if (f.category) q = q.eq("category", f.category);
  if (f.q) { const like = safeLike(f.q); q = q.or(`ticket_number.ilike.${like},subject.ilike.${like}`); }
  const { data, count, error } = await q;
  if (error) console.error("listTicketsAdmin", error.message);
  return { items: (data ?? []) as unknown as TicketRow[], total: count ?? 0, page, pageSize: PAGE_SIZE, error: Boolean(error) };
});

export const countTickets = cache(async (f: { q?: string; priority?: string; category?: string }) => {
  const supabase = await createClient();
  return headCounts([...TICKET_TABS], (t) => {
    let q = supabase.from("support_tickets").select("id", { count: "exact", head: true });
    if (t === "open_all") q = q.in("status", ["open", "in_progress"]);
    else if (t !== "all") q = q.eq("status", t as Enums<"ticket_status">);
    if (f.priority) q = q.eq("priority", f.priority as Enums<"ticket_priority">);
    if (f.category) q = q.eq("category", f.category);
    if (f.q) { const like = safeLike(f.q); q = q.or(`ticket_number.ilike.${like},subject.ilike.${like}`); }
    return q;
  });
});

/* ------------------------------------------------------------------------------------------------
 * Reviews
 * ---------------------------------------------------------------------------------------------- */

export const REVIEW_TABS = ["pending", "approved", "rejected"] as const;
type ReviewFilters = { target?: string; rating?: string; q?: string };

function reviewFilter(q: Q, status: string, f: ReviewFilters): Q {
  let x = q.eq("status", status);
  if (f.target) x = x.eq("target", f.target);
  if (/^[1-5]$/.test(f.rating ?? "")) x = x.eq("rating", Number(f.rating));
  if (f.q) { const like = safeLike(f.q); x = x.or(`title.ilike.${like},comment.ilike.${like}`); }
  return x;
}

export const listReviewsAdmin = cache(async (f: ReviewFilters & { status: string; page?: number }): Promise<Paged<ReviewRow> & { error: boolean }> => {
  const supabase = await createClient();
  const page = f.page ?? 1;
  const base = supabase.from("reviews").select("*, user:profiles!reviews_user_id_fkey(full_name), product:products(name, slug), rider:delivery_partners(id, user:profiles(full_name)), order:orders(order_number)", { count: "exact" }).order("created_at", { ascending: false }).range(...pageRange(page));
  const { data, count, error } = await reviewFilter(base, f.status, f);
  if (error) console.error("listReviewsAdmin", error.message);
  return { items: (data ?? []) as unknown as ReviewRow[], total: count ?? 0, page, pageSize: PAGE_SIZE, error: Boolean(error) };
});

export const countReviews = cache(async (f: ReviewFilters) => {
  const supabase = await createClient();
  return headCounts([...REVIEW_TABS], (t) => reviewFilter(supabase.from("reviews").select("id", { count: "exact", head: true }), t, f));
});

/* ------------------------------------------------------------------------------------------------
 * Audit logs
 * ---------------------------------------------------------------------------------------------- */

export const listAuditAdmin = cache(async (f: { entity?: string; action?: string; actor?: string; q?: string; from?: string; to?: string; page?: number }): Promise<Paged<AuditRow> & { error: boolean }> => {
  const supabase = await createClient();
  const page = f.page ?? 1;
  let q: Q = supabase.from("audit_logs").select("*, actor:profiles(full_name, role)", { count: "exact" }).order("id", { ascending: false }).range(...pageRange(page));
  if (f.entity) q = q.eq("entity", f.entity);
  if (f.action) q = q.eq("action", f.action);
  if (f.actor === "system") q = q.is("actor_id", null);
  else if (f.actor) q = q.eq("actor_id", f.actor);
  if (f.q) q = q.ilike("entity_id", safeLike(f.q));
  q = applyDates(q, f.from, f.to);
  const { data, count, error } = await q;
  if (error) console.error("listAuditAdmin", error.message);
  return { items: (data ?? []) as unknown as AuditRow[], total: count ?? 0, page, pageSize: PAGE_SIZE, error: Boolean(error) };
});

export const getAuditEntry = cache(async (id: number): Promise<AuditRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("audit_logs").select("*, actor:profiles(full_name, role)").eq("id", id).maybeSingle();
  return (data as unknown as AuditRow) ?? null;
});

/* ------------------------------------------------------------------------------------------------
 * Notifications
 * ---------------------------------------------------------------------------------------------- */

export type BroadcastLog = { id: number; created_at: string; audience: string; title: string; recipients: number | null; email: string | null };
export function toBroadcastLog(r: { id: number; created_at: string; after_data: unknown }): BroadcastLog {
  const d = (r.after_data ?? {}) as { audience?: string; title?: string; recipients?: number; email?: string | null };
  return { id: r.id, created_at: r.created_at, audience: d.audience ?? "", title: d.title ?? "", recipients: typeof d.recipients === "number" ? d.recipients : null, email: d.email ?? null };
}
