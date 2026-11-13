"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import { deliverPendingPush, type DeliverSummary } from "@/lib/notifications/deliver";
import { deliverOrderAlerts, type OrderAlertSummary } from "@/lib/notifications/order-alerts";
import { dispatchNotification, channelStatus } from "@/lib/notifications/dispatch";
import type { ActionResult } from "./cart";
import type { AlertFeed, AcceptResult } from "@/lib/alerts/types";

const uuid = z.string().uuid("Invalid order");

/** The admin alert feed: unaccepted orders plus the ring policy. The RPC checks the admin role itself. */
export async function getOrderAlertsAction(): Promise<ActionResult<AlertFeed>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_order_alerts");
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true, data: data as unknown as AlertFeed };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}

/** Accept (claim) an order. Idempotent: a repeat returns `already: true` with the first acceptor. */
export async function acceptOrderAction(orderId: string): Promise<ActionResult<AcceptResult>> {
  const parsed = uuid.safeParse(orderId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_accept_order", { p_order_id: parsed.data });
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath(`/admin/orders/${parsed.data}`); revalidatePath("/admin/orders"); revalidatePath("/admin");
    return { ok: true, data: data as unknown as AcceptResult };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}

/**
 * Sends queued push notifications now (the same job as the cron) so a new order or a delivery offer
 * reaches phones in the background without waiting for the schedule. Staff only; harmless to repeat.
 */
export async function deliverPendingPushAction(): Promise<ActionResult<DeliverSummary>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sign in again." };
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile || !["admin", "super_admin", "rider"].includes(profile.role)) return { ok: false, error: "Staff only." };
    if (profile.role !== "rider") await deliverOrderAlerts({ limit: 50 }).catch(() => undefined);
    return { ok: true, data: await deliverPendingPush(50) };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}

/** Admin: run the new-order alert sweep now and report what each channel did. */
export async function deliverOrderAlertsAction(): Promise<ActionResult<OrderAlertSummary>> {
  try {
    const supabase = await createClient();
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) return { ok: false, error: "Admins only." };
    return { ok: true, data: await deliverOrderAlerts({ limit: 50 }) };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}

export type TestAlertResult = { notificationId: string | null; channels: { channel: string; configured: boolean; sent: boolean; detail: string | null }[] };
/**
 * Admin: send a test alert to yourself through every configured channel and record the real outcome per
 * channel, so the status area shows what a new order would do on this account. Nothing is sent to anyone else.
 */
export async function sendTestAlertAction(): Promise<ActionResult<TestAlertResult>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!user || !isAdmin) return { ok: false, error: "Admins only." };
    const configured = channelStatus().filter((c) => c.configured && c.channel !== "sms").map((c) => c.channel);
    const r = await dispatchNotification({ userId: user.id, type: "alert_test", title: "Test alert from Merta Deal", body: "If you can read this, new-order alerts reach this channel.", url: "/admin/notifications", channels: ["in_app", ...configured] });
    const admin = (await import("@/lib/supabase/admin")).createAdminClient();
    const out: TestAlertResult["channels"] = [];
    for (const c of ["push", "whatsapp", "email"] as const) {
      const res = r.results[c];
      const isConfigured = configured.includes(c);
      const status = !isConfigured ? "unavailable" : res?.sent ? "sent" : res?.reason === "no_recipient" ? "no_recipient" : "failed";
      if (admin && r.notificationId) await admin.rpc("record_notification_delivery", { p_notification_id: r.notificationId, p_channel: c, p_status: status, p_provider_id: res?.sent ? res.detail ?? null : null, p_error: res && !res.sent ? res.detail ?? null : isConfigured ? null : "Not configured on the server." });
      out.push({ channel: c, configured: isConfigured, sent: Boolean(res?.sent), detail: res ? (res.sent ? `Sent to ${res.count} ${c === "push" ? "device(s)" : "recipient"}` : res.detail ?? res.reason) : "Not configured on the server." });
    }
    return { ok: true, data: { notificationId: r.notificationId, channels: out } };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}
