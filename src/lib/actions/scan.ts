"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { listCatalogueProducts } from "@/lib/data/admin-catalogue";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";
import type { ScanOrder, ScanProduct, ScanResolved, StockHistoryRow, StockInput, StockResult, PackResult } from "@/lib/scan/types";

/**
 * Scan section server actions. These only validate the shape of a request: who may do what is decided
 * by the database functions in 0034, so a call that skips this file still meets the same checks.
 */
const uuid = z.string().uuid("Invalid id");
const code = z.string().trim().min(1, "Enter a code").max(300);

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => PromiseLike<{ data: T; error: { message: string } | null }>)(fn, args);
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true, data };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}
function refreshOrder(id: string) { revalidatePath(`/admin/orders/${id}`); revalidatePath("/admin/orders"); revalidatePath(`/orders/${id}`); }

export async function resolveCodeAction(value: string): Promise<ActionResult<ScanResolved>> {
  const parsed = code.safeParse(value);
  if (!parsed.success) return { ok: false, error: "Enter a code" };
  return rpc<ScanResolved>("scan_resolve", { p_code: parsed.data });
}

export async function loadOrderAction(orderId: string): Promise<ActionResult<ScanOrder>> {
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Invalid id" };
  return rpc<ScanOrder>("scan_order_detail", { p_order_id: orderId });
}

export async function loadProductAction(productId: string): Promise<ActionResult<ScanProduct>> {
  if (!uuid.safeParse(productId).success) return { ok: false, error: "Invalid id" };
  return rpc<ScanProduct>("scan_product", { p_product_id: productId });
}

const stockSchema = z.object({
  requestKey: uuid, productId: uuid, action: z.enum(["receive", "wastage", "adjust"]), quantity: z.number().positive("Enter a quantity above zero").max(1000000),
  unit: z.enum(["kg", "g", "packs"]), direction: z.enum(["add", "remove"]).optional(), reason: z.string().trim().max(120).optional(), note: z.string().trim().max(300).optional(),
});

/** `confirmed` is sent by the confirmation step; the database refuses the change without it. */
export async function stockAction(input: StockInput, confirmed: boolean): Promise<ActionResult<StockResult>> {
  const parsed = stockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the quantity" };
  const d = parsed.data;
  const r = await rpc<StockResult>("scan_stock_action", {
    p_request_key: d.requestKey, p_product_id: d.productId, p_action: d.action, p_quantity: d.quantity, p_unit: d.unit,
    p_direction: d.direction ?? null, p_reason: d.reason ?? null, p_note: d.note ?? null, p_confirmed: confirmed,
  });
  if (r.ok) { revalidatePath("/admin/products"); revalidatePath(`/admin/products/${d.productId}`); }
  return r;
}

export async function stockHistoryAction(productId: string): Promise<ActionResult<StockHistoryRow[]>> {
  if (!uuid.safeParse(productId).success) return { ok: false, error: "Invalid id" };
  return rpc<StockHistoryRow[]>("scan_stock_history", { p_product_id: productId, p_limit: 50 });
}

export async function setStockModeAction(productId: string, mode: "loose" | "pack"): Promise<ActionResult<ScanProduct>> {
  if (!uuid.safeParse(productId).success) return { ok: false, error: "Invalid id" };
  return rpc<ScanProduct>("admin_set_stock_mode", { p_product_id: productId, p_mode: mode === "loose" ? "loose" : "pack", p_confirmed: true });
}

export type ProductPick = { id: string; name: string; pack_label: string | null; brand: string | null; image_url: string | null; listed: boolean };
/** Catalogue search for "which product is this packet?" (admin only: the listing itself is admin-gated by RLS). */
export async function searchProductsAction(q: string): Promise<ActionResult<ProductPick[]>> {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return { ok: true, data: [] };
  const r = await listCatalogueProducts({ q: term, page: 1 });
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, data: r.items.slice(0, 12).map((p) => ({ id: p.id, name: p.name, pack_label: p.pack_label, brand: p.brand?.name ?? null, image_url: p.image_url, listed: Boolean(p.offer) })) };
}

export async function setBarcodeAction(productId: string, barcode: string): Promise<ActionResult<ScanProduct>> {
  if (!uuid.safeParse(productId).success) return { ok: false, error: "Invalid id" };
  return rpc<ScanProduct>("admin_set_product_barcode", { p_product_id: productId, p_barcode: barcode });
}

export async function packStartAction(orderId: string): Promise<ActionResult<ScanOrder>> {
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Invalid id" };
  const r = await rpc<ScanOrder>("pack_start", { p_order_id: orderId });
  if (r.ok) refreshOrder(orderId);
  return r;
}

export type PackScanResult = { result: PackResult; message: string; replayed: boolean; order: ScanOrder };
export async function packScanAction(requestKey: string, orderId: string, value: string): Promise<ActionResult<PackScanResult>> {
  if (!uuid.safeParse(requestKey).success || !uuid.safeParse(orderId).success || !code.safeParse(value).success) return { ok: false, error: "Invalid scan" };
  return rpc<PackScanResult>("pack_scan", { p_request_key: requestKey, p_order_id: orderId, p_code: value });
}

export async function packUndoAction(requestKey: string, orderId: string, itemId: string): Promise<ActionResult<ScanOrder>> {
  if (![requestKey, orderId, itemId].every((v) => uuid.safeParse(v).success)) return { ok: false, error: "Invalid id" };
  return rpc<ScanOrder>("pack_undo", { p_request_key: requestKey, p_order_id: orderId, p_order_item_id: itemId });
}

export type PackCompleteResult = { ok: boolean; already?: boolean; assignment_id?: string | null; missing?: { name: string; pack_label: string | null; missing: number }[]; order: ScanOrder };
export async function packCompleteAction(requestKey: string, orderId: string, confirmed: boolean): Promise<ActionResult<PackCompleteResult>> {
  if (!uuid.safeParse(requestKey).success || !uuid.safeParse(orderId).success) return { ok: false, error: "Invalid id" };
  const r = await rpc<PackCompleteResult>("pack_complete", { p_request_key: requestKey, p_order_id: orderId, p_confirmed: confirmed });
  if (r.ok) refreshOrder(orderId);
  return r;
}

export type RiderOption = { id: string; name: string | null; is_online: boolean; busy: boolean };
export async function listRidersAction(): Promise<ActionResult<RiderOption[]>> {
  const r = await rpc<{ id: string; name: string | null; is_online?: boolean; active_order?: unknown }[]>("admin_live_riders", {});
  if (!r.ok) return r;
  return { ok: true, data: (r.data ?? []).map((x) => ({ id: x.id, name: x.name, is_online: x.is_online ?? true, busy: Boolean(x.active_order) })) };
}

export async function assignRiderAction(orderId: string, riderId: string): Promise<ActionResult<{ already: boolean; order: ScanOrder }>> {
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(riderId).success) return { ok: false, error: "Invalid id" };
  const r = await rpc<{ already: boolean; order: ScanOrder }>("scan_assign_rider", { p_order_id: orderId, p_rider_id: riderId });
  if (r.ok) refreshOrder(orderId);
  return r;
}

export async function confirmDispatchAction(orderId: string): Promise<ActionResult<{ already: boolean; order: ScanOrder }>> {
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Invalid id" };
  const r = await rpc<{ already: boolean; order: ScanOrder }>("scan_confirm_dispatch", { p_order_id: orderId });
  if (r.ok) refreshOrder(orderId);
  return r;
}

export async function riderScanPickupAction(orderId: string): Promise<ActionResult<{ already: boolean }>> {
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Invalid id" };
  const r = await rpc<{ already: boolean }>("rider_scan_pickup", { p_order_id: orderId });
  if (r.ok) revalidatePath("/rider");
  return r;
}
