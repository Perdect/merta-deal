"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";
import type { Json } from "@/types/database";

/* ------------------------------------------------------------------------------------------------
 * Shared
 * ---------------------------------------------------------------------------------------------- */
const uuid = z.string().uuid("Invalid id");
const money = z.coerce.number().min(0, "Cannot be negative").max(10_000_000);
const fail = (e: unknown): ActionResult<never> => ({ ok: false, error: friendlyError(e) });
type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
/** Untyped table/RPC access for the finance tables; every row is still protected by RLS and the RPCs check roles. */
async function db() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("SESSION_EXPIRED");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) throw new Error("FORBIDDEN");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (table: string) => (supabase as any).from(table);
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  return { supabase, from, rpc, userId: user.id };
}
const paths = (...p: string[]) => p.forEach((x) => revalidatePath(x));

/* ------------------------------------------------------------------------------------------------
 * Suppliers
 * ---------------------------------------------------------------------------------------------- */
export type SupplierInput = { name: string; phone?: string; email?: string; gstin?: string; address?: string; notes?: string; is_active?: boolean };
const supplierSchema = z.object({
  name: z.string().trim().min(2, "Enter the supplier's name").max(120),
  phone: z.string().trim().max(20).optional().transform((v) => v || null),
  email: z.string().trim().max(120).optional().transform((v) => v || null),
  gstin: z.string().trim().max(20).optional().transform((v) => v || null),
  address: z.string().trim().max(300).optional().transform((v) => v || null),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
  is_active: z.boolean().default(true),
});
export async function saveSupplierAction(id: string | null, input: SupplierInput): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const { from, userId } = await db();
    if (id) {
      if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid supplier" };
      const { error } = await from("suppliers").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return fail(error);
      paths("/admin/purchasing"); return { ok: true, data: { id } };
    }
    const { data, error } = await from("suppliers").insert({ ...parsed.data, created_by: userId }).select("id").single();
    if (error) return fail(error);
    paths("/admin/purchasing"); return { ok: true, data: { id: data.id as string } };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Purchase orders and goods receipts
 * ---------------------------------------------------------------------------------------------- */
export type DocLineInput = { product_id: string; qty: number; unit: "pack" | "carton" | "kg" | "g"; units_per_carton?: number | null; unit_price: number; discount?: number; batch_no?: string; expiry_date?: string; po_line_id?: string | null };
const lineSchema = z.object({
  product_id: uuid, qty: z.coerce.number().positive("Quantity must be above 0").max(1_000_000), unit: z.enum(["pack", "carton", "kg", "g"]),
  units_per_carton: z.coerce.number().int().positive().max(10000).nullable().optional(), unit_price: money, discount: money.default(0),
  batch_no: z.string().trim().max(40).optional().transform((v) => v || null), expiry_date: z.string().trim().optional().transform((v) => v || null), po_line_id: z.string().uuid().nullable().optional(),
}).refine((l) => l.unit !== "carton" || Boolean(l.units_per_carton), { message: "Enter packs per carton", path: ["units_per_carton"] });
export type DocHeadInput = { supplier_id: string; discount?: number; freight?: number; other_costs?: number; notes?: string; expected_at?: string | null; invoice_no?: string | null; po_id?: string | null; received_at?: string | null };
const headSchema = z.object({
  supplier_id: uuid, discount: money.default(0), freight: money.default(0), other_costs: money.default(0),
  notes: z.string().trim().max(500).optional().transform((v) => v || null), expected_at: z.string().trim().optional().nullable().transform((v) => v || null),
  invoice_no: z.string().trim().max(60).optional().nullable().transform((v) => v || null), po_id: z.string().uuid().nullable().optional(), received_at: z.string().trim().optional().nullable().transform((v) => v || null),
});

/** Create or update a purchase order with its lines (lines are replaced). Draft and ordered POs only. */
export async function savePurchaseOrderAction(id: string | null, head: DocHeadInput, lines: DocLineInput[], status: "draft" | "ordered"): Promise<ActionResult<{ id: string }>> {
  const h = headSchema.safeParse(head); const ls = z.array(lineSchema).min(1, "Add at least one line").max(200).safeParse(lines);
  if (!h.success) return { ok: false, error: h.error.issues[0]?.message ?? "Invalid input" };
  if (!ls.success) return { ok: false, error: ls.error.issues[0]?.message ?? "Invalid line" };
  try {
    const { from, rpc, userId } = await db();
    let poId = id;
    const headRow = { supplier_id: h.data.supplier_id, discount: h.data.discount, freight: h.data.freight, other_costs: h.data.other_costs, notes: h.data.notes, expected_at: h.data.expected_at, status };
    if (poId) {
      const { data: cur } = await from("purchase_orders").select("status").eq("id", poId).maybeSingle();
      if (!cur) return { ok: false, error: "Purchase order not found." };
      if (!["draft", "ordered"].includes(cur.status)) return { ok: false, error: `A ${String(cur.status).replace("_", " ")} purchase order cannot be edited.` };
      const { error } = await from("purchase_orders").update({ ...headRow, updated_at: new Date().toISOString() }).eq("id", poId);
      if (error) return fail(error);
      await from("purchase_order_lines").delete().eq("po_id", poId);
    } else {
      const { data: name } = await rpc("_actor_name" as string);
      const { data, error } = await from("purchase_orders").insert({ ...headRow, created_by: userId, created_by_name: (name as string) ?? null }).select("id").single();
      if (error) return fail(error);
      poId = data.id as string;
    }
    const { error: lineErr } = await from("purchase_order_lines").insert(ls.data.map((l) => ({ po_id: poId, product_id: l.product_id, qty: l.qty, unit: l.unit, units_per_carton: l.unit === "carton" ? l.units_per_carton : null, unit_price: l.unit_price, discount: l.discount })));
    if (lineErr) return fail(lineErr);
    paths("/admin/purchasing", `/admin/purchasing/po/${poId}`);
    return { ok: true, data: { id: poId! } };
  } catch (e) { return fail(e); }
}

export async function setPurchaseOrderStatusAction(id: string, status: "ordered" | "cancelled"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid purchase order" };
  try {
    const { from } = await db();
    const { error } = await from("purchase_orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id).in("status", ["draft", "ordered", "partially_received"]);
    if (error) return fail(error);
    paths("/admin/purchasing", `/admin/purchasing/po/${id}`); return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Create or update a draft goods receipt (lines replaced). Posting is a separate, explicit step. */
export async function saveGoodsReceiptAction(id: string | null, head: DocHeadInput, lines: DocLineInput[]): Promise<ActionResult<{ id: string }>> {
  const h = headSchema.safeParse(head); const ls = z.array(lineSchema).min(1, "Add at least one line").max(200).safeParse(lines);
  if (!h.success) return { ok: false, error: h.error.issues[0]?.message ?? "Invalid input" };
  if (!ls.success) return { ok: false, error: ls.error.issues[0]?.message ?? "Invalid line" };
  try {
    const { from, rpc, userId } = await db();
    let grnId = id;
    const headRow = { supplier_id: h.data.supplier_id, po_id: h.data.po_id ?? null, discount: h.data.discount, freight: h.data.freight, other_costs: h.data.other_costs, notes: h.data.notes, invoice_no: h.data.invoice_no, received_at: h.data.received_at ?? new Date().toISOString() };
    if (grnId) {
      const { data: cur } = await from("goods_receipts").select("status").eq("id", grnId).maybeSingle();
      if (!cur) return { ok: false, error: "Receipt not found." };
      if (cur.status !== "draft") return { ok: false, error: "A posted receipt cannot be edited." };
      const { error } = await from("goods_receipts").update({ ...headRow, updated_at: new Date().toISOString() }).eq("id", grnId);
      if (error) return fail(error);
      await from("goods_receipt_lines").delete().eq("grn_id", grnId);
    } else {
      const { data: name } = await rpc("_actor_name" as string);
      const { data, error } = await from("goods_receipts").insert({ ...headRow, received_by: userId, received_by_name: (name as string) ?? null }).select("id").single();
      if (error) return fail(error);
      grnId = data.id as string;
    }
    const { error: lineErr } = await from("goods_receipt_lines").insert(ls.data.map((l) => ({ grn_id: grnId, po_line_id: l.po_line_id ?? null, product_id: l.product_id, qty: l.qty, unit: l.unit, units_per_carton: l.unit === "carton" ? l.units_per_carton : null, unit_cost: l.unit_price, discount: l.discount, batch_no: l.batch_no, expiry_date: l.expiry_date })));
    if (lineErr) return fail(lineErr);
    paths("/admin/purchasing", `/admin/purchasing/grn/${grnId}`);
    return { ok: true, data: { id: grnId! } };
  } catch (e) { return fail(e); }
}

/** Posts a receipt: stock in, landed costs, moving average. Idempotent. */
export async function postGoodsReceiptAction(id: string): Promise<ActionResult<{ already: boolean; lines?: number; total?: number }>> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid receipt" };
  try {
    const { rpc } = await db();
    const { data, error } = await rpc("post_goods_receipt", { p_grn_id: id });
    if (error) return fail(error);
    paths("/admin/purchasing", `/admin/purchasing/grn/${id}`, "/admin/products", "/admin/pricing");
    return { ok: true, data: data as { already: boolean; lines?: number; total?: number } };
  } catch (e) { return fail(e); }
}

export async function recordSupplierPaymentAction(grnId: string, amount: number, reference?: string, note?: string): Promise<ActionResult<{ paid_amount: number; due: number }>> {
  const parsed = z.object({ grnId: uuid, amount: z.coerce.number().positive("Enter an amount above zero"), reference: z.string().trim().max(80).optional(), note: z.string().trim().max(200).optional() }).safeParse({ grnId, amount, reference, note });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const { rpc } = await db();
    const { data, error } = await rpc("record_supplier_payment", { p_grn_id: parsed.data.grnId, p_amount: parsed.data.amount, p_reference: parsed.data.reference || undefined, p_note: parsed.data.note || undefined });
    if (error) return fail(error);
    paths("/admin/purchasing", `/admin/purchasing/grn/${grnId}`);
    return { ok: true, data: data as { paid_amount: number; due: number } };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Selling prices
 * ---------------------------------------------------------------------------------------------- */
export type PricePreviewRow = { product_id: string; inventory_id: string; name: string; pack_label: string | null; sku: string | null; price: number; mrp: number | null; cost: number | null; new_price: number | null; new_mrp: number | null; below_cost: boolean; invalid: boolean };
export type PriceFilter = { category_id?: string; brand_id?: string; q?: string; ids?: string[] };
export type PriceMode = "percent" | "amount" | "set" | "margin" | "mrp_discount";
const filterSchema = z.object({ category_id: z.string().uuid().optional(), brand_id: z.string().uuid().optional(), q: z.string().trim().max(80).optional(), ids: z.array(z.string().uuid()).max(500).optional() });
const modeSchema = z.enum(["percent", "amount", "set", "margin", "mrp_discount"]);

export async function pricePreviewAction(filter: PriceFilter, mode: PriceMode, value: number): Promise<ActionResult<PricePreviewRow[]>> {
  const f = filterSchema.safeParse(filter); const m = modeSchema.safeParse(mode);
  if (!f.success || !m.success || !Number.isFinite(value)) return { ok: false, error: "Invalid input" };
  if (!f.data.category_id && !f.data.brand_id && !f.data.q && !f.data.ids?.length) return { ok: false, error: "Pick a category, brand, search or products first so the change is deliberate." };
  try {
    const { rpc } = await db();
    const { data, error } = await rpc("admin_price_preview", { p_filter: f.data as Json, p_mode: m.data, p_value: value });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as PricePreviewRow[] };
  } catch (e) { return fail(e); }
}

export async function priceApplyAction(filter: PriceFilter, mode: PriceMode, value: number, reason: string, effectiveAt?: string | null, confirmBelowCost = false): Promise<ActionResult<{ count: number; skipped: number; below_cost: number; scheduled: boolean }>> {
  const f = filterSchema.safeParse(filter); const m = modeSchema.safeParse(mode);
  if (!f.success || !m.success || !Number.isFinite(value)) return { ok: false, error: "Invalid input" };
  if (reason.trim().length < 3) return { ok: false, error: "Give a reason (it goes in the price history)." };
  try {
    const { rpc } = await db();
    const { data, error } = await rpc("admin_price_apply", { p_filter: f.data as Json, p_mode: m.data, p_value: value, p_reason: reason.trim(), p_effective_at: effectiveAt || undefined, p_confirm_below_cost: confirmBelowCost });
    if (error) return fail(error);
    paths("/admin/pricing", "/admin/products", "/");
    return { ok: true, data: data as { count: number; skipped: number; below_cost: number; scheduled: boolean } };
  } catch (e) { return fail(e); }
}

export async function setPriceAction(productId: string, price: number, mrp: number | null, reason: string, confirmBelowCost = false): Promise<ActionResult<{ price: number; mrp: number; cost: number | null; below_cost: boolean }>> {
  if (!uuid.safeParse(productId).success || !(price > 0)) return { ok: false, error: "Enter a selling price above ₹0." };
  try {
    const { rpc } = await db();
    const { data, error } = await rpc("admin_set_price", { p_product_id: productId, p_price: price, p_mrp: mrp ?? undefined, p_reason: reason || undefined, p_confirm_below_cost: confirmBelowCost });
    if (error) return fail(error);
    paths("/admin/pricing", "/admin/products", `/admin/products/${productId}`);
    return { ok: true, data: data as { price: number; mrp: number; cost: number | null; below_cost: boolean } };
  } catch (e) { return fail(e); }
}

export async function cancelScheduledPriceAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid change" };
  try {
    const { from } = await db();
    const { error } = await from("scheduled_price_changes").update({ status: "cancelled" }).eq("id", id).eq("status", "scheduled");
    if (error) return fail(error);
    paths("/admin/pricing"); return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Rider pay
 * ---------------------------------------------------------------------------------------------- */
export type RateRules = {
  distance_basis?: string; base: number; included_km: number; per_km: number;
  zone_rates: { zone_id: string; base: number }[];
  weight_supplement: { min_kg: number; amount: number };
  peak: { start: string; end: string; amount: number }[];
  failed_attempt: number; cancelled_after_pickup: number; return_trip: number;
  incentives: { daily_deliveries: number; bonus: number }[];
};
export type PayBreakdown = { amount: number; lines: { label: string; amount: number }[]; distance_km: number | null; basis: string };
const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const rulesSchema = z.object({
  base: money, included_km: z.coerce.number().min(0).max(100), per_km: money,
  zone_rates: z.array(z.object({ zone_id: z.string().uuid(), base: money })).max(50).default([]),
  weight_supplement: z.object({ min_kg: z.coerce.number().min(0).max(500), amount: money }).default({ min_kg: 0, amount: 0 }),
  peak: z.array(z.object({ start: time, end: time, amount: money })).max(10).default([]),
  failed_attempt: money.default(0), cancelled_after_pickup: money.default(0), return_trip: money.default(0),
  incentives: z.array(z.object({ daily_deliveries: z.coerce.number().int().positive(), bonus: money })).max(10).default([]),
});

export async function rateCalcAction(rules: RateRules, distanceKm: number | null, weightKg: number, zoneId?: string | null): Promise<ActionResult<PayBreakdown>> {
  const r = rulesSchema.safeParse(rules);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Invalid rules" };
  try {
    const { rpc } = await db();
    const { data, error } = await rpc("rider_pay_calc", { p_rules: r.data as Json, p_distance_km: distanceKm ?? undefined, p_weight_kg: weightKg, p_zone_id: zoneId || undefined });
    if (error) return fail(error);
    return { ok: true, data: data as PayBreakdown };
  } catch (e) { return fail(e); }
}

export async function saveRateCardAction(name: string, rules: RateRules, note?: string): Promise<ActionResult<{ id: string; version: number }>> {
  const r = rulesSchema.safeParse(rules);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Invalid rules" };
  try {
    const { rpc } = await db();
    const { data, error } = await rpc("admin_save_rate_card", { p_name: name.trim() || "Rate card", p_rules: r.data as Json, p_note: note?.trim() || undefined, p_activate: true });
    if (error) return fail(error);
    paths("/admin/riders/rates");
    return { ok: true, data: data as { id: string; version: number } };
  } catch (e) { return fail(e); }
}

export async function riderAdjustmentAction(riderId: string, amount: number, reason: string, assignmentId?: string | null): Promise<ActionResult<{ id: string }>> {
  if (!uuid.safeParse(riderId).success || !Number.isFinite(amount) || amount === 0) return { ok: false, error: "Enter a non-zero amount." };
  try {
    const { rpc } = await db();
    const { data, error } = await rpc("admin_rider_adjustment", { p_rider_id: riderId, p_amount: amount, p_reason: reason, p_assignment_id: assignmentId || undefined });
    if (error) return fail(error);
    paths("/admin/payouts/riders"); return { ok: true, data: data as { id: string } };
  } catch (e) { return fail(e); }
}

export async function createRiderPayoutWithOffsetAction(riderId: string, codOffset: number, note?: string): Promise<ActionResult<{ payout_id: string; amount: number; gross: number; cod_offset: number; earnings: number }>> {
  if (!uuid.safeParse(riderId).success || !(codOffset >= 0)) return { ok: false, error: "Invalid input" };
  try {
    const { rpc } = await db();
    const { data, error } = await rpc("admin_create_rider_payout", { p_rider_id: riderId, p_note: note?.trim() || undefined, p_cod_offset: codOffset });
    if (error) return fail(error);
    paths("/admin/payouts/riders"); return { ok: true, data: data as { payout_id: string; amount: number; gross: number; cod_offset: number; earnings: number } };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Reads used by client screens
 * ---------------------------------------------------------------------------------------------- */
export type ProductCostInfo = { cost: number | null; last_purchase_price: number | null; last_purchase_unit: string | null; last_purchase_at: string | null; selling_price: number | null; margin: number | null };
export async function productCostsAction(ids: string[]): Promise<ActionResult<Record<string, ProductCostInfo>>> {
  const parsed = z.array(uuid).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid ids" };
  try {
    const { rpc } = await db();
    const { data, error } = await rpc("admin_product_costs", { p_ids: parsed.data });
    if (error) return fail(error);
    return { ok: true, data: (data ?? {}) as Record<string, ProductCostInfo> };
  } catch (e) { return fail(e); }
}

export type PurchasablePick = { id: string; name: string; pack_label: string | null; brand: string | null; loose: boolean; listed: boolean; sku: string | null };
/** Product search for purchase documents: says whether the product is loose produce (bought by weight) and whether it is listed. */
export async function searchPurchasableProductsAction(q: string): Promise<ActionResult<PurchasablePick[]>> {
  const term = q.trim();
  if (term.length < 2) return { ok: true, data: [] };
  try {
    const { from } = await db();
    const like = `%${term.replace(/[%_,]/g, " ")}%`;
    const { data, error } = await from("products").select("id, name, pack_label, sku, stock_pool_id, brand:brands(name), inventory(id)").or(`name.ilike.${like},sku.ilike.${like},barcode.ilike.${like}`).eq("is_active", true).order("name").limit(12);
    if (error) return fail(error);
    type Row = { id: string; name: string; pack_label: string | null; sku: string | null; stock_pool_id: string | null; brand: { name: string } | null; inventory: { id: string }[] | { id: string } | null };
    return { ok: true, data: ((data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.name, pack_label: r.pack_label, sku: r.sku, brand: r.brand?.name ?? null, loose: Boolean(r.stock_pool_id), listed: Array.isArray(r.inventory) ? r.inventory.length > 0 : Boolean(r.inventory) })) };
  } catch (e) { return fail(e); }
}
