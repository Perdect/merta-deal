"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";

const uuid = z.string().uuid("Invalid id");

export type OrderException = {
  id: string; order_id: string; order_item_id: string; kind: "unavailable" | "short"; requested_qty: number; available_qty: number; note: string | null;
  status: "pending" | "approved" | "declined" | "expired" | "withdrawn"; refund_amount: number; created_by_name: string | null; expires_at: string; resolved_at: string | null; created_at: string;
};

/** Admin: an order line cannot be packed in full. The customer is asked before anything changes. */
export async function raiseItemExceptionAction(orderItemId: string, availableQty: number, note?: string): Promise<ActionResult<OrderException>> {
  const parsed = z.object({ orderItemId: uuid, availableQty: z.coerce.number().int().min(0), note: z.string().trim().max(200).optional() }).safeParse({ orderItemId, availableQty, note });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_raise_item_exception", { p_order_item_id: parsed.data.orderItemId, p_available_qty: parsed.data.availableQty, p_note: parsed.data.note || undefined });
    if (error) return { ok: false, error: friendlyError(error) };
    const x = data as unknown as OrderException;
    revalidatePath(`/admin/orders/${x.order_id}`); revalidatePath(`/orders/${x.order_id}`);
    return { ok: true, data: x };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}

/** Admin: decide a pending or expired exception: apply the available quantity, or withdraw it. */
export async function adminResolveExceptionAction(exceptionId: string, orderId: string, action: "apply" | "withdraw"): Promise<ActionResult<{ status: string; refund_amount: number }>> {
  if (!uuid.safeParse(exceptionId).success || !uuid.safeParse(orderId).success) return { ok: false, error: "Invalid id" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_resolve_exception", { p_exception_id: exceptionId, p_action: action });
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath(`/admin/orders/${orderId}`); revalidatePath(`/orders/${orderId}`); revalidatePath("/admin/orders");
    return { ok: true, data: data as unknown as { status: string; refund_amount: number } };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}

/** Customer: approve the reduced quantity (the order continues) or decline (the order is cancelled and refunded). */
export async function resolveExceptionAction(exceptionId: string, orderId: string, approve: boolean): Promise<ActionResult<{ status: string; refund_amount?: number; total?: number; order_status?: string; already?: boolean }>> {
  if (!uuid.safeParse(exceptionId).success || !uuid.safeParse(orderId).success) return { ok: false, error: "Invalid id" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("customer_resolve_exception", { p_exception_id: exceptionId, p_approve: approve });
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath(`/orders/${orderId}`); revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true, data: data as unknown as { status: string; refund_amount?: number; total?: number; order_status?: string; already?: boolean } };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}
