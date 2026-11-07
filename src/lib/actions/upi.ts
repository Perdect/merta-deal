"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Received needs the bank reference. Not received turns the amount back into cash the rider owes. */
export async function confirmUpiAction(orderId: string, received: boolean, reference: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Invalid order" };
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { error } = await rpc("admin_confirm_upi", { p_order_id: orderId, p_received: received, p_reference: reference.trim() || null });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/payments"); revalidatePath("/admin/payouts/riders");
  return { ok: true, data: null };
}

/** The customer says they paid the UPI QR; the reference is optional and helps the admin match it. */
export async function claimUpiPaymentAction(orderId: string, reference: string): Promise<ActionResult<{ claimed_at: string; reference: string | null }>> {
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Invalid order" };
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { data, error } = await rpc("customer_upi_claim", { p_order_id: orderId, p_reference: reference.trim().slice(0, 40) || null });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, data: data as { claimed_at: string; reference: string | null } };
}

/** An unpaid UPI order becomes cash on delivery. */
export async function upiToCashAction(orderId: string): Promise<ActionResult<{ status: string }>> {
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Invalid order" };
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { data, error } = await rpc("customer_upi_to_cash", { p_order_id: orderId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, data: data as { status: string } };
}

/** Admin: received (with the bank reference) confirms the order in one step; not received tells the customer. */
export async function confirmUpiOrderPaymentAction(orderId: string, received: boolean, reference: string): Promise<ActionResult<{ status: string; payment_status: string }>> {
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Invalid order" };
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { data, error } = await rpc("admin_confirm_upi_payment", { p_order_id: orderId, p_received: received, p_reference: reference.trim() || null });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/payments"); revalidatePath("/admin/orders"); revalidatePath(`/admin/orders/${orderId}`); revalidatePath("/admin");
  return { ok: true, data: data as { status: string; payment_status: string } };
}
