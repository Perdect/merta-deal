import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";
import { adminRpc, getReport, type AdminReport, type LiveRider } from "./admin";
import type { NavBadgeKey } from "@/components/admin/kit/nav";
import type { InventoryOverview } from "@/lib/inventory";

export const ACTIVE_STATUSES = ["placed", "confirmed", "preparing", "ready_for_pickup", "rider_assigned", "out_for_delivery"] as const;
export const RANGE_OPTIONS = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "14d", label: "14 days", days: 14 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
] as const;
export type RangeKey = (typeof RANGE_OPTIONS)[number]["value"];

/** Today's date in IST as a Date whose local fields read as IST. */
function istNow() { return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); }
export function isoDay(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(d.getDate() + n); return x; }
/** Start of an IST calendar day as a UTC instant. */
function istStart(day: string) { return new Date(`${day}T00:00:00+05:30`); }

export type Today = {
  orders: number; sales: number;
  /** Same IST clock time yesterday (null when yesterday had no orders by that time, so no comparison is shown). */
  ordersSameTimeYesterday: number | null; salesSameTimeYesterday: number | null;
  activeDeliveries: number; awaitingRider: number; onlineRiders: number;
};

/** Live counters for the top row. Today vs. the same time yesterday, so a partial day is compared fairly. */
export const getToday = cache(async (): Promise<Today> => {
  const supabase = await createClient();
  const now = new Date();
  const todayIso = isoDay(istNow());
  const todayStart = istStart(todayIso);
  const yStart = new Date(todayStart.getTime() - 86400000);
  const ySameTime = new Date(now.getTime() - 86400000);
  const [today, yesterday, delivering, ready, riders] = await Promise.all([
    supabase.from("orders").select("total, status").gte("created_at", todayStart.toISOString()),
    supabase.from("orders").select("total, status").gte("created_at", yStart.toISOString()).lt("created_at", ySameTime.toISOString()),
    supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["rider_assigned", "out_for_delivery"]),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "ready_for_pickup"),
    supabase.from("delivery_partners").select("id", { count: "exact", head: true }).eq("status", "active").eq("is_online", true),
  ]);
  const sum = (rows: { total: number; status: string }[] | null) => (rows ?? []).filter((r) => r.status !== "cancelled" && r.status !== "rejected").reduce((a, r) => a + Number(r.total), 0);
  const yRows = yesterday.data ?? [];
  return {
    orders: today.data?.length ?? 0,
    sales: sum(today.data),
    ordersSameTimeYesterday: yRows.length ? yRows.length : null,
    salesSameTimeYesterday: yRows.length ? sum(yRows) : null,
    activeDeliveries: delivering.count ?? 0,
    awaitingRider: ready.count ?? 0,
    onlineRiders: riders.count ?? 0,
  };
});

/**
 * One "needs attention" read. A failed read is reported as failed, never as zero: the dashboard then
 * shows "couldn't load" for that row instead of pretending nothing is waiting.
 */
export type Loaded<T> = { ok: true; data: T } | { ok: false };
export function loaded<T>(p: PromiseLike<T>): Promise<Loaded<T>> {
  return Promise.resolve(p).then((data) => ({ ok: true as const, data }), (e: unknown) => {
    console.error("dashboard attention", e instanceof Error ? e.message : e);
    return { ok: false as const };
  });
}
const fail = (what: string, e: { message: string }) => new Error(`${what}: ${e.message}`);

export type LateOrder = { id: string; order_number: string; status: Enums<"order_status">; promised_at: string };

/** Active orders already past their promised time, most overdue first. Throws when the read fails. */
export const getLateOrders = cache(async (): Promise<{ items: LateOrder[]; count: number }> => {
  const supabase = await createClient();
  const { data, count, error } = await supabase.from("orders").select("id, order_number, status, promised_at", { count: "exact" }).in("status", [...ACTIVE_STATUSES]).lt("promised_at", new Date().toISOString()).order("promised_at").limit(20);
  if (error) throw fail("late orders", error);
  const items = (data ?? []) as LateOrder[];
  return { items, count: count ?? items.length };
});

/** Orders still at "placed" after `minutes` (online payment not received yet, or auto-confirm switched off). Throws when the read fails. */
export const getUnconfirmed = cache(async (minutes = 5) => {
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - minutes * 60000).toISOString();
  const { data, count, error } = await supabase.from("orders").select("id, order_number, created_at", { count: "exact" }).eq("status", "placed").lt("created_at", cutoff).order("created_at").limit(20);
  if (error) throw fail("unconfirmed orders", error);
  return { items: (data ?? []) as { id: string; order_number: string; created_at: string }[], count: count ?? 0, minutes, /** Orders placed before this instant are counted. */ cutoff };
});

export type OrderExceptionKind = "no_rider" | "unattended" | "delivery_failed" | "item_exception";
export type OrderException = { id: string; order_number: string; status: Enums<"order_status">; exception: string; exception_at: string | null };

/**
 * Live orders carrying `orders.exception` (0036): the same condition as the Orders → Exceptions tab,
 * so the dashboard count and that list agree. Oldest first. Throws when the read fails.
 */
export const getOrderExceptions = cache(async (): Promise<OrderException[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").select("id, order_number, status, exception, exception_at").in("status", [...ACTIVE_STATUSES]).not("exception", "is", null).order("exception_at", { ascending: true, nullsFirst: false }).limit(100);
  if (error) throw fail("order exceptions", error);
  return (data ?? []) as OrderException[];
});

export type UpiWaiting = {
  /** Direct UPI orders (0042) still placed / payment pending; `claimed_at` is set once the customer says they paid. Null = the read failed. */
  orders: { order_id: string; order_number: string; amount: number; placed_at: string; claimed_at: string | null }[] | null;
  /** UPI a rider recorded at the door (0041) that nobody has matched to the bank yet. Null = the read failed. */
  rider: { order_id: string; order_number: string; amount: number; recorded_at: string }[] | null;
};

/** Both UPI queues from the functions Admin → Payments uses. One request-scoped fetch feeds the badges and the dashboard row. */
export const getUpiWaiting = cache(async (): Promise<UpiWaiting> => {
  const list = <T,>(fn: string) => adminRpc<T[]>(fn).then((r) => (r.error || !Array.isArray(r.data) ? null : r.data), () => null);
  const [orders, rider] = await Promise.all([list<NonNullable<UpiWaiting["orders"]>[number]>("admin_pending_upi_orders"), list<NonNullable<UpiWaiting["rider"]>[number]>("admin_pending_upi")]);
  return { orders, rider };
});

export type DispatchAlerts = {
  /** Approved riders online right now, and how many of them are not on a delivery (`admin_live_riders`). */
  online: number; free: number;
  /** Packed orders (ready_for_pickup): none of them has an accepted rider, by definition of the status. */
  packed: number;
  /** Packed orders with no offer out to anybody at this moment. */
  waitingNoOffer: number;
  /** Packed orders where at least one offer ran out unanswered or was declined. */
  unanswered: { id: string; order_number: string; timedOut: number; declined: number }[];
  timedOut: number; declined: number;
};

/**
 * Dispatch problems on packed orders, from real assignment rows only. An offer counts as "timed out"
 * when it is `expired` and was never answered before `expires_at`; an offer withdrawn early (another
 * rider accepted first, or the rider went offline) is also stored as `expired` and is left out.
 * Throws when either read fails.
 */
export const getDispatchAlerts = cache(async (): Promise<DispatchAlerts> => {
  const supabase = await createClient();
  const [packed, riders] = await Promise.all([
    supabase.from("orders").select("id, order_number, ready_at, delivery_assignments(status, expires_at, responded_at)").eq("status", "ready_for_pickup").order("ready_at", { ascending: true, nullsFirst: false }).limit(100),
    adminRpc<LiveRider[]>("admin_live_riders"),
  ]);
  if (packed.error) throw fail("packed orders", packed.error);
  if (riders.error) throw fail("live riders", riders.error);
  const now = Date.now();
  const online = riders.data ?? [];
  const rows = (packed.data ?? []) as unknown as { id: string; order_number: string; delivery_assignments: { status: Enums<"assignment_status">; expires_at: string; responded_at: string | null }[] | null }[];
  let waitingNoOffer = 0; let timedOut = 0; let declined = 0;
  const unanswered: DispatchAlerts["unanswered"] = [];
  for (const o of rows) {
    const offers = o.delivery_assignments ?? [];
    if (!offers.some((a) => a.status === "offered" && new Date(a.expires_at).getTime() > now)) waitingNoOffer += 1;
    const t = offers.filter((a) => a.status === "expired" && (!a.responded_at || new Date(a.responded_at).getTime() >= new Date(a.expires_at).getTime())).length;
    const d = offers.filter((a) => a.status === "rejected").length;
    if (t || d) unanswered.push({ id: o.id, order_number: o.order_number, timedOut: t, declined: d });
    timedOut += t; declined += d;
  }
  return { online: online.length, free: online.filter((r) => !r.busy).length, packed: rows.length, waitingNoOffer, unanswered, timedOut, declined };
});

export type StockAlerts = { out: number; low: number; outNames: string[]; lowNames: string[] };

/**
 * Listings with nothing available and listings at or below their own `low_stock_threshold`, from
 * `admin_inventory_overview` (0048): the same counts as the Inventory page's tabs. The function sorts
 * out-of-stock first, then low, so a small page gives names for the detail line. Throws when it fails.
 */
export const getStockAlerts = cache(async (): Promise<StockAlerts> => {
  const { data, error } = await adminRpc<InventoryOverview>("admin_inventory_overview", { p_q: null, p_category: null, p_filter: null, p_limit: 8, p_offset: 0 });
  if (error || !data?.counts) throw fail("stock alerts", error ?? { message: "empty answer" });
  const name = (r: InventoryOverview["rows"][number]) => [r.name, r.pack_label].filter(Boolean).join(" ");
  const rows = data.rows ?? [];
  return {
    out: Number(data.counts.out ?? 0), low: Number(data.counts.low ?? 0),
    outNames: rows.filter((r) => r.available <= 0).map(name),
    lowNames: rows.filter((r) => r.available > 0 && r.available <= r.low_stock_threshold).map(name),
  };
});

export type Period = {
  key: RangeKey; label: string; start: string; end: string; prevStart: string; prevEnd: string;
  report: AdminReport | null;
  /** Previous period of equal length; null when it had no orders (so no comparison is drawn). */
  previous: AdminReport | null;
  daily: { day: string; orders: number; sales: number; cancelled: number }[];
  statusCounts: Record<string, number>;
};

/** Trend, totals and status breakdown for the selected range, plus the equal-length period before it. */
export const getPeriod = cache(async (key: RangeKey): Promise<Period> => {
  const opt = RANGE_OPTIONS.find((r) => r.value === key) ?? RANGE_OPTIONS[1];
  const today = istNow();
  const end = isoDay(today);
  const start = isoDay(addDays(today, -(opt.days - 1)));
  const prevEnd = isoDay(addDays(today, -opt.days));
  const prevStart = isoDay(addDays(today, -(opt.days * 2 - 1)));
  const supabase = await createClient();
  const [report, previous, statuses] = await Promise.all([
    getReport(start, end),
    getReport(prevStart, prevEnd),
    supabase.from("orders").select("status").gte("created_at", istStart(start).toISOString()).lt("created_at", new Date(istStart(end).getTime() + 86400000).toISOString()).limit(20000),
  ]);
  const map = new Map((report?.daily ?? []).map((d) => [d.day, d]));
  const daily = Array.from({ length: opt.days }, (_, i) => {
    const day = isoDay(addDays(today, -(opt.days - 1) + i));
    const d = map.get(day);
    return { day, orders: Number(d?.orders ?? 0), sales: Number(d?.gmv ?? 0), cancelled: Number(d?.cancelled ?? 0) };
  });
  const statusCounts: Record<string, number> = {};
  for (const r of statuses.data ?? []) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  return { key: opt.value, label: `Last ${opt.label}`, start, end, prevStart, prevEnd, report, previous: previous && previous.orders > 0 ? previous : null, daily, statusCounts };
});

export type RecentOrder = { id: string; order_number: string; status: Enums<"order_status">; payment_method: Enums<"payment_method">; payment_status: Enums<"payment_status">; total: number; created_at: string; address_snapshot: { full_name?: string; phone?: string } | null };

export const getRecentOrders = cache(async (limit = 8): Promise<RecentOrder[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("id, order_number, status, payment_method, payment_status, total, created_at, address_snapshot").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as unknown as RecentOrder[];
});

/** Percentage change, or null when there is nothing to compare with. */
export function pctChange(curr: number, prev: number | null | undefined): number | null {
  if (prev == null || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

export type LiveCounts = {
  /** Active orders by status, right now. */
  byStatus: Record<(typeof ACTIVE_STATUSES)[number], number>;
  activeOrders: number;
  /** Service requests nobody has contacted yet. */
  newRequests: number;
  /** Direct UPI orders waiting for the admin to find the payment, plus rider-recorded UPI to confirm. */
  upiToConfirm: number;
  onlineRiders: number;
  /** The same figures keyed for the sidebar badges. */
  badges: Record<NavBadgeKey, number>;
};

/** Live figures for the "Right now" strip and the sidebar badges (one request-scoped fetch for both). */
export const getLiveCounts = cache(async (): Promise<LiveCounts> => {
  const supabase = await createClient();
  const loose = supabase as unknown as { from: (t: string) => { select: (c: string, o: { count: "exact"; head: true }) => { eq: (k: string, v: string) => PromiseLike<{ count: number | null }> } } };
  const [orders, requests, upi, riders, approvedWholesale] = await Promise.all([
    supabase.from("orders").select("status").in("status", [...ACTIVE_STATUSES]).limit(5000),
    loose.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    getUpiWaiting(),
    supabase.from("delivery_partners").select("id", { count: "exact", head: true }).eq("status", "active").eq("is_online", true),
    Promise.resolve(loose.from("wholesale_orders").select("id", { count: "exact", head: true }).eq("status", "approved")).then((r) => r.count ?? 0, () => 0),
  ]);
  const upiOrders = upi.orders?.length ?? 0; const upiRider = upi.rider?.length ?? 0;
  const wholesaleTodo = approvedWholesale;
  const byStatus = Object.fromEntries(ACTIVE_STATUSES.map((s) => [s, 0])) as LiveCounts["byStatus"];
  for (const r of orders.data ?? []) if (r.status in byStatus) byStatus[r.status as keyof typeof byStatus] += 1;
  const activeOrders = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const upiToConfirm = upiOrders + upiRider;
  return { byStatus, activeOrders, newRequests: requests.count ?? 0, upiToConfirm, onlineRiders: riders.count ?? 0, badges: { orders: activeOrders, requests: requests.count ?? 0, payments: upiToConfirm, wholesale: wholesaleTodo } };
});

/* ------------------------------------------------------------------------------------------------
 * Rider availability (Riders page). Real rows only: who is approved, who is online, the heartbeat the
 * rider app writes (0050), and the assignment each rider holds right now.
 * ---------------------------------------------------------------------------------------------- */

export type RiderCurrent = {
  status: "offered" | "accepted" | "picked_up"; order_id: string; order_number: string | null;
  offered_at: string; expires_at: string; responded_at: string | null; picked_up_at: string | null;
  /** Set by `rider_mark_arrived` (0051). */ arrived_pickup_at: string | null; arrived_customer_at: string | null;
};
export type RiderOps = {
  /** Approved riders, split three ways with no overlap: holding a delivery, online and free, offline. */
  approved: number; busy: number; free: number; offline: number; online: number;
  /** The assignment each rider holds now (a delivery in hand wins over an offer still waiting for an answer). */
  current: Record<string, RiderCurrent>;
  /** Last contact (heartbeat or GPS fix, whichever is later) per approved rider. */
  contact: Record<string, string | null>;
  /** `rider_online_stale_minutes`: a quiet rider who is not on a delivery is set offline after this long. Null = could not read; 0 = switched off. */
  staleMinutes: number | null;
};

/** The later of the app heartbeat and the last GPS fix: the same "last contact" the stale-rider sweep uses. */
export function riderLastContact(r: { last_seen_at?: string | null; last_location_at?: string | null }): string | null {
  const times = [r.last_seen_at, r.last_location_at].filter(Boolean) as string[];
  return times.length ? times.reduce((a, b) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b)) : null;
}

/** Throws when the rider or assignment read fails, so the page can say so instead of showing zeros. */
export const getRiderOps = cache(async (): Promise<RiderOps> => {
  const supabase = await createClient();
  const [partners, assignments, setting] = await Promise.all([
    supabase.from("delivery_partners").select("id, is_online, last_seen_at, last_location_at").eq("status", "active").limit(2000),
    supabase.from("delivery_assignments").select("rider_id, status, offered_at, expires_at, responded_at, picked_up_at, arrived_pickup_at, arrived_customer_at, order:orders(id, order_number)").in("status", ["offered", "accepted", "picked_up"]).order("created_at", { ascending: false }).limit(500),
    supabase.from("settings").select("value").eq("key", "rider_online_stale_minutes").maybeSingle(),
  ]);
  if (partners.error) throw fail("riders", partners.error);
  if (assignments.error) throw fail("live assignments", assignments.error);
  const now = Date.now();
  const rank = { picked_up: 3, accepted: 2, offered: 1 } as const;
  const current: Record<string, RiderCurrent> = {};
  type Row = Omit<RiderCurrent, "order_id" | "order_number"> & { rider_id: string; order: { id: string; order_number: string } | null };
  for (const a of (assignments.data ?? []) as unknown as Row[]) {
    if (!a.order) continue;
    if (a.status === "offered" && new Date(a.expires_at).getTime() <= now) continue; // ran out; the sweep has not relabelled it yet
    const held = current[a.rider_id];
    if (held && rank[held.status] >= rank[a.status]) continue;
    current[a.rider_id] = { status: a.status, order_id: a.order.id, order_number: a.order.order_number, offered_at: a.offered_at, expires_at: a.expires_at, responded_at: a.responded_at, picked_up_at: a.picked_up_at, arrived_pickup_at: a.arrived_pickup_at, arrived_customer_at: a.arrived_customer_at };
  }
  const onDelivery = (id: string) => current[id]?.status === "accepted" || current[id]?.status === "picked_up";
  const rows = partners.data ?? [];
  const busy = rows.filter((r) => onDelivery(r.id)).length;
  const free = rows.filter((r) => r.is_online && !onDelivery(r.id)).length;
  const stale = setting.error || setting.data == null ? null : Number(setting.data.value);
  return { approved: rows.length, busy, free, offline: rows.length - busy - free, online: rows.filter((r) => r.is_online).length, current, contact: Object.fromEntries(rows.map((r) => [r.id, riderLastContact(r)])), staleMinutes: stale != null && Number.isFinite(stale) ? stale : null };
});
