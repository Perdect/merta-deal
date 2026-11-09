"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import { saveProductAction, setProductFlagsAction, type ProductInput } from "./admin";
import type { ActionResult } from "./cart";
import type { Json } from "@/types/database";

/* ================================================================================================
 * Catalogue admin actions that admin.ts does not cover:
 *  - listing quick edits (inventory price / MRP / on-off, stock via adjust_stock so every movement
 *    is logged in inventory_movements),
 *  - listing a catalogue product for sale (creating its inventory row),
 *  - the product "seller of record" + shelf-life fields (migration 0015) next to saveProductAction,
 *  - flags with customer-page revalidation.
 * Every action re-checks admin server-side, validates with zod, writes an audit row and
 * revalidates the admin pages plus the customer product page and home.
 * ============================================================================================== */

const uuid = z.string().uuid("Invalid id");

function fail(e: unknown): ActionResult<never> { return { ok: false, error: friendlyError(e) }; }
function firstIssue(e: z.ZodError) { return e.issues[0]?.message ?? "Invalid input"; }

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("SESSION_EXPIRED");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) throw new Error("FORBIDDEN");
  return supabase;
}

async function audit(supabase: Awaited<ReturnType<typeof createClient>>, action: string, entity: string, entityId: string, before: unknown, after: unknown) {
  await supabase.rpc("admin_audit", { p_action: action, p_entity: entity, p_entity_id: entityId, p_before: (before ?? undefined) as Json | undefined, p_after: (after ?? undefined) as Json | undefined });
}

function revalidateProduct(productId: string, slug?: string | null) {
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products/images");
  if (slug) revalidatePath(`/p/${slug}`);
  revalidatePath("/");
  revalidateTag("catalogue", { expire: 0 });
}

const price = (label: string) => z.coerce.number({ message: `Enter the ${label}` }).refine((v) => Number.isFinite(v), `Enter the ${label}`).refine((v) => v > 0, `${label[0].toUpperCase()}${label.slice(1)} must be more than ₹0`).refine((v) => v <= 1_000_000, `${label[0].toUpperCase()}${label.slice(1)} looks too high`);
const STOCK_REASONS = ["restock", "manual_adjust", "damage"] as const;

/* ------------------------------------------------------------------------------------------------
 * Listing quick edit
 * ---------------------------------------------------------------------------------------------- */

const offerSchema = z.object({
  selling_price: price("selling price"),
  mrp: price("MRP"),
  is_active: z.boolean(),
  stock_delta: z.coerce.number().int("Stock change must be a whole number").min(-100000).max(100000).default(0),
  stock_reason: z.enum(STOCK_REASONS).default("manual_adjust"),
  stock_note: z.string().trim().max(200).optional().transform((v) => v || undefined),
  low_stock_threshold: z.coerce.number().int("Use a whole number").min(0).max(1000).optional(),
  max_order_qty: z.coerce.number().int("Use a whole number").min(1, "Allow at least 1 per order").max(100).optional(),
  confirm_below_cost: z.boolean().optional(),
}).refine((d) => d.selling_price <= d.mrp, { message: "Selling price cannot be higher than MRP", path: ["selling_price"] });
export type OfferInput = z.input<typeof offerSchema>;

/** Update one listing (inventory row). Stock changes go through adjust_stock so they are logged. */
export async function updateListingAction(inventoryId: string, input: OfferInput): Promise<ActionResult<{ stock_qty: number }>> {
  if (!uuid.safeParse(inventoryId).success) return { ok: false, error: "Invalid listing" };
  const parsed = offerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const d = parsed.data;
  try {
    const supabase = await requireAdmin();
    const { data: before, error: readErr } = await supabase.from("inventory").select("id, product_id, selling_price, mrp, stock_qty, is_active, low_stock_threshold, max_order_qty, product:products(slug)").eq("id", inventoryId).maybeSingle();
    if (readErr) return fail(readErr);
    if (!before) return { ok: false, error: "This listing no longer exists. Refresh the page." };
    if (before.stock_qty + d.stock_delta < 0) return { ok: false, error: `Stock cannot go below zero (only ${before.stock_qty} in stock).` };

    let stockQty = before.stock_qty;
    if (d.stock_delta !== 0) {
      const { data, error } = await supabase.rpc("adjust_stock", { p_inventory_id: inventoryId, p_delta: d.stock_delta, p_reason: d.stock_reason, p_note: d.stock_note ?? "Admin quick edit" });
      if (error) return fail(error);
      stockQty = Number(data);
    }

    const patch: { selling_price?: number; mrp?: number; is_active?: boolean; low_stock_threshold?: number; max_order_qty?: number } = {};
    if (Number(before.selling_price) !== d.selling_price) {
      // A price under the recorded cost needs an explicit confirmation (recorded in the price history and audit).
      const { data: cost } = await supabase.rpc("product_cost" as never, { p_product_id: before.product_id } as never);
      if (cost != null && d.selling_price < Number(cost) && !d.confirm_below_cost) return { ok: false, error: `BELOW_COST: ${Number(cost).toFixed(2)}` };
      if (cost != null && d.selling_price < Number(cost)) await audit(supabase, "price.below_cost_confirmed", "inventory", inventoryId, { price: before.selling_price }, { price: d.selling_price, cost });
      patch.selling_price = d.selling_price;
    }
    if (Number(before.mrp) !== d.mrp) patch.mrp = d.mrp;
    if (before.is_active !== d.is_active) patch.is_active = d.is_active;
    if (d.low_stock_threshold != null && before.low_stock_threshold !== d.low_stock_threshold) patch.low_stock_threshold = d.low_stock_threshold;
    if (d.max_order_qty != null && before.max_order_qty !== d.max_order_qty) patch.max_order_qty = d.max_order_qty;
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("inventory").update(patch).eq("id", inventoryId);
      if (error) return { ok: false, error: d.stock_delta ? `Stock was updated to ${stockQty}, but the price change failed: ${friendlyError(error)}` : friendlyError(error) };
    }

    if (Object.keys(patch).length || d.stock_delta) {
      const beforeRow = { selling_price: before.selling_price, mrp: before.mrp, stock_qty: before.stock_qty, is_active: before.is_active, low_stock_threshold: before.low_stock_threshold, max_order_qty: before.max_order_qty, product_id: before.product_id };
      await audit(supabase, "inventory.update", "inventory", inventoryId, beforeRow, { ...patch, ...(d.stock_delta ? { stock_delta: d.stock_delta, stock_reason: d.stock_reason, stock_qty: stockQty } : {}) });
    }
    revalidateProduct(before.product_id, (before.product as { slug: string } | null)?.slug);
    return { ok: true, data: { stock_qty: stockQty } };
  } catch (e) { return fail(e); }
}

const newOfferSchema = z.object({
  selling_price: price("selling price"),
  mrp: price("MRP"),
  stock_qty: z.coerce.number().int("Stock must be a whole number").min(0, "Stock cannot be negative").max(100000),
  is_active: z.boolean().default(true),
}).refine((d) => d.selling_price <= d.mrp, { message: "Selling price cannot be higher than MRP", path: ["selling_price"] });
export type NewOfferInput = z.input<typeof newOfferSchema>;

/** Put a catalogue product on sale (creates its inventory row). Opening stock is logged as a restock. */
export async function createListingAction(productId: string, input: NewOfferInput): Promise<ActionResult<{ inventory_id: string }>> {
  if (!uuid.safeParse(productId).success) return { ok: false, error: "Invalid product" };
  const parsed = newOfferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const d = parsed.data;
  try {
    const supabase = await requireAdmin();
    const { data: product } = await supabase.from("products").select("id, slug").eq("id", productId).maybeSingle();
    if (!product) return { ok: false, error: "This product no longer exists." };
    const { data: existing } = await supabase.from("inventory").select("id").eq("product_id", productId).maybeSingle();
    if (existing) return { ok: false, error: "This product already has a price and stock. Refresh to edit it." };
    const { data: row, error } = await supabase.from("inventory").insert({ product_id: productId, selling_price: d.selling_price, mrp: d.mrp, stock_qty: 0, is_active: d.is_active }).select("id").single();
    if (error) return fail(error);
    if (d.stock_qty > 0) {
      const { error: e } = await supabase.rpc("adjust_stock", { p_inventory_id: row.id, p_delta: d.stock_qty, p_reason: "restock", p_note: "Opening stock (admin)" });
      if (e) return { ok: false, error: `Listed, but the opening stock could not be added: ${friendlyError(e)}` };
    }
    await audit(supabase, "inventory.create", "inventory", row.id, null, { product_id: productId, ...d });
    revalidateProduct(productId, product.slug);
    return { ok: true, data: { inventory_id: row.id } };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Product flags (wraps setProductFlagsAction; adds customer-page revalidation)
 * ---------------------------------------------------------------------------------------------- */

export async function setProductVisibilityAction(id: string, flags: { is_active?: boolean }): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid product" };
  const r = await setProductFlagsAction(id, flags);
  if (!r.ok) return r;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("products").select("slug").eq("id", id).maybeSingle();
    revalidateProduct(id, data?.slug);
  } catch { /* the flags were saved; revalidation is best effort */ }
  return r;
}

/* ------------------------------------------------------------------------------------------------
 * Product save incl. seller of record + shelf life
 * ---------------------------------------------------------------------------------------------- */

const sellerSchema = z.object({
  shelf_life: z.string().trim().max(80, "Shelf life is too long").optional().nullable().transform((v) => v || null),
  seller_name: z.string().trim().max(160, "Seller name is too long").optional().nullable().transform((v) => v || null),
  seller_address: z.string().trim().max(400, "Seller address is too long").optional().nullable().transform((v) => v || null),
  seller_license: z.string().trim().max(80, "Licence number is too long").optional().nullable().transform((v) => v || null),
});
export type SellerInput = z.input<typeof sellerSchema>;

/**
 * Saves the catalogue product through the existing saveProductAction (same fields, validation,
 * audit and behaviour), then the seller-of-record / shelf-life columns that action does not carry.
 */
export async function saveCatalogueProductAction(id: string | null, input: ProductInput, seller: SellerInput): Promise<ActionResult<{ id: string }>> {
  const s = sellerSchema.safeParse(seller);
  if (!s.success) return { ok: false, error: firstIssue(s.error) };
  if (id && !uuid.safeParse(id).success) return { ok: false, error: "Invalid product" };
  const saved = await saveProductAction(id, input);
  if (!saved.ok) return saved;
  const productId = saved.data.id;
  try {
    const supabase = await requireAdmin();
    const { data: before } = await supabase.from("products").select("slug, shelf_life, seller_name, seller_address, seller_license").eq("id", productId).maybeSingle();
    const changed = !before || (Object.keys(s.data) as (keyof typeof s.data)[]).some((k) => (before[k] ?? null) !== s.data[k]);
    if (changed) {
      const { error } = await supabase.from("products").update(s.data).eq("id", productId);
      if (error) return { ok: false, error: `Product saved, but the seller details were not: ${friendlyError(error)}` };
      const beforeSeller = before ? { shelf_life: before.shelf_life, seller_name: before.seller_name, seller_address: before.seller_address, seller_license: before.seller_license } : null;
      await audit(supabase, "product.seller_details", "products", productId, beforeSeller, s.data);
    }
    revalidateProduct(productId, before?.slug);
    return { ok: true, data: { id: productId } };
  } catch (e) { return fail(e); }
}
