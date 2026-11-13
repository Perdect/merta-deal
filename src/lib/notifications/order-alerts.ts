import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { providers } from "./dispatch";
import type { NotificationPayload } from "./types";

/** Channels a new order is pushed through, besides the in-app row Realtime already delivers. */
export const ALERT_CHANNELS = ["push", "whatsapp", "email"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];
/** A channel that keeps failing is left alone after this many attempts (the status area shows why). */
export const MAX_ATTEMPTS = 5;
/** How far back the sweep looks; older alerts are history, not something to wake an admin for. */
const WINDOW_HOURS = 24;

type ChannelTotals = { sent: number; failed: number; skipped: number; no_recipient: number; unavailable: boolean };
export type OrderAlertSummary = { ok: boolean; reason?: string; detail?: string; notifications: number; channels: Record<AlertChannel, ChannelTotals> };

type Row = { id: string; user_id: string; data: Record<string, unknown> | null; sent_push: boolean };
type OrderBits = { id: string; order_number: string; total: number; payment_method: string; item_count: number };

const PAY_LABEL: Record<string, string> = { cod: "Cash on delivery", upi: "UPI", razorpay: "Online payment", wallet: "Wallet", card: "Card", netbanking: "Net banking" };

/** Minimum useful text: order number, total, payment method, item count. Never the customer's name, phone or address. */
export function orderAlertText(o: OrderBits) {
  const rupees = Number(o.total).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return { title: `New order ${o.order_number}`, body: `₹${rupees} · ${PAY_LABEL[o.payment_method] ?? o.payment_method.toUpperCase()} · ${o.item_count} ${o.item_count === 1 ? "item" : "items"}`, url: `/admin/orders/${o.id}` };
}

const empty = (): Record<AlertChannel, ChannelTotals> => ({
  push: { sent: 0, failed: 0, skipped: 0, no_recipient: 0, unavailable: !providers.push.isConfigured() },
  whatsapp: { sent: 0, failed: 0, skipped: 0, no_recipient: 0, unavailable: !providers.whatsapp.isConfigured() },
  email: { sent: 0, failed: 0, skipped: 0, no_recipient: 0, unavailable: !providers.email.isConfigured() },
});

/**
 * Sends every admin's `new_order` alert through each configured channel, exactly once per channel:
 * a channel already recorded as sent is skipped, a failed one is retried up to MAX_ATTEMPTS, and an
 * unconfigured channel is recorded once as `unavailable` so the status area can say so. Channels are
 * independent: WhatsApp failing never blocks push or email. Called right after an order is placed
 * (`after()` in the server action), by the delivery route the scheduler hits, and by the admin's
 * "deliver now" tap. The rows themselves are created inside place_order's transaction, so nothing
 * here runs for an order that was not committed. Safe to run concurrently: the database keeps one
 * delivery row per channel and never downgrades a send.
 */
export async function deliverOrderAlerts(opts: { orderId?: string; limit?: number } = {}): Promise<OrderAlertSummary> {
  const channels = empty();
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY missing", notifications: 0, channels };

  let query = admin.from("notifications").select("id, user_id, data, sent_push").eq("type", "new_order").order("created_at", { ascending: false }).limit(opts.limit ?? 50);
  query = opts.orderId ? query.eq("data->>order_id", opts.orderId) : query.gt("created_at", new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString());
  const { data: rows, error } = await query;
  if (error) return { ok: false, reason: "error", detail: error.message, notifications: 0, channels };
  const list = (rows ?? []) as Row[];
  if (!list.length) return { ok: true, notifications: 0, channels };

  const orderIds = [...new Set(list.map((r) => String(r.data?.order_id ?? "")).filter(Boolean))];
  const [{ data: orders }, { data: existing }] = await Promise.all([
    admin.from("orders").select("id, order_number, total, payment_method, item_count").in("id", orderIds),
    admin.from("notification_deliveries").select("notification_id, channel, status, attempts").in("notification_id", list.map((r) => r.id)),
  ]);
  const orderById = new Map((orders ?? []).map((o) => [o.id, o as OrderBits]));
  const state = new Map((existing ?? []).map((d) => [`${d.notification_id}:${d.channel}`, d]));
  const record = (notificationId: string, channel: AlertChannel, status: string, providerId?: string | null, err?: string | null) =>
    admin.rpc("record_notification_delivery", { p_notification_id: notificationId, p_channel: channel, p_status: status, p_provider_id: providerId ?? null, p_error: err ?? null });

  const pushDone: string[] = [];
  for (const n of list) {
    const order = orderById.get(String(n.data?.order_id ?? ""));
    if (!order) continue;
    const text = orderAlertText(order);
    const payload: NotificationPayload = { userId: n.user_id, title: text.title, body: text.body, url: text.url, type: "new_order", data: { order_id: order.id, order_number: order.order_number, url: text.url } };
    await Promise.all(ALERT_CHANNELS.map(async (channel) => {
      const prev = state.get(`${n.id}:${channel}`);
      const totals = channels[channel];
      if (prev && (prev.status === "sent" || prev.status === "delivered")) { totals.skipped++; if (channel === "push" && !n.sent_push) pushDone.push(n.id); return; }
      if (!providers[channel].isConfigured()) { if (!prev) await record(n.id, channel, "unavailable", null, "Not configured on the server."); totals.skipped++; return; }
      if (prev && prev.status === "failed" && prev.attempts >= MAX_ATTEMPTS) { totals.skipped++; return; }
      const res = await providers[channel].send(payload);
      if (res.sent) { totals.sent++; await record(n.id, channel, "sent", res.detail ?? null, null); if (channel === "push") pushDone.push(n.id); }
      else if (res.reason === "no_recipient") { totals.no_recipient++; await record(n.id, channel, "no_recipient", null, res.detail ?? null); if (channel === "push") pushDone.push(n.id); }
      else if (res.reason === "not_configured") { totals.skipped++; await record(n.id, channel, "unavailable", null, res.detail ?? null); }
      else { totals.failed++; await record(n.id, channel, "failed", null, res.detail ?? "Provider error"); }
    }));
  }
  // Keep the legacy push flag in step so the older push sweep never sends these rows a second time.
  if (pushDone.length) await admin.from("notifications").update({ sent_push: true }).in("id", pushDone);
  return { ok: true, notifications: list.length, channels };
}
