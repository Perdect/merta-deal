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
