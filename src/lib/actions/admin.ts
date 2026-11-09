"use server";
import { randomInt } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminRpc } from "@/lib/data/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyError, slugify } from "@/lib/utils";
import { env } from "@/lib/env";
import type { ActionResult } from "./cart";
import type { Enums, Json, TablesInsert, TablesUpdate } from "@/types/database";

/* ------------------------------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------------------------- */

const uuid = z.string().uuid("Invalid id");
const money = z.coerce.number().min(0, "Cannot be negative");
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #329537");
/**
 * An image reference: an absolute http(s) URL (Supabase Storage uploads) or a site path such as
 * /products/<slug>.<hash>.webp (catalogue photos shipped with the app). Anything else is refused.
 */
const imageRef = z.string().trim().max(1000).refine((v) => /^https?:\/\/[^\s]+$/i.test(v) || /^\/[^\s]*$/.test(v), "Enter a valid image URL (https://… or /products/…)");
const nullableUrl = z.union([imageRef, z.literal("")]).nullable().optional().transform((v) => (v ? v : null));
const optionalText = z.string().trim().max(2000).optional().nullable().transform((v) => (v ? v : null));
const optionalDate = z.string().optional().nullable().transform((v) => (v ? new Date(v).toISOString() : null));

function fail(e: unknown): ActionResult<never> { return { ok: false, error: friendlyError(e) }; }
function invalid(parsed: { success: false; error: z.ZodError }): ActionResult<never> { return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }; }

/** Guard: the proxy + layout already gate /admin, but every action re-checks server-side. */
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("SESSION_EXPIRED");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) throw new Error("FORBIDDEN");
  return supabase;
}

async function audit(action: string, entity: string, entityId: string | null, before?: unknown, after?: unknown) {
  const supabase = await createClient();
  await supabase.rpc("admin_audit", { p_action: action, p_entity: entity, p_entity_id: entityId ?? "", p_before: (before ?? undefined) as Json | undefined, p_after: (after ?? undefined) as Json | undefined });
}

// Admin edits also clear the shared catalogue/settings cache so the shop shows them at once.
function revalidate(...paths: string[]) { for (const p of paths) revalidatePath(p); revalidateTag("catalogue", { expire: 0 }); revalidateTag("settings", { expire: 0 }); }

/* ------------------------------------------------------------------------------------------------
 * Users
 * ---------------------------------------------------------------------------------------------- */

export async function setUserRoleAction(userId: string, role: Enums<"user_role">): Promise<ActionResult> {
  const parsed = z.object({ userId: uuid, role: z.enum(["customer", "rider", "admin", "super_admin"]) }).safeParse({ userId, role });
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.rpc("admin_set_user_role", { p_user_id: parsed.data.userId, p_role: parsed.data.role });
    if (error) return fail(error);
    revalidate("/admin/users", `/admin/users/${userId}`);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function setUserActiveAction(userId: string, isActive: boolean): Promise<ActionResult> {
  const parsed = z.object({ userId: uuid, isActive: z.boolean() }).safeParse({ userId, isActive });
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const { data: before } = await supabase.from("profiles").select("is_active").eq("id", userId).maybeSingle();
    const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);
    if (error) return fail(error);
    await audit(isActive ? "user.activate" : "user.deactivate", "profiles", userId, before, { is_active: isActive });
    revalidate("/admin/users", `/admin/users/${userId}`);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function creditWalletAction(userId: string, amount: number, description: string): Promise<ActionResult<{ balance: number }>> {
  const parsed = z.object({ userId: uuid, amount: z.coerce.number().positive("Amount must be greater than zero").max(100000, "Max ₹1,00,000 per credit"), description: z.string().trim().min(3, "Add a short reason").max(200) }).safeParse({ userId, amount, description });
  if (!parsed.success) return invalid(parsed);
  try {
    await requireAdmin();
    const { data, error } = await adminRpc<{ balance: number }>("admin_credit_wallet", { p_user_id: parsed.data.userId, p_amount: parsed.data.amount, p_description: parsed.data.description });
    if (error) return fail(error);
    revalidate(`/admin/users/${userId}`);
    return { ok: true, data: { balance: Number(data?.balance ?? 0) } };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Products
 * ---------------------------------------------------------------------------------------------- */

const productSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(160),
  slug: z.string().trim().max(200).optional().transform((v) => (v ? slugify(v) : "")),
  brand_id: z.string().uuid().nullable().optional(),
  category_id: uuid,
  description: optionalText, ingredients: optionalText, manufacturer: optionalText,
  country_of_origin: z.string().trim().max(80).optional().nullable().transform((v) => v || "India"),
  bin_location: z.string().trim().max(40).optional().nullable().transform((v) => v || null),
  weight_value: z.coerce.number().positive("Weight must be positive"),
  weight_unit: z.enum(["g", "kg", "ml", "l", "pcs", "pack"]),
  pack_label: optionalText,
  mrp: money,
  image_url: nullableUrl,
  images: z.array(imageRef).max(8).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  synonyms: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  nutrition: z.record(z.string(), z.union([z.string(), z.number()])).nullable().optional(),
  is_local: z.boolean().default(false), is_veg: z.boolean().default(true), is_active: z.boolean().default(true),
  popularity_score: z.coerce.number().int().min(0).default(0),
});
export type ProductInput = z.input<typeof productSchema>;

export async function saveProductAction(id: string | null, input: ProductInput): Promise<ActionResult<{ id: string }>> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  if (id && !uuid.safeParse(id).success) return { ok: false, error: "Invalid product" };
  try {
    const supabase = await requireAdmin();
    const row = { ...parsed.data, slug: parsed.data.slug || slugify(`${parsed.data.name} ${parsed.data.pack_label ?? ""}`), nutrition: (parsed.data.nutrition ?? null) as Json | null };
    if (id) {
      const { data: before } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
      const { error } = await supabase.from("products").update(row as TablesUpdate<"products">).eq("id", id);
      if (error) return fail(error);
      await audit("product.update", "products", id, before, row);
      revalidate("/admin/products", `/admin/products/${id}`, `/p/${row.slug}`);
      return { ok: true, data: { id } };
    }
    const { data, error } = await supabase.from("products").insert(row as TablesInsert<"products">).select("id").single();
    if (error) return fail(error);
    await audit("product.create", "products", data.id, null, row);
    revalidate("/admin/products");
    return { ok: true, data: { id: data.id } };
  } catch (e) { return fail(e); }
}

export async function setProductFlagsAction(id: string, flags: { is_active?: boolean; is_local?: boolean }): Promise<ActionResult> {
  const parsed = z.object({ is_active: z.boolean().optional(), is_local: z.boolean().optional() }).safeParse(flags);
  if (!parsed.success || !uuid.safeParse(id).success) return { ok: false, error: "Invalid input" };
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.from("products").update(parsed.data).eq("id", id);
    if (error) return fail(error);
    await audit("product.flags", "products", id, null, parsed.data);
    revalidate("/admin/products", `/admin/products/${id}`);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid product" };
  try {
    const supabase = await requireAdmin();
    const { data: before } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return { ok: false, error: error.code === "23503" ? "This product has orders; deactivate it instead of deleting." : friendlyError(error) };
    await audit("product.delete", "products", id, before, null);
    revalidate("/admin/products");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Categories / brands
 * ---------------------------------------------------------------------------------------------- */

const categorySchema = z.object({
  name: z.string().trim().min(2).max(80), slug: z.string().trim().max(100).optional().transform((v) => (v ? slugify(v) : "")),
  parent_id: z.string().uuid().nullable().optional(), description: optionalText, icon: z.string().trim().max(40).nullable().optional(), image_url: nullableUrl,
  color: hex.nullable().optional().or(z.literal("")).transform((v) => (v ? v : null)), sort_order: z.coerce.number().int().min(0).default(0), is_active: z.boolean().default(true), is_featured: z.boolean().default(false),
});
export type CategoryInput = z.input<typeof categorySchema>;

export async function saveCategoryAction(id: string | null, input: CategoryInput): Promise<ActionResult<{ id: string }>> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  if (id && parsed.data.parent_id === id) return { ok: false, error: "A category cannot be its own parent" };
  try {
    const supabase = await requireAdmin();
    const row = { ...parsed.data, slug: parsed.data.slug || slugify(parsed.data.name) };
    if (id) {
      const { error } = await supabase.from("categories").update(row).eq("id", id);
      if (error) return fail(error);
      revalidate("/admin/categories", "/categories", "/");
      return { ok: true, data: { id } };
    }
    const { data, error } = await supabase.from("categories").insert(row).select("id").single();
    if (error) return fail(error);
    revalidate("/admin/categories", "/categories", "/");
    return { ok: true, data: { id: data.id } };
  } catch (e) { return fail(e); }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid category" };
  try {
    const supabase = await requireAdmin();
    const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("category_id", id);
    if (count) return { ok: false, error: `Move the ${count} products in this category first.` };
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return fail(error);
    revalidate("/admin/categories", "/categories");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Swap sort_order with the neighbour in the given direction (within the same parent). */
export async function moveCategoryAction(id: string, direction: "up" | "down"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid category" };
  try {
    const supabase = await requireAdmin();
    const { data: me } = await supabase.from("categories").select("id, parent_id, sort_order").eq("id", id).maybeSingle();
    if (!me) return { ok: false, error: "Category not found" };
    let q = supabase.from("categories").select("id, sort_order");
    q = me.parent_id ? q.eq("parent_id", me.parent_id) : q.is("parent_id", null);
    const { data: siblings } = await q.order("sort_order").order("name");
    const list = siblings ?? []; const idx = list.findIndex((s) => s.id === id);
    const swap = direction === "up" ? list[idx - 1] : list[idx + 1];
    if (!swap) return { ok: true, data: undefined };
    // Normalise to dense positions so swapping always changes order even if sort_order values collide.
    const updates = list.map((s, i) => ({ id: s.id, sort_order: i }));
    const a = updates[idx]; const b = updates[direction === "up" ? idx - 1 : idx + 1];
    [a.sort_order, b.sort_order] = [b.sort_order, a.sort_order];
    for (const u of updates) { const { error } = await supabase.from("categories").update({ sort_order: u.sort_order }).eq("id", u.id); if (error) return fail(error); }
    revalidate("/admin/categories", "/categories", "/");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

const brandSchema = z.object({ name: z.string().trim().min(1).max(80), slug: z.string().trim().max(100).optional().transform((v) => (v ? slugify(v) : "")), logo_url: nullableUrl, is_active: z.boolean().default(true) });
export type BrandInput = z.input<typeof brandSchema>;

export async function saveBrandAction(id: string | null, input: BrandInput): Promise<ActionResult<{ id: string }>> {
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const row = { ...parsed.data, slug: parsed.data.slug || slugify(parsed.data.name) };
    if (id) {
      const { data: before } = await supabase.from("brands").select("*").eq("id", id).maybeSingle();
      const { error } = await supabase.from("brands").update(row).eq("id", id);
      if (error) return fail(error);
      await audit("brand.update", "brands", id, before, row);
      revalidate("/admin/brands");
      return { ok: true, data: { id } };
    }
    const { data, error } = await supabase.from("brands").insert(row).select("id").single();
    if (error) return fail(error);
    await audit("brand.create", "brands", data.id, null, row);
    revalidate("/admin/brands");
    return { ok: true, data: { id: data.id } };
  } catch (e) { return fail(e); }
}

export async function deleteBrandAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid brand" };
  try {
    const supabase = await requireAdmin();
    const { data: before } = await supabase.from("brands").select("*").eq("id", id).maybeSingle();
    const { error } = await supabase.from("brands").delete().eq("id", id);
    if (error) return fail(error);
    await audit("brand.delete", "brands", id, before, null);
    revalidate("/admin/brands");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Orders
 * ---------------------------------------------------------------------------------------------- */

export async function assignRiderAction(orderId: string, riderId: string): Promise<ActionResult<{ assignmentId: string }>> {
  const parsed = z.object({ orderId: uuid, riderId: uuid }).safeParse({ orderId, riderId });
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const { data, error } = await supabase.rpc("admin_assign_rider", { p_order_id: orderId, p_rider_id: riderId });
    if (error) return fail(error);
    revalidate(`/admin/orders/${orderId}`, "/admin/orders", "/admin");
    return { ok: true, data: { assignmentId: String(data) } };
  } catch (e) { return fail(e); }
}

export async function redispatchAction(orderId: string): Promise<ActionResult<{ assignmentId: string | null }>> {
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Invalid order" };
  try {
    const supabase = await requireAdmin();
    const { data, error } = await supabase.rpc("auto_dispatch", { p_order_id: orderId });
    if (error) return fail(error);
    await audit("dispatch.rerun", "orders", orderId, null, { assignment_id: data ?? null });
    revalidate(`/admin/orders/${orderId}`, "/admin");
    return { ok: true, data: { assignmentId: (data as string | null) ?? null } };
  } catch (e) { return fail(e); }
}

export async function adminCancelOrderAction(orderId: string, reason: string): Promise<ActionResult> {
  const parsed = z.object({ orderId: uuid, reason: z.string().trim().min(3, "Give a reason for the customer").max(300) }).safeParse({ orderId, reason });
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: `Cancelled by admin: ${parsed.data.reason}` });
    if (error) return fail(error);
    revalidate(`/admin/orders/${orderId}`, "/admin/orders", "/admin", `/orders/${orderId}`);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export type FulfilAction = "accept" | "reject" | "preparing" | "ready";

/** Packing flow (fulfil_order): accept/reject, mark packing, or "ready" = packed, which requests a rider. */
export async function fulfilOrderAction(orderId: string, action: FulfilAction, note?: string): Promise<ActionResult<{ status: Enums<"order_status">; assignment_id: string | null }>> {
  const parsed = z.object({ orderId: uuid, action: z.enum(["accept", "reject", "preparing", "ready"]), note: optionalText }).safeParse({ orderId, action, note });
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const { data, error } = await supabase.rpc("fulfil_order", { p_order_id: orderId, p_action: parsed.data.action, p_note: parsed.data.note ?? undefined });
    if (error) return fail(error);
    const r = data as { status: Enums<"order_status">; assignment_id: string | null };
    revalidate("/admin/orders", `/admin/orders/${orderId}`, "/admin", `/orders/${orderId}`);
    return { ok: true, data: { status: r.status, assignment_id: r.assignment_id ?? null } };
  } catch (e) { return fail(e); }
}

/** Calls the Razorpay refund route with the caller's cookies so the route's own admin check applies. */
export async function issueRefundAction(orderId: string, amount?: number): Promise<ActionResult<{ refundId: string; amount: number }>> {
  const parsed = z.object({ orderId: uuid, amount: z.coerce.number().positive().optional() }).safeParse({ orderId, amount });
  if (!parsed.success) return invalid(parsed);
  try {
    await requireAdmin();
    const h = await headers();
    const res = await fetch(`${env.siteUrl.replace(/\/$/, "")}/api/payments/razorpay/refund`, { method: "POST", headers: { "Content-Type": "application/json", cookie: h.get("cookie") ?? "" }, body: JSON.stringify(parsed.data), cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; refundId?: string; amount?: number; error?: string };
    if (!res.ok || !body.ok) return { ok: false, error: body.error ?? (res.status === 503 ? "Razorpay is not configured on this deployment (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, SUPABASE_SERVICE_ROLE_KEY). Mark the refund manually after paying out." : `Refund failed (${res.status})`) };
    await audit("payment.refund", "payments", orderId, null, { refund_id: body.refundId, amount: body.amount, via: "razorpay" });
    revalidate(`/admin/orders/${orderId}`, "/admin/payments", "/admin");
    return { ok: true, data: { refundId: body.refundId!, amount: body.amount! } };
  } catch (e) { return fail(e); }
}

export async function markRefundManualAction(orderId: string, reference: string, amount: number): Promise<ActionResult> {
  const parsed = z.object({ orderId: uuid, reference: z.string().trim().min(3, "Enter the UTR / reference number").max(120), amount: z.coerce.number().positive("Enter the refunded amount") }).safeParse({ orderId, reference, amount });
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.rpc("mark_refund_processed", { p_order_id: orderId, p_refund_id: `manual:${parsed.data.reference}`, p_amount: parsed.data.amount, p_raw: { manual: true, reference: parsed.data.reference } });
    if (error) return fail(error);
    await audit("payment.refund_manual", "payments", orderId, null, { reference: parsed.data.reference, amount: parsed.data.amount });
    revalidate(`/admin/orders/${orderId}`, "/admin/payments", "/admin");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Delivery: cities, zones, delivery settings
 * ---------------------------------------------------------------------------------------------- */

export async function setCityActiveAction(cityId: string, isActive: boolean, launchNote?: string | null): Promise<ActionResult> {
  const parsed = z.object({ cityId: uuid, isActive: z.boolean(), launchNote: optionalText }).safeParse({ cityId, isActive, launchNote });
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const { data: before } = await supabase.from("cities").select("is_active, launch_note").eq("id", cityId).maybeSingle();
    const { error } = await supabase.from("cities").update({ is_active: isActive, launch_note: parsed.data.launchNote }).eq("id", cityId);
    if (error) return fail(error);
    await audit("city.update", "cities", cityId, before, { is_active: isActive, launch_note: parsed.data.launchNote });
    revalidate("/admin/delivery", "/");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

const zoneSchema = z.object({
  city_id: uuid, name: z.string().trim().min(2).max(80), area: z.string().trim().min(2).max(200), pincode: z.string().regex(/^[1-9][0-9]{5}$/, "6-digit pincode"),
  center_lat: z.coerce.number().min(-90).max(90), center_lng: z.coerce.number().min(-180).max(180), radius_km: z.coerce.number().min(0.5).max(50),
  delivery_fee: money, min_order_amount: money, free_delivery_threshold: money, eta_min_minutes: z.coerce.number().int().min(5).max(240), eta_max_minutes: z.coerce.number().int().min(5).max(360),
  express_supported: z.boolean().default(true), is_active: z.boolean().default(true),
}).refine((z) => z.eta_max_minutes >= z.eta_min_minutes, { message: "ETA max must be ≥ ETA min", path: ["eta_max_minutes"] });
export type ZoneInput = z.input<typeof zoneSchema>;

export async function saveZoneAction(id: string | null, input: ZoneInput): Promise<ActionResult<{ id: string }>> {
  const parsed = zoneSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    if (id) {
      const { error } = await supabase.from("delivery_zones").update(parsed.data).eq("id", id);
      if (error) return fail(error);
      revalidate("/admin/delivery");
      return { ok: true, data: { id } };
    }
    const { data, error } = await supabase.from("delivery_zones").insert(parsed.data).select("id").single();
    if (error) return fail(error);
    revalidate("/admin/delivery");
    return { ok: true, data: { id: data.id } };
  } catch (e) { return fail(e); }
}

export async function deleteZoneAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid zone" };
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
    if (error) return { ok: false, error: error.code === "23503" ? "Addresses or orders still reference this zone; deactivate it instead." : friendlyError(error) };
    revalidate("/admin/delivery");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Settings (settings table has an audit trigger)
 * ---------------------------------------------------------------------------------------------- */

export async function updateSettingAction(key: string, value: Json): Promise<ActionResult> {
  const parsed = z.object({ key: z.string().regex(/^[a-z0-9_]+$/, "Invalid key") }).safeParse({ key });
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: existing } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
    if (!existing) return { ok: false, error: "Unknown setting" };
    const before = existing.value; const t = (v: Json) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
    if (t(before) !== t(value) && !(t(before) === "number" && t(value) === "string" && !Number.isNaN(Number(value)))) return { ok: false, error: `This setting expects a ${t(before)} value` };
    const { error } = await supabase.from("settings").update({ value, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq("key", key);
    if (error) return fail(error);
    revalidate("/admin/settings", "/admin/delivery", "/", "/cart", "/checkout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function updateSettingsBulkAction(entries: { key: string; value: Json }[]): Promise<ActionResult<{ updated: number }>> {
  if (!Array.isArray(entries) || !entries.length) return { ok: false, error: "Nothing to save" };
  let updated = 0;
  for (const e of entries) { const r = await updateSettingAction(e.key, e.value); if (!r.ok) return { ok: false, error: `${e.key}: ${r.error}` }; updated++; }
  return { ok: true, data: { updated } };
}

/* ------------------------------------------------------------------------------------------------
 * Riders (delivery_partners has an audit trigger)
 * ---------------------------------------------------------------------------------------------- */

export async function setRiderStatusAction(riderId: string, status: Enums<"rider_status">, note?: string): Promise<ActionResult> {
  const parsed = z.object({ riderId: uuid, status: z.enum(["pending", "active", "suspended"]), note: optionalText }).safeParse({ riderId, status, note });
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const { data: rider } = await supabase.from("delivery_partners").select("user_id").eq("id", riderId).maybeSingle();
    if (!rider) return { ok: false, error: "Rider not found" };
    const patch: TablesUpdate<"delivery_partners"> = { status: parsed.data.status };
    if (parsed.data.status !== "active") patch.is_online = false;
    const { error } = await supabase.from("delivery_partners").update(patch).eq("id", riderId);
    if (error) return fail(error);
    const msg: Record<string, [string, string]> = {
      active: ["You're approved!", "Your delivery partner account is active. Go online to start receiving delivery requests."],
      suspended: ["Account suspended", `Your delivery partner account has been suspended.${parsed.data.note ? ` Reason: ${parsed.data.note}` : ""} Contact support for help.`],
      pending: ["Account under review", "Your delivery partner account is under review again."],
    };
    const [title, body] = msg[parsed.data.status];
    await supabase.rpc("admin_notify_user", { p_user_id: rider.user_id, p_type: "rider_status", p_title: title, p_body: body, p_data: { status: parsed.data.status } });
    revalidate("/admin/riders", `/admin/riders/${riderId}`, "/admin");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function updateRiderAdminAction(riderId: string, input: { vehicle_type?: Enums<"vehicle_type">; vehicle_number?: string | null; license_number?: string | null; city_id?: string | null; emergency_contact?: string | null }): Promise<ActionResult> {
  const parsed = z.object({ vehicle_type: z.enum(["bicycle", "bike", "scooter", "auto", "van"]).optional(), vehicle_number: optionalText, license_number: optionalText, city_id: z.string().uuid().nullable().optional(), emergency_contact: optionalText }).safeParse(input);
  if (!parsed.success || !uuid.safeParse(riderId).success) return { ok: false, error: "Invalid input" };
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.from("delivery_partners").update(parsed.data).eq("id", riderId);
    if (error) return fail(error);
    revalidate(`/admin/riders/${riderId}`);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Coupons (audit trigger)
 * ---------------------------------------------------------------------------------------------- */

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, "Code: 3–24 letters/numbers"), title: z.string().trim().min(2).max(100), description: optionalText,
  type: z.enum(["percentage", "fixed"]), value: z.coerce.number().positive("Value must be positive"), min_order_amount: money.default(0), max_discount: z.coerce.number().positive().nullable().optional(),
  first_order_only: z.boolean().default(false), category_id: z.string().uuid().nullable().optional(),
  usage_limit: z.coerce.number().int().positive().nullable().optional(), per_user_limit: z.coerce.number().int().min(1).default(1),
  starts_at: z.string().min(1, "Start date required").transform((v) => new Date(v).toISOString()), expires_at: optionalDate, is_active: z.boolean().default(true),
}).refine((c) => c.type !== "percentage" || c.value <= 100, { message: "Percentage cannot exceed 100", path: ["value"] });
export type CouponInput = z.input<typeof couponSchema>;

export async function saveCouponAction(id: string | null, input: CouponInput): Promise<ActionResult<{ id: string }>> {
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const { data: { user } } = await supabase.auth.getUser();
    if (id) {
      const { error } = await supabase.from("coupons").update(parsed.data).eq("id", id);
      if (error) return fail(error);
      revalidate("/admin/coupons", "/cart");
      return { ok: true, data: { id } };
    }
    const { data, error } = await supabase.from("coupons").insert({ ...parsed.data, created_by: user?.id ?? null }).select("id").single();
    if (error) return { ok: false, error: error.code === "23505" ? "That coupon code already exists" : friendlyError(error) };
    revalidate("/admin/coupons", "/cart");
    return { ok: true, data: { id: data.id } };
  } catch (e) { return fail(e); }
}

export async function deleteCouponAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid coupon" };
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.from("coupons").delete().eq("id", id);
    if (error) return { ok: false, error: error.code === "23503" ? "This coupon was used on orders; deactivate it instead." : friendlyError(error) };
    revalidate("/admin/coupons");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Banners (audit trigger) / promotions (manual audit)
 * ---------------------------------------------------------------------------------------------- */

const bannerSchema = z.object({
  title: z.string().trim().min(2).max(120), subtitle: optionalText, cta_label: optionalText, link_url: z.string().trim().max(500).optional().nullable().transform((v) => (v ? v : null)), image_url: nullableUrl,
  bg_color: hex.default("#329537"), text_color: hex.default("#FFFFFF"), placement: z.enum(["home_hero", "home_mid", "category", "checkout"]).default("home_hero"), sort_order: z.coerce.number().int().min(0).default(0),
  starts_at: z.string().min(1).transform((v) => new Date(v).toISOString()), ends_at: optionalDate, is_active: z.boolean().default(true), city_id: z.string().uuid().nullable().optional(),
});
export type BannerInput = z.input<typeof bannerSchema>;

export async function saveBannerAction(id: string | null, input: BannerInput): Promise<ActionResult<{ id: string }>> {
  const parsed = bannerSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    if (id) {
      const { error } = await supabase.from("banners").update(parsed.data).eq("id", id);
      if (error) return fail(error);
      revalidate("/admin/promotions", "/");
      return { ok: true, data: { id } };
    }
    const { data, error } = await supabase.from("banners").insert(parsed.data).select("id").single();
    if (error) return fail(error);
    revalidate("/admin/promotions", "/");
    return { ok: true, data: { id: data.id } };
  } catch (e) { return fail(e); }
}

export async function deleteBannerAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid banner" };
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.from("banners").delete().eq("id", id);
    if (error) return fail(error);
    revalidate("/admin/promotions", "/");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

const promotionSchema = z.object({
  title: z.string().trim().min(2).max(120), description: optionalText, promo_type: z.enum(["collection", "flash_sale", "bogo"]).default("collection"),
  product_ids: z.array(z.string().uuid()).max(200).default([]), category_id: z.string().uuid().nullable().optional(), discount_percent: z.coerce.number().min(0).max(100).nullable().optional(),
  starts_at: z.string().min(1).transform((v) => new Date(v).toISOString()), ends_at: optionalDate, is_active: z.boolean().default(true), sort_order: z.coerce.number().int().min(0).default(0),
});
export type PromotionInput = z.input<typeof promotionSchema>;

export async function savePromotionAction(id: string | null, input: PromotionInput): Promise<ActionResult<{ id: string }>> {
  const parsed = promotionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    if (id) {
      const { data: before } = await supabase.from("promotions").select("*").eq("id", id).maybeSingle();
      const { error } = await supabase.from("promotions").update(parsed.data).eq("id", id);
      if (error) return fail(error);
      await audit("promotion.update", "promotions", id, before, parsed.data);
      revalidate("/admin/promotions", "/");
      return { ok: true, data: { id } };
    }
    const { data, error } = await supabase.from("promotions").insert(parsed.data).select("id").single();
    if (error) return fail(error);
    await audit("promotion.create", "promotions", data.id, null, parsed.data);
    revalidate("/admin/promotions", "/");
    return { ok: true, data: { id: data.id } };
  } catch (e) { return fail(e); }
}

export async function deletePromotionAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid promotion" };
  try {
    const supabase = await requireAdmin();
    const { data: before } = await supabase.from("promotions").select("*").eq("id", id).maybeSingle();
    const { error } = await supabase.from("promotions").delete().eq("id", id);
    if (error) return fail(error);
    await audit("promotion.delete", "promotions", id, before, null);
    revalidate("/admin/promotions", "/");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Notifications
 * ---------------------------------------------------------------------------------------------- */

export async function broadcastAction(input: { audience: "all" | "customers" | "riders" | "user"; title: string; body: string; email?: string }): Promise<ActionResult<{ recipients: number }>> {
  const parsed = z.object({ audience: z.enum(["all", "customers", "riders", "user"]), title: z.string().trim().min(3, "Title is too short").max(120), body: z.string().trim().min(5, "Message is too short").max(1000), email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")) })
    .refine((v) => v.audience !== "user" || Boolean(v.email), { message: "Enter the user's email", path: ["email"] }).safeParse(input);
  if (!parsed.success) return invalid(parsed);
  try {
    await requireAdmin();
    const { data, error } = await adminRpc<number>("admin_broadcast_notification", { p_audience: parsed.data.audience, p_title: parsed.data.title, p_body: parsed.data.body, p_user_email: parsed.data.email || null });
    if (error) return fail(error);
    revalidate("/admin/notifications");
    return { ok: true, data: { recipients: Number(data ?? 0) } };
  } catch (e) { return fail(e); }
}

export async function markAdminNotificationsReadAction(ids?: string[]): Promise<ActionResult<number>> {
  try {
    const supabase = await requireAdmin();
    const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: ids });
    if (error) return fail(error);
    revalidate("/admin/notifications");
    return { ok: true, data: Number(data ?? 0) };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Support
 * ---------------------------------------------------------------------------------------------- */

export async function updateTicketAction(ticketId: string, input: { status?: Enums<"ticket_status">; priority?: Enums<"ticket_priority">; assignToSelf?: boolean; unassign?: boolean }): Promise<ActionResult> {
  const parsed = z.object({ status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), assignToSelf: z.boolean().optional(), unassign: z.boolean().optional() }).safeParse(input);
  if (!parsed.success || !uuid.safeParse(ticketId).success) return { ok: false, error: "Invalid input" };
  try {
    const supabase = await requireAdmin();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: before } = await supabase.from("support_tickets").select("status, priority, assigned_to, user_id, ticket_number").eq("id", ticketId).maybeSingle();
    if (!before) return { ok: false, error: "Ticket not found" };
    const patch: TablesUpdate<"support_tickets"> = {};
    if (parsed.data.status) patch.status = parsed.data.status;
    if (parsed.data.priority) patch.priority = parsed.data.priority;
    if (parsed.data.assignToSelf) patch.assigned_to = user?.id ?? null;
    if (parsed.data.unassign) patch.assigned_to = null;
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", ticketId);
    if (error) return fail(error);
    await audit("ticket.update", "support_tickets", ticketId, before, patch);
    if (parsed.data.status && parsed.data.status !== before.status && (parsed.data.status === "resolved" || parsed.data.status === "closed")) {
      await supabase.rpc("admin_notify_user", { p_user_id: before.user_id, p_type: "ticket_status", p_title: `Ticket ${before.ticket_number} ${parsed.data.status}`, p_body: "Our support team has updated your ticket. Reply if you still need help.", p_data: { ticket_id: ticketId } });
    }
    revalidate("/admin/support", `/admin/support/${ticketId}`, `/account/support/${ticketId}`);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Reviews
 * ---------------------------------------------------------------------------------------------- */

export async function moderateReviewAction(reviewId: string, status: "approved" | "rejected", note?: string): Promise<ActionResult> {
  const parsed = z.object({ reviewId: uuid, status: z.enum(["approved", "rejected"]), note: optionalText }).safeParse({ reviewId, status, note });
  if (!parsed.success) return invalid(parsed);
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.rpc("moderate_review", { p_review_id: reviewId, p_status: parsed.data.status, p_note: parsed.data.note ?? undefined });
    if (error) return fail(error);
    await audit(`review.${parsed.data.status}`, "reviews", reviewId, null, { status: parsed.data.status, note: parsed.data.note });
    revalidate("/admin/reviews", "/admin");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * Photo studio
 * ---------------------------------------------------------------------------------------------- */

/** Saves the primary photo + gallery for one product from the photo studio. */
export async function setProductPhotosAction(id: string, input: { image_url: string | null; images: string[] }): Promise<ActionResult> {
  const parsed = z.object({ image_url: z.string().min(1).nullable(), images: z.array(z.string().min(1)).max(8) }).safeParse(input);
  if (!parsed.success || !uuid.safeParse(id).success) return { ok: false, error: "Invalid input" };
  try {
    const supabase = await requireAdmin();
    const { error } = await supabase.from("products").update(parsed.data).eq("id", id);
    if (error) return fail(error);
    await audit("product.photos", "products", id, null, parsed.data as unknown as Json);
    revalidate("/admin/products", "/admin/products/images", `/admin/products/${id}`, "/");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/**
 * Imports official product photos from supplied URLs (brand/supplier asset kits) in one pass.
 * Each image is re-framed to the catalogue's house style server-side before it is stored, so an
 * imported pack shot sits on the same white 1000×1000 canvas as an uploaded one.
 */
export async function importProductPhotosAction(items: { slug: string; url: string; source?: string }[]): Promise<ActionResult<{ imported: number; failed: number; results: { slug?: string; ok: boolean; error?: string; url?: string }[] }>> {
  const parsed = z.array(z.object({ slug: z.string().min(1), url: z.string().url("Each line needs a valid https image URL"), source: z.string().max(120).optional() })).min(1, "Nothing to import").max(50, "Import at most 50 at a time").safeParse(items);
  if (!parsed.success) return invalid(parsed);
  try {
    await requireAdmin();
    const h = await headers();
    const origin = (env.siteUrl || `http://${h.get("host") ?? "localhost:3000"}`).replace(/\/$/, "");
    const res = await fetch(`${origin}/api/admin/import-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: h.get("cookie") ?? "" },
      body: JSON.stringify({ items: parsed.data, setPrimary: true }),
    });
    const body = (await res.json()) as { imported?: number; failed?: number; results?: { slug?: string; ok: boolean; error?: string; url?: string }[]; error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `Import failed (${res.status})` };
    revalidate("/admin/products", "/admin/products/images", "/");
    return { ok: true, data: { imported: body.imported ?? 0, failed: body.failed ?? 0, results: body.results ?? [] } };
  } catch (e) { return fail(e); }
}

/* ------------------------------------------------------------------------------------------------
 * PIN recovery for staff and customers (no SMS provider): an admin sets a random 6-digit PIN and
 * reads it out to the verified account holder. Admin PINs need a super admin; nobody resets their own
 * here (they change it in account settings). The PIN is returned once and never logged.
 * ---------------------------------------------------------------------------------------------- */
export async function resetUserPinAction(userId: string): Promise<ActionResult<{ pin: string }>> {
  if (!uuid.safeParse(userId).success) return { ok: false, error: "Invalid account" };
  try {
    const supabase = await requireAdmin();
    const { data: { user: me } } = await supabase.auth.getUser();
    if (me?.id === userId) return { ok: false, error: "Change your own PIN from your account settings." };
    const { data: target } = await supabase.from("profiles").select("role, is_guest, is_active").eq("id", userId).maybeSingle();
    if (!target || target.is_guest) return { ok: false, error: "This account has no PIN to reset (guest or missing account)." };
    if (target.role === "admin" || target.role === "super_admin") {
      const { data: isSuper } = await supabase.rpc("is_super_admin");
      if (!isSuper) return { ok: false, error: "Only a super admin can reset an admin's PIN." };
    }
    const service = createAdminClient();
    if (!service) return { ok: false, error: "PIN reset needs SUPABASE_SERVICE_ROLE_KEY on the server." };
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { error } = await service.auth.admin.updateUserById(userId, { password: pin });
    if (error) return fail(error);
    await audit("user.reset_pin", "profile", userId, undefined, { role: target.role });
    return { ok: true, data: { pin } };
  } catch (e) { return fail(e); }
}
