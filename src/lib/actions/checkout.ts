"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPublicSettings } from "@/lib/data/catalog";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";
import type { Address, DeliveryType, PaymentMethod } from "@/types/app";

const addressSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["home", "work", "other"]).default("home"),
  label: z.string().max(40).optional().nullable(),
  full_name: z.string().trim().min(2, "Enter the receiver's name"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  house: z.string().trim().min(1, "Enter your house, flat or shop number"),
  // Optional: most Merta addresses are house + area + landmark. Stored as "" (column is NOT NULL).
  street: z.string().trim().max(120).optional().nullable().transform((v) => v ?? ""),
  area: z.string().trim().min(2, "Enter your area or colony"),
  landmark: z.string().trim().max(120).optional().nullable().transform((v) => v || null),
  city: z.string().min(2).default("Merta City"),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode"),
  lat: z.coerce.number().optional().nullable(),
  lng: z.coerce.number().optional().nullable(),
  is_default: z.coerce.boolean().default(false),
});
export type AddressInput = z.input<typeof addressSchema>;

/**
 * Saves an address for the signed-in (or newly started guest) user. The delivery zone is decided here,
 * by `find_zone` (pin first, then pincode): an address outside every zone is refused with
 * `outsideArea`, never stored, so no client-side check can let one through. The zone lookup and the
 * "is there a default yet" count run in parallel; one round trip each instead of a chain.
 */
export async function saveAddressAction(input: AddressInput): Promise<ActionResult<Address> & { fieldErrors?: Record<string, string>; outsideArea?: boolean }> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Please fix the highlighted fields", fieldErrors };
  }
  const supabase = await createClient();
  let { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // First thing a new visitor does may be picking an address: start the guest session here, as ADD does.
    if (!env.anonymousAuthEnabled) return { ok: false, error: "Please sign in to save an address" };
    const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously({ options: { data: { full_name: "Guest", role: "customer" } } });
    if (anonErr || !anon.user) return { ok: false, error: anonErr ? friendlyError(anonErr) : "Please sign in to save an address" };
    user = anon.user;
  }
  const { id, ...rest } = parsed.data;
  const [{ data: zone }, defaults] = await Promise.all([
    supabase.rpc("find_zone", { p_pincode: rest.pincode, p_lat: rest.lat ?? undefined, p_lng: rest.lng ?? undefined }),
    // No checkbox in the form: the first saved address becomes the default; later ones only when chosen under Saved addresses.
    !rest.is_default && !id ? supabase.from("addresses").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_default", true) : Promise.resolve({ count: null as number | null }),
  ]);
  const zoneRow = zone as unknown as { id: string | null } | null;
  if (!zoneRow?.id) {
    const brand = String((await getPublicSettings()).brand_name ?? "Merta Deal");
    return { ok: false, outsideArea: true, error: `Sorry, ${brand} doesn't deliver to this ${rest.lat != null && rest.lng != null ? "location" : "pincode"} yet.` };
  }
  const payload = { ...rest, user_id: user.id, zone_id: zoneRow.id, lat: rest.lat ?? null, lng: rest.lng ?? null, landmark: rest.landmark ?? null, label: rest.label ?? null };
  if (!payload.is_default && !id && !defaults.count) payload.is_default = true;
  if (payload.is_default) await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
  const q = id ? supabase.from("addresses").update(payload).eq("id", id).eq("user_id", user.id).select().single() : supabase.from("addresses").insert(payload).select().single();
  const { data, error } = await q;
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/checkout"); revalidatePath("/account/addresses");
  return { ok: true, data: data as Address };
}

export async function deleteAddressAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("addresses").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/account/addresses");
  return { ok: true, data: undefined };
}

export async function setDefaultAddressAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in" };
  await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
  const { error } = await supabase.from("addresses").update({ is_default: true }).eq("id", id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/checkout"); revalidatePath("/account/addresses");
  return { ok: true, data: undefined };
}

export type PlaceOrderInput = { addressId: string; paymentMethod: PaymentMethod; deliveryType: DeliveryType; instructions?: string; scheduledStart?: string; scheduledEnd?: string };
export type PlaceOrderResult = { order_id: string; order_number: string; total: number; payment_required: boolean; payment_method: PaymentMethod; /** cod | wallet | razorpay | upi (direct, confirmed by the admin) */ payment_provider?: string; upi_pending?: boolean };

export async function placeOrderAction(input: PlaceOrderInput): Promise<ActionResult<PlaceOrderResult>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_order", {
    p_address_id: input.addressId,
    p_payment_method: input.paymentMethod,
    p_delivery_type: input.deliveryType,
    p_instructions: input.instructions || undefined,
    p_scheduled_start: input.scheduledStart || undefined,
    p_scheduled_end: input.scheduledEnd || undefined,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/cart"); revalidatePath("/orders");
  return { ok: true, data: data as unknown as PlaceOrderResult };
}
