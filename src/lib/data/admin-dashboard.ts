import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";
import { getReport, type AdminReport } from "./admin";
import type { NavBadgeKey } from "@/components/admin/kit/nav";

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

export type LateOrder = { id: string; order_number: string; status: Enums<"order_status">; promised_at: string };

/** Active orders already past their promised time. */
export const getLateOrders = cache(async (): Promise<LateOrder[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("id, order_number, status, promised_at").in("status", [...ACTIVE_STATUSES]).lt("promised_at", new Date().toISOString()).order("promised_at").limit(20);
  return (data ?? []) as LateOrder[];
});

/** Orders still at "placed" after `minutes` (online payment not received yet, or auto-confirm switched off). */
export const getUnconfirmed = cache(async (minutes = 5) => {
  const supabase = await createClient();
  const { data, count } = await supabase.from("orders").select("id, order_number, created_at", { count: "exact" }).eq("status", "placed").lt("created_at", new Date(Date.now() - minutes * 60000).toISOString()).order("created_at").limit(5);
  return { items: (data ?? []) as { id: string; order_number: string; created_at: string }[], count: count ?? 0 };
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
  const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string) => PromiseLike<{ data: unknown[] | null }>;
  const loose = supabase as unknown as { from: (t: string) => { select: (c: string, o: { count: "exact"; head: true }) => { eq: (k: string, v: string) => PromiseLike<{ count: number | null }> } } };
  const [orders, requests, upiOrders, upiRider, riders, approvedWholesale] = await Promise.all([
    supabase.from("orders").select("status").in("status", [...ACTIVE_STATUSES]).limit(5000),
    (supabase as unknown as { from: (t: string) => { select: (c: string, o: { count: "exact"; head: true }) => { eq: (k: string, v: string) => PromiseLike<{ count: number | null }> } } }).from("service_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    rpc("admin_pending_upi_orders").then((r) => r.data?.length ?? 0, () => 0),
    rpc("admin_pending_upi").then((r) => r.data?.length ?? 0, () => 0),
    supabase.from("delivery_partners").select("id", { count: "exact", head: true }).eq("status", "active").eq("is_online", true),
    Promise.resolve(loose.from("wholesale_orders").select("id", { count: "exact", head: true }).eq("status", "approved")).then((r) => r.count ?? 0, () => 0),
  ]);
  const wholesaleTodo = approvedWholesale;
  const byStatus = Object.fromEntries(ACTIVE_STATUSES.map((s) => [s, 0])) as LiveCounts["byStatus"];
  for (const r of orders.data ?? []) if (r.status in byStatus) byStatus[r.status as keyof typeof byStatus] += 1;
  const activeOrders = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const upiToConfirm = upiOrders + upiRider;
  return { byStatus, activeOrders, newRequests: requests.count ?? 0, upiToConfirm, onlineRiders: riders.count ?? 0, badges: { orders: activeOrders, requests: requests.count ?? 0, payments: upiToConfirm, wholesale: wholesaleTodo } };
});
