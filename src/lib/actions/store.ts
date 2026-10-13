"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, slugify } from "@/lib/utils";
import { looseRpc } from "@/lib/data/store";
import { GSTIN_RE, PAN_RE, IFSC_RE, UPI_RE, WEIGHT_UNITS } from "@/components/store/constants";
import type { ActionResult } from "./cart";
import type { Enums } from "@/types/database";

/* ------------------------------------------------------------------------------------------------
 * Merchant portal mutations. Order state changes go through `store_update_order`; stock through
 * `adjust_stock`; product master data through `upsert_store_product`. Direct table writes are used
 * only where RLS explicitly allows store members (stores, inventory, store_documents).
 * ---------------------------------------------------------------------------------------------- */

type WithFields<T = undefined> = ActionResult<T> & { fieldErrors?: Record<string, string> };

function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Store-specific error codes on top of the shared `friendlyError` map. */
function storeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : (err as { message?: string })?.message ?? "";
  if (raw.startsWith("INVALID_TRANSITION")) return "This order has already moved on. Refresh to see its latest status.";
  if (raw.startsWith("PAYMENT_PENDING")) return "Online payment has not been received yet. You can accept the order once it is paid.";
  if (raw.startsWith("ORDER_NOT_FOUND")) return "Order not found.";
  if (raw.startsWith("UNKNOWN_ACTION")) return "Unknown action.";
  return friendlyError(err);
}

/* Registration & profile --------------------------------------------------------------------- */

const optionalText = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const timeField = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM");

const storeProfileSchema = z.object({
  name: z.string().trim().min(3, "Store name is too short").max(80),
  tagline: optionalText(120),
  description: optionalText(1000),
  owner_name: z.string().trim().min(2, "Enter the owner's name").max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile"),
  email: z.string().trim().email("Enter a valid email").optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  address_line1: z.string().trim().min(4, "Enter the shop address").max(160),
  address_line2: optionalText(160),
  area: z.string().trim().min(2, "Enter the area / locality").max(80),
  landmark: optionalText(120),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit pincode"),
  lat: z.number({ error: "Pin the shop location with GPS" }).min(-90).max(90),
  lng: z.number({ error: "Pin the shop location with GPS" }).min(-180).max(180),
  gstin: z.string().trim().toUpperCase().regex(GSTIN_RE, "GSTIN format looks wrong (15 characters)").optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  pan: z.string().trim().toUpperCase().regex(PAN_RE, "PAN format looks wrong (e.g. ABCDE1234F)").optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  bank_account_name: optionalText(80),
  bank_account_number: z.string().trim().regex(/^\d{9,18}$/, "Account number should be 9–18 digits").optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  bank_ifsc: z.string().trim().toUpperCase().regex(IFSC_RE, "IFSC format looks wrong (e.g. SBIN0001234)").optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  upi_id: z.string().trim().regex(UPI_RE, "UPI ID looks wrong (e.g. shop@upi)").optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  delivery_radius_km: z.number().min(0.5, "At least 0.5 km").max(30, "At most 30 km"),
  opening_time: timeField,
  closing_time: timeField,
  avg_prep_minutes: z.number().int().min(5, "At least 5 minutes").max(180, "At most 180 minutes"),
  min_order_amount: z.number().min(0).max(5000).optional().nullable(),
  logo_url: z.string().url().optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  cover_url: z.string().url().optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
});
export type StoreProfileInput = z.input<typeof storeProfileSchema>;

export async function registerStoreAction(input: StoreProfileInput): Promise<WithFields<{ id: string }>> {
  const parsed = storeProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields", fieldErrors: fieldErrors(parsed.error) };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Please sign in" };
  const { data: existing } = await supabase.from("stores").select("id").eq("owner_id", user.id).limit(1).maybeSingle();
  if (existing) return { ok: false, error: "You already have a store registered." };
  const { data: city } = await supabase.from("cities").select("id").eq("slug", "merta-city").maybeSingle();
  if (!city) return { ok: false, error: "The platform city is not configured yet. Please contact support." };
  const d = parsed.data;
  // The stores_before_insert trigger forces owner_id = auth.uid(), status = 'pending' and dedupes the slug.
  const { data, error } = await supabase.from("stores").insert({ ...d, owner_id: user.id, city_id: city.id, slug: slugify(d.name) }).select("id").single();
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store", "layout");
  return { ok: true, data: { id: data.id } };
}

export async function updateStoreProfileAction(storeId: string, input: StoreProfileInput): Promise<WithFields> {
  const parsed = storeProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  // status / commission_rate / is_featured are admin-only; the stores_protect_columns trigger ignores them silently.
  const { data: touched, error } = await supabase.from("stores").update(parsed.data).eq("id", storeId).select("id");
  if (!error && !touched?.length) return { ok: false, error: NOT_ALLOWED };
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store", "layout");
  return { ok: true, data: undefined };
}

const settingsSchema = z.object({
  is_open: z.boolean(),
  opening_time: timeField,
  closing_time: timeField,
  avg_prep_minutes: z.number().int().min(5).max(180),
  min_order_amount: z.number().min(0).max(5000).nullable(),
  delivery_radius_km: z.number().min(0.5).max(30),
});
export type StoreSettingsInput = z.input<typeof settingsSchema>;

export async function updateStoreSettingsAction(storeId: string, input: StoreSettingsInput): Promise<WithFields> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: touched, error } = await supabase.from("stores").update(parsed.data).eq("id", storeId).select("id");
  if (!error && !touched?.length) return { ok: false, error: NOT_ALLOWED };
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store", "layout");
  return { ok: true, data: undefined };
}

export async function setStoreOpenAction(storeId: string, isOpen: boolean): Promise<ActionResult<{ is_open: boolean }>> {
  const supabase = await createClient();
  const { data: touched, error } = await supabase.from("stores").update({ is_open: isOpen }).eq("id", storeId).select("id");
  if (!error && !touched?.length) return { ok: false, error: NOT_ALLOWED };
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store", "layout");
  return { ok: true, data: { is_open: isOpen } };
}

/** Logo / cover / gallery photos (public `store-photos` bucket URLs). */
export async function updateStoreMediaAction(storeId: string, input: { logo_url?: string | null; cover_url?: string | null; photos?: string[] }): Promise<ActionResult> {
  const isUrl = (v: string | null | undefined) => v == null || /^https?:\/\//.test(v);
  if (!isUrl(input.logo_url) || !isUrl(input.cover_url)) return { ok: false, error: "Invalid image URL" };
  const patch: { logo_url?: string | null; cover_url?: string | null; photos?: string[] } = {};
  if ("logo_url" in input) patch.logo_url = input.logo_url ?? null;
  if ("cover_url" in input) patch.cover_url = input.cover_url ?? null;
  if (input.photos) patch.photos = input.photos.filter((p) => /^https?:\/\//.test(p)).slice(0, 12);
  const supabase = await createClient();
  const { data: touched, error } = await supabase.from("stores").update(patch).eq("id", storeId).select("id");
  if (!error && !touched?.length) return { ok: false, error: NOT_ALLOWED };
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store", "layout");
  return { ok: true, data: undefined };
}

export async function addStoreDocumentAction(storeId: string, docType: string, filePath: string): Promise<ActionResult<{ id: string }>> {
  if (!docType.trim() || !filePath.startsWith(`${storeId}/`)) return { ok: false, error: "Invalid document" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("store_documents").insert({ store_id: storeId, doc_type: docType.trim(), file_path: filePath }).select("id").single();
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store/profile"); revalidatePath("/store/register");
  return { ok: true, data: { id: data.id } };
}

/** Only pending documents can be removed by the store (RLS); verified/rejected ones are admin-owned. */
export async function deleteStoreDocumentAction(docId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("store_documents").delete().eq("id", docId).eq("status", "pending");
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store/profile");
  return { ok: true, data: undefined };
}

/* Orders ------------------------------------------------------------------------------------- */

export type StoreOrderAction = "accept" | "reject" | "preparing" | "ready";

export async function storeOrderAction(orderId: string, action: StoreOrderAction, note?: string): Promise<ActionResult<{ status: Enums<"order_status">; assignment_id: string | null }>> {
  if (!["accept", "reject", "preparing", "ready"].includes(action)) return { ok: false, error: "Unknown action" };
  if (action === "reject" && !note?.trim()) return { ok: false, error: "Tell the customer why the order was not accepted" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_update_order", { p_order_id: orderId, p_action: action, p_note: note?.trim() || undefined });
  if (error) return { ok: false, error: storeError(error) };
  const res = data as { ok: boolean; status: Enums<"order_status">; assignment_id: string | null };
  revalidatePath("/store"); revalidatePath("/store/orders"); revalidatePath(`/store/orders/${orderId}`);
  return { ok: true, data: { status: res.status, assignment_id: res.assignment_id ?? null } };
}

/** RLS hides rows the caller may not edit, so an update can "succeed" while changing nothing. */
const NOT_ALLOWED = "This change wasn't saved: you don't have access to it, or your session has expired. Sign in again and retry.";

/* Products & inventory ----------------------------------------------------------------------- */

const productSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2, "Enter the product name").max(120),
  category_id: z.string().uuid("Pick a category"),
  brand_name: z.string().trim().max(60).optional().nullable().transform((v) => (v ? v : null)),
  weight_value: z.number().positive("Enter the weight / quantity"),
  weight_unit: z.enum(WEIGHT_UNITS),
  pack_label: z.string().trim().max(40).optional().nullable().transform((v) => (v ? v : null)),
  mrp: z.number().positive("Enter the MRP"),
  selling_price: z.number().positive("Enter the selling price"),
  // null = keep the live stock count (edits change stock through the logged adjust_stock instead).
  stock_qty: z.number({ message: "Enter the stock count" }).int("Use a whole number").min(0, "Stock can't be negative").max(100000, "That's more than 100,000 — check the number").nullable(),
  low_stock_threshold: z.number({ message: "Enter a number" }).int("Use a whole number").min(0, "Can't be negative").max(1000, "Keep this under 1,000"),
  max_order_qty: z.number({ message: "Enter a number" }).int("Use a whole number").min(1, "At least 1").max(100, "At most 100"),
  is_active: z.boolean().nullable().optional(),
  description: z.string().trim().max(2000).optional().nullable().transform((v) => (v ? v : null)),
  image_url: z.string().url().optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  is_veg: z.boolean(),
  is_local: z.boolean(),
}).refine((d) => d.selling_price <= d.mrp, { message: "Selling price cannot be higher than MRP", path: ["selling_price"] });
export type StoreProductInput = z.input<typeof productSchema>;

export async function saveStoreProductAction(storeId: string, input: StoreProductInput): Promise<WithFields<{ product_id: string; inventory_id: string }>> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_store_product", {
    p_store_id: storeId, p_name: d.name, p_category_id: d.category_id, p_brand_name: d.brand_name ?? "", p_weight_value: d.weight_value, p_weight_unit: d.weight_unit,
    p_pack_label: d.pack_label ?? `${d.weight_value} ${d.weight_unit}`, p_mrp: d.mrp, p_selling_price: d.selling_price, p_stock_qty: d.stock_qty, p_low_stock_threshold: d.low_stock_threshold, p_is_active: d.is_active ?? null,
    p_description: d.description ?? undefined, p_image_url: d.image_url ?? undefined, p_is_local: d.is_local, p_is_veg: d.is_veg, p_product_id: d.product_id ?? undefined, p_max_order_qty: d.max_order_qty,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  const res = data as { product_id: string; inventory_id: string };
  revalidatePath("/store/products"); revalidatePath("/store/inventory"); revalidatePath("/store");
  return { ok: true, data: res };
}

/** Attach an existing catalog product to this store (inventory row; store members may insert directly). */
export async function addFromCatalogAction(storeId: string, input: { product_id: string; selling_price: number; mrp: number; stock_qty: number }): Promise<ActionResult<{ inventory_id: string }>> {
  const schema = z.object({ product_id: z.string().uuid(), selling_price: z.number().positive(), mrp: z.number().positive(), stock_qty: z.number().int().min(0) }).refine((d) => d.selling_price <= d.mrp, { message: "Selling price cannot be higher than MRP" });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.from("inventory").upsert({ store_id: storeId, product_id: d.product_id, selling_price: d.selling_price, mrp: d.mrp, stock_qty: d.stock_qty, is_active: true }, { onConflict: "store_id,product_id" }).select("id").single();
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store/products"); revalidatePath("/store/inventory");
  return { ok: true, data: { inventory_id: data.id } };
}

export async function toggleInventoryActiveAction(inventoryId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: touched, error } = await supabase.from("inventory").update({ is_active: isActive }).eq("id", inventoryId).select("id");
  if (!error && !touched?.length) return { ok: false, error: NOT_ALLOWED };
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store/products"); revalidatePath("/store/inventory");
  return { ok: true, data: undefined };
}

export async function adjustStockAction(inventoryId: string, delta: number, reason: string = "manual_adjust", note?: string): Promise<ActionResult<{ stock_qty: number }>> {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10000) return { ok: false, error: "Enter a whole number change" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_stock", { p_inventory_id: inventoryId, p_delta: delta, p_reason: reason, p_note: note?.trim() || undefined });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store/inventory"); revalidatePath("/store/products");
  return { ok: true, data: { stock_qty: Number(data) } };
}

export async function updateInventoryPricingAction(inventoryId: string, input: { selling_price: number; mrp: number; low_stock_threshold?: number; max_order_qty?: number }): Promise<ActionResult> {
  const schema = z.object({ selling_price: z.number().positive("Enter a price"), mrp: z.number().positive("Enter the MRP"), low_stock_threshold: z.number().int().min(0).max(1000).optional(), max_order_qty: z.number().int().min(1).max(100).optional() }).refine((d) => d.selling_price <= d.mrp, { message: "Selling price cannot be higher than MRP" });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const supabase = await createClient();
  const { data: touched, error } = await supabase.from("inventory").update(parsed.data).eq("id", inventoryId).select("id");
  if (!error && !touched?.length) return { ok: false, error: NOT_ALLOWED };
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store/inventory"); revalidatePath("/store/products");
  return { ok: true, data: undefined };
}

/** Zero the stock of several items (each goes through adjust_stock so movements are logged). */
export async function bulkOutOfStockAction(inventoryIds: string[]): Promise<ActionResult<{ updated: number; failed: number }>> {
  const ids = [...new Set(inventoryIds)].slice(0, 100);
  if (!ids.length) return { ok: false, error: "Select at least one item" };
  const supabase = await createClient();
  const { data: rows, error } = await supabase.from("inventory").select("id, stock_qty").in("id", ids);
  if (error) return { ok: false, error: friendlyError(error) };
  let updated = 0, failed = 0;
  for (const r of rows ?? []) {
    if (r.stock_qty <= 0) continue;
    const { error: e } = await supabase.rpc("adjust_stock", { p_inventory_id: r.id, p_delta: -r.stock_qty, p_reason: "manual_adjust", p_note: "Bulk: marked out of stock" });
    if (e) failed += 1; else updated += 1;
  }
  revalidatePath("/store/inventory"); revalidatePath("/store/products");
  return { ok: true, data: { updated, failed } };
}

/* Staff & notifications ---------------------------------------------------------------------- */

export async function addStaffAction(storeId: string, email: string, role: Enums<"store_staff_role">): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ email: z.string().trim().email("Enter a valid email"), role: z.enum(["manager", "staff"]) }).safeParse({ email, role });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const supabase = await createClient();
  const { data, error } = await looseRpc(supabase)("store_add_staff", { p_store_id: storeId, p_email: parsed.data.email, p_role: parsed.data.role });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store/settings");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function removeStaffAction(staffId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await looseRpc(supabase)("store_remove_staff", { p_staff_id: staffId });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store/settings");
  return { ok: true, data: undefined };
}

export async function markStoreNotificationsReadAction(ids?: string[]): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: ids });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/store", "layout");
  return { ok: true, data: Number(data ?? 0) };
}

/* Export ------------------------------------------------------------------------------------- */

export type InventoryExportRow = { name: string; brand: string; pack: string; category: string; mrp: number; selling_price: number; stock_qty: number; status: string; low_stock_threshold: number; max_order_qty: number; is_active: boolean; sold_count: number };

/** Rows for a client-generated CSV (capped so a huge catalog cannot stall the request). */
export async function getInventoryExportAction(storeId: string): Promise<ActionResult<{ rows: InventoryExportRow[]; capped: boolean }>> {
  const CAP = 2000;
  const supabase = await createClient();
  const { data, error } = await supabase.from("inventory").select("mrp, selling_price, stock_qty, status, low_stock_threshold, max_order_qty, is_active, sold_count, product:products!inner(name, pack_label, weight_value, weight_unit, brand:brands(name), category:categories(name))").eq("store_id", storeId).order("updated_at", { ascending: false }).limit(CAP);
  if (error) return { ok: false, error: friendlyError(error) };
  type Row = { mrp: number; selling_price: number; stock_qty: number; status: string; low_stock_threshold: number; max_order_qty: number; is_active: boolean; sold_count: number; product: { name: string; pack_label: string | null; weight_value: number; weight_unit: string; brand: { name: string } | null; category: { name: string } | null } };
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({ name: r.product.name, brand: r.product.brand?.name ?? "", pack: r.product.pack_label ?? `${r.product.weight_value} ${r.product.weight_unit}`, category: r.product.category?.name ?? "", mrp: Number(r.mrp), selling_price: Number(r.selling_price), stock_qty: r.stock_qty, status: r.status, low_stock_threshold: r.low_stock_threshold, max_order_qty: r.max_order_qty, is_active: r.is_active, sold_count: r.sold_count }));
  return { ok: true, data: { rows, capped: rows.length >= CAP } };
}
