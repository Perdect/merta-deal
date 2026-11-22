"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import { deliverRiderAlertsAndPush, type DeliverSummary } from "@/lib/notifications/deliver";
import { deliverRiderAlerts, type RiderAlertSummary } from "@/lib/notifications/rider-alerts";
import { pushProvider } from "@/lib/notifications/providers/push";
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
    return { ok: true, data: await deliverRiderAlertsAndPush(50) };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}

/** Admin: run the rider alert sweep now (requests and "no longer yours" notices) and report what each channel did. */
export async function deliverRiderAlertsAction(): Promise<ActionResult<RiderAlertSummary>> {
  try {
    const supabase = await createClient();
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) return { ok: false, error: "Admins only." };
    const r = await deliverRiderAlerts({ limit: 50 });
    if (!r.ok) return { ok: false, error: r.reason === "not_migrated" ? "Rider alert delivery is not switched on in the database yet (migration 0058)." : r.detail ?? "Could not run rider alert delivery." };
    return { ok: true, data: r };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}

export type TestPushResult = { devices: number };
/**
 * Sends one real push to the signed-in person's own devices and returns what the push service answered.
 * It goes to nobody else, writes no notification row, and reports failure as failure: "sent" here means
 * the push service accepted it for that many devices, not that a phone has shown it.
 */
export async function sendMyTestPushAction(portal: "admin" | "rider" = "rider"): Promise<ActionResult<TestPushResult>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sign in again." };
    if (!pushProvider.isConfigured()) return { ok: false, error: "Push is not set up on the server yet." };
    const rider = portal === "rider";
    const res = await pushProvider.send({
      userId: user.id, type: "alert_test", title: rider ? "Merta Deal Rider: test alert" : "Merta Deal: test alert",
      body: rider ? "Push works on this phone. Delivery requests will arrive like this." : "Push works on this device. New orders will arrive like this.",
      url: rider ? "/rider/profile#alerts" : "/admin/notifications#alerts", tag: "alert-test", sticky: false, ttlSeconds: 120,
    });
    if (res.sent) return { ok: true, data: { devices: res.count } };
    return { ok: false, error: res.reason === "no_recipient" ? "No device is registered for push on this account. Tap Enable first." : res.detail ?? "The push service refused the message." };
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
