"use server";
import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import type { CartSummary, DeliveryType, ReorderResult } from "@/types/app";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export async function getCartSummary(addressId?: string | null, deliveryType: DeliveryType = "standard"): Promise<CartSummary | null> {
  const [supabase, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!user) return null;
  const { data, error } = await supabase.rpc("cart_summary", { p_address_id: addressId ?? undefined, p_delivery_type: deliveryType });
  if (error) return null;
  return data as unknown as CartSummary;
}

export async function addToCartAction(inventoryId: string, quantity: number): Promise<ActionResult<{ quantity: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_to_cart", { p_inventory_id: inventoryId, p_quantity: quantity });
  if (error) return { ok: false, error: friendlyError(error) };
  const res = data as { ok: boolean; quantity?: number };
  revalidatePath("/cart");
  return { ok: true, data: { quantity: res.quantity ?? quantity } };
}

export async function applyCouponAction(code: string): Promise<ActionResult<{ discount: number; title: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_coupon", { p_code: code.trim() });
  if (error) return { ok: false, error: friendlyError(error) };
  const res = data as { valid: boolean; reason?: string; discount?: number; title?: string };
  if (!res.valid) return { ok: false, error: res.reason ?? "Invalid coupon" };
  revalidatePath("/cart");
  return { ok: true, data: { discount: res.discount ?? 0, title: res.title ?? "" } };
}

export async function removeCouponAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_coupon");
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/cart");
  return { ok: true, data: undefined };
}

export async function clearCartAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_cart");
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/cart");
  return { ok: true, data: undefined };
}

/** Adds a past order's items: what fits the per-product limits and stock; reductions are reported. */
export async function reorderAction(orderId: string): Promise<ActionResult<ReorderResult>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reorder", { p_order_id: orderId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/cart");
  return { ok: true, data: data as unknown as ReorderResult };
}

/** The customer has seen the current prices (called before continuing to payment). */
export async function acknowledgeCartPricesAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_cart_prices" as never);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: undefined };
}
