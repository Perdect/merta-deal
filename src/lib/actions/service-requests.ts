"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import { REQUEST_DESTINATIONS, REQUEST_KINDS, REQUEST_STATUSES, REQUEST_URGENCIES, type ServiceRequestInput } from "@/lib/service-requests";
import type { ActionResult } from "./cart";

/** service_requests arrives with migration 0039; these two calls stay untyped until the types are regenerated. */
type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

const text = (max: number) => z.string().trim().max(max, "That is too long. Please shorten it.").optional();
const schema = z.object({
  kind: z.enum(REQUEST_KINDS),
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  item: z.string().trim().min(2, "Tell us what you need").max(200),
  drop: z.string().trim().min(3, "Enter the delivery location").max(300),
  pickup: text(300), quantity: text(100), occasion: text(100), notes: text(1000),
  preferredAt: z.string().datetime().nullable().optional(),
  urgency: z.enum(REQUEST_URGENCIES),
  destination: z.enum(REQUEST_DESTINATIONS).optional(),
  placeName: text(120), placeDetail: text(120), viaReception: z.boolean().optional(),
  recipientName: text(80), recipientPhone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter the receiver's 10-digit mobile number").optional(),
  giftMessage: text(200), context: text(120),
}).superRefine((v, ctx) => {
  if (v.destination === "hotel" && !v.placeName) ctx.addIssue({ code: "custom", message: "Enter the hotel name", path: ["placeName"] });
  if (v.destination === "office" && !v.placeName) ctx.addIssue({ code: "custom", message: "Enter the company name", path: ["placeName"] });
});

/**
 * Saves a request from a public service page. `saved: false` means the database could not take it (for
 * example before migration 0039 is applied): the form then says so and offers WhatsApp and call instead,
 * so a customer is never told a request was received when it was not.
 */
export async function submitServiceRequestAction(input: ServiceRequestInput, honeypot: string): Promise<ActionResult<{ saved: boolean; reference: string | null }>> {
  // Bots fill every field. Answer as if nothing happened and store nothing.
  if (honeypot) return { ok: true, data: { saved: false, reference: null } };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const r = parsed.data;
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { data, error } = await rpc("submit_service_request", {
    p_kind: r.kind, p_name: r.name, p_phone: r.phone, p_item_type: r.item, p_drop: r.drop, p_pickup: r.pickup || null, p_quantity: r.quantity || null,
    p_occasion: r.occasion || null, p_preferred_at: r.preferredAt ?? null, p_urgency: r.urgency, p_notes: r.notes || null,
    p_destination: r.destination ?? "home", p_place_name: r.placeName || null, p_place_detail: r.placeDetail || null, p_via_reception: r.viaReception ?? false,
    p_recipient_name: r.recipientName || null, p_recipient_phone: r.recipientPhone || null, p_gift_message: r.giftMessage || null, p_context: r.context || null,
  });
  if (error) {
    if (error.message.startsWith("SERVICE_REQUEST:")) return { ok: false, error: friendlyError(error) };
    console.error("submit_service_request", error.code, error.message);
    return { ok: true, data: { saved: false, reference: null } };
  }
  return { ok: true, data: { saved: true, reference: (data as { request_number?: string } | null)?.request_number ?? null } };
}

const updateSchema = z.object({
  id: z.string().uuid("Invalid request"),
  status: z.enum(REQUEST_STATUSES),
  quotedCharge: z.number().min(0, "The charge cannot be negative").max(1_000_000).nullable(),
  note: z.string().trim().max(1000, "The note is too long").nullable(),
});

export async function updateServiceRequestAction(input: { id: string; status: string; quotedCharge: number | null; note: string | null }): Promise<ActionResult<null>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { error } = await rpc("admin_update_service_request", { p_id: parsed.data.id, p_status: parsed.data.status, p_quoted_charge: parsed.data.quotedCharge, p_admin_note: parsed.data.note });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/requests");
  return { ok: true, data: null };
}
