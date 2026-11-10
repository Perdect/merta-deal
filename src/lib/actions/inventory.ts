"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import { STOCK_ADJUST_REASONS } from "@/lib/inventory";
import type { ActionResult } from "./cart";

const schema = z.object({
  inventoryId: z.string().uuid("Invalid listing"),
  delta: z.coerce.number().int("Use a whole number").refine((n) => n !== 0, "Enter how many packs to add or remove").refine((n) => Math.abs(n) <= 100000, "That is too large"),
  reason: z.enum(STOCK_ADJUST_REASONS.map((r) => r.value) as [string, ...string[]]),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});
export type AdjustStockInput = z.input<typeof schema>;

/**
 * Manual stock change (0048): goes through adjust_stock → _inv_move, so available stock is locked, can
 * never go negative, and the passbook gets a row with the balances before and after. Reserved stock is
 * never touched by hand; it only moves with orders.
 */
export async function adjustStockAction(input: AdjustStockInput): Promise<ActionResult<{ available: number }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form" };
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_stock", { p_inventory_id: d.inventoryId, p_delta: d.delta, p_reason: d.reason, p_note: d.note || undefined });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/inventory"); revalidatePath("/admin/products"); revalidatePath("/", "layout");
  return { ok: true, data: { available: Number(data) } };
}
