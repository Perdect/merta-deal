import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushProvider } from "./providers/push";

export type DeliverSummary = { ok: boolean; reason?: string; detail?: string; processed: number; sent: number; skipped_no_subscription: number; failed: number; failures: { id: string; detail?: string }[] };

/** Where a push should open, by who the notification is for. Customer order links are the default. */
export function pushUrlFor(type: string, data: Record<string, unknown>): string {
  if (typeof data.url === "string") return data.url;
  const orderId = typeof data.order_id === "string" ? data.order_id : null;
  if (["new_order", "order_unattended", "dispatch_no_rider", "rider_assigned", "payment_update", "order_delivered", "order_cancelled", "rider_arrived", "exception_resolved", "exception_expired", "refund_due", "delivery_failed"].includes(type)) return orderId ? `/admin/orders/${orderId}` : "/admin/notifications";
  if (type === "low_stock") return "/admin/products?stock=low_stock";
  if (type === "rider_registered") return "/admin/riders";
  if (["delivery_offer", "delivery_cancelled", "cash_received"].includes(type)) return "/rider";
  return orderId ? `/orders/${orderId}` : "/account/notifications";
}

/**
 * Delivers rows in `notifications` with 'push' in channels and sent_push = false, oldest first. Marks a
 * row sent when the push went out or the user has no subscription; leaves it pending when push is not
 * configured or the push service errored, so the next run retries. Shared by the cron and the staff apps.
 */
export async function deliverPendingPush(limit = 100): Promise<DeliverSummary> {
  const empty = { processed: 0, sent: 0, skipped_no_subscription: 0, failed: 0, failures: [] };
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY missing", ...empty };
  if (!pushProvider.isConfigured()) return { ok: false, reason: "not_configured", detail: "Web Push needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT. Rows stay pending.", ...empty };

  const { data: rows, error } = await admin.from("notifications").select("id, user_id, type, title, body, data").contains("channels", ["push"]).eq("sent_push", false).order("created_at", { ascending: true }).limit(limit);
  if (error) return { ok: false, reason: "error", detail: error.message, ...empty };

  let sent = 0, skipped = 0, failed = 0; const done: string[] = []; const failures: { id: string; detail?: string }[] = [];
  for (const n of rows ?? []) {
    const d = (n.data ?? {}) as Record<string, unknown>;
    const res = await pushProvider.send({ userId: n.user_id, title: n.title, body: n.body, url: pushUrlFor(n.type, d), data: d, type: n.type });
    if (res.sent) { sent++; done.push(n.id); }
    else if (res.reason === "no_recipient") { skipped++; done.push(n.id); }
    else { failed++; failures.push({ id: n.id, detail: res.detail }); }
  }
  if (done.length) await admin.from("notifications").update({ sent_push: true }).in("id", done);
  return { ok: true, processed: rows?.length ?? 0, sent, skipped_no_subscription: skipped, failed, failures: failures.slice(0, 10) };
}
