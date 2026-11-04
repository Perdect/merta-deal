"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import { getRiderAssignments, getRiderStats, type AssignmentStatus } from "@/lib/data/rider";
import type { ActionResult } from "./cart";
import type { Enums } from "@/types/database";
import type { DeliveryPartner, RiderAssignment, RiderStats } from "@/types/app";

export type RiderFormResult = { ok: false; error: string; fieldErrors?: Record<string, string> } | { ok: true; message?: string };

const VEHICLE_TYPES = ["bicycle", "bike", "scooter", "auto", "van"] as const satisfies readonly Enums<"vehicle_type">[];

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const registrationSchema = z.object({
  vehicle_type: z.enum(VEHICLE_TYPES, { message: "Pick your vehicle" }),
  vehicle_number: optionalText(16),
  license_number: optionalText(32),
  aadhaar_last4: z.string().trim().regex(/^\d{4}$/, "Enter the last 4 digits of your Aadhaar"),
  emergency_contact: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
});
const profileSchema = z.object({
  vehicle_type: z.enum(VEHICLE_TYPES, { message: "Pick your vehicle" }),
  vehicle_number: optionalText(16),
  license_number: optionalText(32),
  aadhaar_last4: z.string().trim().regex(/^\d{4}$/, "Enter the last 4 digits of your Aadhaar").optional().or(z.literal("")),
  emergency_contact: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number").optional().or(z.literal("")),
});

function flatten(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of err.issues) { const k = String(issue.path[0] ?? "form"); if (!out[k]) out[k] = issue.message; }
  return out;
}
const norm = (v: string | undefined) => (v ? v.replace(/\s+/g, "").toUpperCase() : null);

/** First-time registration for a signed-in user without a delivery_partners row (own-row insert; status stays 'pending'). */
export async function registerRiderAction(_prev: RiderFormResult | null, formData: FormData): Promise<RiderFormResult> {
  const parsed = registrationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Please check the form", fieldErrors: flatten(parsed.error) };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to continue." };
  const d = parsed.data;
  const values = { vehicle_type: d.vehicle_type, vehicle_number: norm(d.vehicle_number), license_number: norm(d.license_number), aadhaar_last4: d.aadhaar_last4, emergency_contact: d.emergency_contact };
  const { data: existing } = await supabase.from("delivery_partners").select("id").eq("user_id", user.id).maybeSingle();
  if (existing) {
    // The sign-up trigger already created the row (role = rider): just complete it.
    const { error } = await supabase.from("delivery_partners").update(values).eq("id", existing.id);
    if (error) return { ok: false, error: friendlyError(error) };
  } else {
    const { data: city } = await supabase.from("cities").select("id").eq("slug", "merta-city").maybeSingle();
    const { error } = await supabase.from("delivery_partners").insert({ user_id: user.id, city_id: city?.id ?? null, ...values });
    if (error) return { ok: false, error: friendlyError(error) };
  }
  revalidatePath("/rider", "layout");
  return { ok: true, message: "Registration submitted. An admin will review and activate your account." };
}

/** Edit own vehicle / document details. `status`, ratings and totals are protected by a DB trigger. */
export async function updateRiderProfileAction(_prev: RiderFormResult | null, formData: FormData): Promise<RiderFormResult> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Please check the form", fieldErrors: flatten(parsed.error) };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to continue." };
  const d = parsed.data;
  const patch: Partial<DeliveryPartner> = { vehicle_type: d.vehicle_type, vehicle_number: norm(d.vehicle_number), license_number: norm(d.license_number), emergency_contact: d.emergency_contact || null };
  if (d.aadhaar_last4) patch.aadhaar_last4 = d.aadhaar_last4;
  const { error } = await supabase.from("delivery_partners").update(patch).eq("user_id", user.id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/rider", "layout");
  return { ok: true, message: "Profile updated." };
}

/** Go online (requires a real GPS fix from the browser) or offline. */
export async function setOnlineAction(online: boolean, coords?: { lat: number; lng: number }): Promise<ActionResult<{ is_online: boolean }>> {
  if (online && (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng))) return { ok: false, error: "Location is required to go online. Allow GPS access and try again." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rider_set_online", online ? { p_online: true, p_lat: coords!.lat, p_lng: coords!.lng } : { p_online: false });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/rider");
  return { ok: true, data: { is_online: Boolean((data as { is_online?: boolean })?.is_online) } };
}

export async function respondAssignmentAction(assignmentId: string, accept: boolean): Promise<ActionResult<{ status: string; reassigned_to: string | null }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rider_respond_assignment", { p_assignment_id: assignmentId, p_accept: accept });
  if (error) return { ok: false, error: friendlyError(error) };
  const res = data as { ok?: boolean; status?: string; error?: string; reassigned_to?: string | null };
  revalidatePath("/rider");
  // An expired offer is recorded as such (and re-offered) rather than raised, so the expiry is never rolled back.
  if (res.ok === false) return { ok: false, error: friendlyError({ message: res.error ?? "OFFER_EXPIRED" }) };
  return { ok: true, data: { status: res.status ?? (accept ? "accepted" : "rejected"), reassigned_to: res.reassigned_to ?? null } };
}

/** Records "I've reached the pickup point / the customer" on the assignment (idempotent; admins are told once for the store). */
export async function riderArrivedAction(assignmentId: string, where: "pickup" | "customer"): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rider_mark_arrived", { p_assignment_id: assignmentId, p_where: where });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: undefined };
}

export async function pickupAction(assignmentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rider_pickup", { p_assignment_id: assignmentId });
  if (error) {
    if (error.message.startsWith("ORDER_NOT_READY")) return { ok: false, error: "This order is not packed yet. Please wait at the pickup point or call Merta Deal." };
    return { ok: false, error: friendlyError(error) };
  }
  revalidatePath("/rider");
  return { ok: true, data: undefined };
}

export type OtpResult = { ok: true; status: "delivered"; reward_points: number; already?: boolean } | { ok: false; reason: string; attempts_left?: number; locked?: boolean; needs_cash?: boolean };

/**
 * Verifies the customer's 4-digit OTP (and, for Cash on Delivery, the rider's confirmation that the
 * full amount was collected). A wrong OTP is a normal response (`data.ok === false`), not an error.
 * Safe to retry: a repeat after success returns `already: true`.
 */
export async function verifyOtpAction(assignmentId: string, otp: string, cashCollected = false): Promise<ActionResult<OtpResult>> {
  const digits = otp.replace(/\D/g, "");
  if (digits.length !== 4) return { ok: false, error: "Enter the 4-digit OTP from the customer." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_delivery_otp", { p_assignment_id: assignmentId, p_otp: digits, p_cash_collected: cashCollected } as never);
  if (error) return { ok: false, error: friendlyError(error) };
  const res = data as { ok: boolean; reason?: string; attempts_left?: number; reward_points?: number; locked?: boolean; needs_cash?: boolean; already?: boolean };
  revalidatePath("/rider", "layout");
  if (res.ok) return { ok: true, data: { ok: true, status: "delivered", reward_points: Number(res.reward_points ?? 0), already: Boolean(res.already) } };
  return { ok: true, data: { ok: false, reason: res.reason ?? "Incorrect OTP", attempts_left: typeof res.attempts_left === "number" ? res.attempts_left : undefined, locked: Boolean(res.locked), needs_cash: Boolean(res.needs_cash) } };
}

export type RiderHomeData = { stats: RiderStats | null; offers: RiderAssignment[]; active: RiderAssignment[] };

/** One round-trip refresh for the rider home screen (called after realtime events). */
export async function refreshRiderHomeAction(): Promise<ActionResult<RiderHomeData>> {
  try {
    const [stats, offers, active] = await Promise.all([getRiderStats(), getRiderAssignments(["offered"]), getRiderAssignments(["accepted", "picked_up"])]);
    return { ok: true, data: { stats, offers, active } };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

export async function refreshRiderStatsAction(): Promise<ActionResult<RiderStats | null>> {
  try {
    return { ok: true, data: await getRiderStats() };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

export async function getRiderAssignmentsAction(statuses: AssignmentStatus[]): Promise<ActionResult<RiderAssignment[]>> {
  try {
    return { ok: true, data: await getRiderAssignments(statuses) };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

export async function markRiderNotificationsReadAction(ids?: string[]): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: ids });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/rider/profile");
  return { ok: true, data: Number(data ?? 0) };
}

export type FailedDeliveryReason = "customer_unreachable" | "address_problem" | "customer_refused" | "other";
/** The handover couldn't happen: the order goes back for re-dispatch and admin re-dispatches or cancels it. */
export async function reportFailedDeliveryAction(assignmentId: string, reason: FailedDeliveryReason, note?: string): Promise<ActionResult<{ order_status: string }>> {
  if (!/^[0-9a-f-]{36}$/.test(assignmentId)) return { ok: false, error: "Invalid delivery" };
  if (reason === "other" && (note ?? "").trim().length < 5) return { ok: false, error: "Describe what happened (at least 5 characters)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rider_report_failed_delivery" as never, { p_assignment_id: assignmentId, p_reason: reason, p_note: note?.trim() || null } as never);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/rider");
  return { ok: true, data: { order_status: String((data as { order_status: string }).order_status) } };
}
