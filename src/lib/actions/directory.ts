"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import { BUSINESS_CATEGORIES, DAYS, DIRECTORY, type BusinessCategory } from "@/lib/directory";
import type { ActionResult } from "./cart";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
type Write = PromiseLike<{ data: unknown; error: { message: string } | null }> & { eq: (k: string, v: string) => Write; select: (c: string) => Write; single: () => Write };
type Tbl = { insert: (v: unknown) => Write; update: (v: unknown) => Write; delete: () => Write };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: friendlyError(e) });

async function admin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("SESSION_EXPIRED");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) throw new Error("FORBIDDEN");
  return { userId: user.id, rpc: supabase.rpc.bind(supabase) as unknown as Rpc, from: (t: string) => (supabase as unknown as { from: (t: string) => Tbl }).from(t) };
}
const refresh = (category?: BusinessCategory, slug?: string) => {
  revalidatePath("/admin/businesses");
  if (category) { revalidatePath(DIRECTORY[category].path); if (slug) revalidatePath(`${DIRECTORY[category].path}/${slug}`); }
};

const listing = z.object({
  businessName: z.string().trim().min(2, "Enter the business name").max(120), category: z.enum(BUSINESS_CATEGORIES),
  ownerName: z.string().trim().min(2, "Enter your name").max(80), ownerPhone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  whatsapp: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit WhatsApp number").or(z.literal("")).optional(),
  address: z.string().trim().min(5, "Enter the business address").max(300), details: z.string().trim().max(2000, "That is too long").optional(),
  kind: z.enum(["new", "update"]).default("new"), businessSlug: z.string().optional(),
});

/** Public form. A request only reaches the admin queue; nothing is published from here. */
export async function submitListingAction(input: z.input<typeof listing>, honeypot: string): Promise<ActionResult<{ saved: boolean }>> {
  if (honeypot) return { ok: true, data: { saved: false } };
  const p = listing.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form and try again." };
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const r = p.data;
  const { error } = await rpc("submit_business_listing", { p_business_name: r.businessName, p_category: r.category, p_owner_name: r.ownerName, p_owner_phone: r.ownerPhone, p_address: r.address, p_whatsapp: r.whatsapp || null, p_details: r.details || null, p_kind: r.kind, p_business_slug: r.businessSlug ?? null });
  if (error) {
    if (error.message.startsWith("LISTING:")) return { ok: false, error: friendlyError(error) };
    console.error("submit_business_listing", error.code, error.message);
    return { ok: true, data: { saved: false } };
  }
  return { ok: true, data: { saved: true } };
}

const list = (max: number) => z.array(z.string().trim().min(1).max(60)).max(max);
const opt = (max: number) => z.string().trim().max(max).nullable().transform((v) => v || null);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const business = z.object({
  id: z.string().uuid().optional(), slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens in the URL"), category: z.enum(BUSINESS_CATEGORIES), name: z.string().trim().min(2, "Enter the business name").max(120),
  description: opt(2000), logo_url: opt(500), photos: z.array(z.string().url()).max(12), address_line: opt(300), area: opt(120), pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a 6-digit pincode").or(z.literal("")).nullable().transform((v) => v || null),
  lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(), phone: opt(20), whatsapp: opt(20),
  opening_hours: z.partialRecord(z.enum(DAYS), z.object({ open: time, close: time })).nullable(), hours_verified: z.boolean(), facilities: list(30), cuisines: list(15), veg_type: z.enum(["pure_veg", "veg_options", "not_stated"]), offers_rooms: z.boolean(),
  accepts_delivery: z.boolean(), delivery_coverage: opt(300), delivery_charge: opt(120), delivery_eta: opt(120), order_confirmation: z.enum(["immediate", "business_approval"]), is_paid_placement: z.boolean(), duplicate_of: z.string().uuid().nullable(), contact_verified: z.boolean(),
});
export type BusinessInput = z.input<typeof business>;

/** Saves a profile. Publishing is separate; the database refuses it while anything is missing. */
export async function saveBusinessAction(input: BusinessInput): Promise<ActionResult<{ id: string }>> {
  const p = business.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form and try again." };
  try {
    const { userId, from } = await admin();
    const { id, contact_verified, ...rest } = p.data;
    const row = { ...rest, offers_rooms: rest.category === "hotel" && rest.offers_rooms, updated_by: userId, contact_verified_at: contact_verified ? new Date().toISOString() : null };
    const t = from("local_businesses");
    const { data, error } = await (id ? t.update(row).eq("id", id).select("id").single() : t.insert({ ...row, created_by: userId }).select("id").single());
    if (error) return fail(error);
    refresh(rest.category, rest.slug);
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (e) { return fail(e); }
}

export async function setBusinessStatusAction(id: string, status: "draft" | "published" | "archived", category: BusinessCategory, slug: string): Promise<ActionResult<null>> {
  try {
    const { userId, from } = await admin();
    const { error } = await from("local_businesses").update({ status, updated_by: userId }).eq("id", id);
    if (error) return fail(error);
    refresh(category, slug);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function reviewListingAction(id: string, approve: boolean, note: string): Promise<ActionResult<{ businessId: string | null }>> {
  try {
    const { rpc } = await admin();
    const { data, error } = await rpc("admin_review_listing", { p_id: id, p_approve: approve, p_note: note || null });
    if (error) return fail(error);
    refresh();
    return { ok: true, data: { businessId: (data as string | null) ?? null } };
  } catch (e) { return fail(e); }
}

const menuItem = z.object({
  id: z.string().uuid().optional(), business_id: z.string().uuid(), section: opt(80), name: z.string().trim().min(2, "Enter the item name").max(120), description: opt(300),
  price: z.number().min(0).nullable(), is_veg: z.boolean().nullable(), is_available: z.boolean(), product_id: z.string().uuid().or(z.literal("")).nullable().transform((v) => v || null), sort_order: z.number().int(),
});
export async function saveMenuItemAction(input: z.input<typeof menuItem>): Promise<ActionResult<null>> {
  const p = menuItem.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the item and try again." };
  try {
    const { from } = await admin();
    const { id, ...row } = p.data;
    const { error } = await (id ? from("business_menu_items").update(row).eq("id", id) : from("business_menu_items").insert(row));
    if (error) return fail(error);
    refresh();
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}
export async function deleteMenuItemAction(id: string): Promise<ActionResult<null>> {
  try {
    const { from } = await admin();
    const { error } = await from("business_menu_items").delete().eq("id", id);
    if (error) return fail(error);
    refresh();
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}
