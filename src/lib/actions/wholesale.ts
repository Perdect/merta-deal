"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";
import type { WholesaleBuyer, WholesaleList, WholesaleOrder } from "@/lib/wholesale";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
const rpc = async () => { const s = await createClient(); return s.rpc.bind(s) as unknown as Rpc; };
const MINE = "/account/wholesale";
const run = async <T,>(fn: string, args: Record<string, unknown>, paths: string[]): Promise<ActionResult<T>> => {
  const { data, error } = await (await rpc())(fn, args);
  if (error) {
    // The function is missing until its migration is applied: say so instead of showing a database error.
    if (/could not find the function|does not exist/i.test(error.message)) return { ok: false, error: "This part of wholesale isn't switched on yet. Please call us and we will take your list." };
    return { ok: false, error: friendlyError(error) };
  }
  for (const p of paths) revalidatePath(p);
  return { ok: true, data: data as T };
};
const lines = (items: { product_id: string; cases: number }[]) => items.filter((i) => i.cases > 0).map((i) => ({ product_id: i.product_id, cases: Math.floor(i.cases) }));

const profileSchema = z.object({
  shopName: z.string().trim().max(120).optional().or(z.literal("")),
  ownerName: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().transform((v) => v.replace(/\D/g, "").slice(-10)).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number")),
  gstin: z.string().trim().toUpperCase().max(15).optional().or(z.literal("")),
  addressId: z.string().uuid("Pick a delivery address").nullable(),
  monthlyNeeds: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type WholesaleProfileInput = z.input<typeof profileSchema>;

/** Optional details for wholesale bills and delivery: shop name/GSTIN (shops only), contact, address, monthly needs. Creates the buyer row if needed. */
export async function saveWholesaleProfileAction(input: WholesaleProfileInput): Promise<ActionResult<WholesaleBuyer>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form" };
  const d = parsed.data;
  return run<WholesaleBuyer>("save_wholesale_profile", { p_shop_name: d.shopName || null, p_owner_name: d.ownerName, p_phone: d.phone, p_gstin: d.gstin || null, p_address_id: d.addressId, p_monthly_needs: d.monthlyNeeds || null }, [MINE, "/wholesale/register", "/admin/wholesale"]);
}

/** Order full cases now. The order is created already approved and waits for an admin to confirm and place it. */
export async function orderWholesaleNowAction(items: { product_id: string; cases: number }[], note: string, deliveryDate: string | null): Promise<ActionResult<WholesaleOrder>> {
  const ls = lines(items);
  if (ls.length === 0) return { ok: false, error: "Add at least one product." };
  if (deliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return { ok: false, error: "Pick a valid delivery date." };
  return run<WholesaleOrder>("order_wholesale_now", { p_items: ls, p_note: note.trim().slice(0, 300) || null, p_delivery_date: deliveryDate }, [MINE, "/wholesale", "/admin/wholesale"]);
}

const requestedSchema = z.array(z.object({
  name: z.string().trim().min(2, "Write the product name").max(120),
  brand: z.string().trim().max(80).optional().or(z.literal("")),
  quantity: z.coerce.number().positive("Enter how much you need").max(999999),
  unit: z.string().trim().min(1, "Choose a unit").max(40),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
  photoUrl: z.string().trim().url().startsWith("https://", "That photo could not be attached").max(500).nullable().optional(),
})).max(50);
export type WholesaleRequestInput = z.input<typeof requestedSchema>[number];

const submitSchema = z.object({
  items: z.array(z.object({ product_id: z.string().uuid(), cases: z.number().int().min(1) })),
  requested: requestedSchema,
  addressId: z.string().uuid("Choose a delivery address").nullable(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid delivery date").nullable(),
  contactName: z.string().trim().max(80).optional().or(z.literal("")),
  contactPhone: z.string().trim().transform((v) => v.replace(/\D/g, "").slice(-10)).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number")).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type WholesaleSubmitInput = z.input<typeof submitSchema>;

/**
 * Send one bulk order: catalogue cases, items the customer wrote in, or both. The database decides
 * whether it can be approved straight away or has to wait for a quote — this never promises either.
 */
export async function submitWholesaleOrderAction(input: WholesaleSubmitInput): Promise<ActionResult<WholesaleOrder>> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form" };
  const d = parsed.data;
  const items = lines(d.items);
  if (items.length === 0 && d.requested.length === 0) return { ok: false, error: "Add at least one product or write what you need." };
  return run<WholesaleOrder>("submit_wholesale_order", {
    p_items: items,
    p_requested: d.requested.map((r) => ({ name: r.name, brand: r.brand || null, quantity: String(r.quantity), unit: r.unit, notes: r.notes || null, photo_url: r.photoUrl || null })),
    p_address_id: d.addressId, p_delivery_date: d.deliveryDate,
    p_contact_name: d.contactName || null, p_contact_phone: d.contactPhone || null, p_notes: d.notes || null,
  }, [MINE, "/wholesale", "/wholesale/order", "/admin/wholesale"]);
}

/** Customer: approve or decline the quote staff sent. */
export async function respondWholesaleQuoteAction(id: string, action: "approve" | "decline", note: string): Promise<ActionResult<WholesaleOrder>> {
  return run<WholesaleOrder>("shop_respond_wholesale_quote", { p_id: id, p_action: action, p_note: note.trim().slice(0, 300) || null }, [MINE, "/admin/wholesale"]);
}

/** Staff: save the working quote (`save`) or send it to the customer (`send`). */
export async function adminQuoteWholesaleOrderAction(input: {
  id: string; items: { product_id: string; cases: number }[];
  requested: { id: string; status: "pending" | "fulfilled" | "unavailable"; product_id: string | null; adminNote: string }[];
  deliveryFee: number | null; note: string; action: "save" | "send";
}): Promise<ActionResult<WholesaleOrder>> {
  if (input.deliveryFee != null && (!Number.isFinite(input.deliveryFee) || input.deliveryFee < 0)) return { ok: false, error: "The delivery fee cannot be negative." };
  return run<WholesaleOrder>("admin_quote_wholesale_order", {
    p_id: input.id, p_items: lines(input.items),
    p_requested: input.requested.map((r) => ({ id: r.id, status: r.status, product_id: r.product_id, admin_note: r.adminNote.trim().slice(0, 300) || null })),
    p_delivery_fee: input.deliveryFee, p_note: input.note.trim().slice(0, 300) || null, p_action: input.action,
  }, ["/admin/wholesale", MINE]);
}

export async function saveWholesaleListAction(restockDay: number, items: { product_id: string; cases: number }[], name?: string): Promise<ActionResult<WholesaleList>> {
  if (!Number.isInteger(restockDay) || restockDay < 1 || restockDay > 28) return { ok: false, error: "Pick a restock day between 1 and 28." };
  return run<WholesaleList>("save_wholesale_list", { p_restock_day: restockDay, p_items: lines(items), p_name: name ?? null }, [MINE]);
}
export async function pauseWholesaleListAction(active: boolean): Promise<ActionResult<null>> {
  return run<null>("pause_wholesale_list", { p_active: active }, [MINE]);
}
export async function proposeWholesaleOrderAction(): Promise<ActionResult<WholesaleOrder>> {
  return run<WholesaleOrder>("propose_wholesale_order", {}, [MINE]);
}
export async function reviewWholesaleOrderAction(id: string, action: "approve" | "skip", items: { product_id: string; cases: number }[] | null, note: string): Promise<ActionResult<WholesaleOrder>> {
  return run<WholesaleOrder>("shop_review_wholesale_order", { p_id: id, p_action: action, p_items: items ? lines(items) : null, p_note: note.trim().slice(0, 300) || null }, [MINE, "/admin/wholesale"]);
}

/* ---------- admin ---------- */
export async function adminReviewBuyerAction(buyerId: string, status: "approved" | "suspended", note: string): Promise<ActionResult<WholesaleBuyer>> {
  return run<WholesaleBuyer>("admin_review_kirana_shop", { p_shop_id: buyerId, p_status: status, p_note: note.trim().slice(0, 300) || null }, ["/admin/wholesale", MINE]);
}
export async function adminSetWholesaleProductAction(input: { productId: string; caseSize: number; moqCases: number; maxCases: number | null; pricePerCase: number | null; isAvailable: boolean }): Promise<ActionResult<unknown>> {
  return run("admin_set_wholesale_product", { p_product_id: input.productId, p_case_size: input.caseSize, p_moq_cases: input.moqCases, p_max_cases: input.maxCases, p_price_per_case: input.pricePerCase, p_is_available: input.isAvailable }, ["/admin/wholesale", "/wholesale", MINE]);
}
export async function adminRemoveWholesaleProductAction(productId: string): Promise<ActionResult<null>> {
  return run<null>("admin_remove_wholesale_product", { p_product_id: productId }, ["/admin/wholesale", "/wholesale", MINE]);
}
export async function adminConfirmWholesaleOrderAction(id: string, note: string): Promise<ActionResult<{ order_id: string; order_number: string; total: number; item_count: number }>> {
  return run("admin_confirm_wholesale_order", { p_id: id, p_note: note.trim().slice(0, 300) || null }, ["/admin/wholesale", "/admin/orders", MINE, "/account/orders"]);
}
export async function adminCancelWholesaleOrderAction(id: string, note: string): Promise<ActionResult<WholesaleOrder>> {
  return run<WholesaleOrder>("admin_cancel_wholesale_order", { p_id: id, p_note: note.trim().slice(0, 300) || null }, ["/admin/wholesale", MINE]);
}
