"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import { deliverPendingPush, type DeliverSummary } from "@/lib/notifications/deliver";
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
    return { ok: true, data: await deliverPendingPush(50) };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}
