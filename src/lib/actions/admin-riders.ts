"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";
import type { Enums, Json } from "@/types/database";

const uuid = z.string().uuid("Invalid rider");
const VEHICLES = ["bicycle", "bike", "scooter", "auto", "van"] as const;
const fail = (e: unknown): ActionResult<never> => ({ ok: false, error: friendlyError(e) });
const riderFields = {
  fullName: z.string().trim().min(2, "Enter the rider's name").max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter the rider's 10-digit mobile number"),
  vehicle_type: z.enum(VEHICLES),
  vehicle_number: z.string().trim().toUpperCase().max(15).optional().nullable().transform((v) => v || null).refine((v) => !v || /^[A-Z0-9 -]{4,15}$/.test(v), "Vehicle number: 4–15 letters or digits, e.g. RJ21SA1234"),
  license_number: z.string().trim().max(30, "Licence number is too long").optional().nullable().transform((v) => v || null),
  city_id: z.string().uuid().optional().nullable().transform((v) => v || null),
  emergency_contact: z.string().trim().max(80).optional().nullable().transform((v) => v || null),
};

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("SESSION_EXPIRED");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) throw new Error("FORBIDDEN");
  return { supabase, userId: user.id };
}
async function audit(action: string, entityId: string, after: Record<string, unknown>) {
  const supabase = await createClient();
  await supabase.rpc("admin_audit", { p_action: action, p_entity: "delivery_partners", p_entity_id: entityId, p_after: after as unknown as Json });
}
const revalidate = (...paths: string[]) => paths.forEach((p) => revalidatePath(p));

export type NewRiderInput = { fullName: string; phone: string; email: string; password: string; vehicle_type: Enums<"vehicle_type">; vehicle_number?: string | null; license_number?: string | null; city_id?: string | null; emergency_contact?: string | null; approve: boolean; /** Application (0047) this rider is created from; marked "created" afterwards. */ applicationId?: string | null };

/**
 * Adds a delivery partner from the admin panel: creates the sign-in (email + password, confirmed),
 * gives it the rider role, and creates the rider record. "approve" starts them Active so they can go
 * online at once; otherwise they wait under Pending approval like a self sign-up.
 */
export async function createRiderAction(input: NewRiderInput): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ ...riderFields, email: z.string().trim().toLowerCase().email("Enter a valid email address"), password: z.string().min(8, "Use at least 8 characters").max(72), approve: z.boolean(), applicationId: z.string().uuid().optional().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    const { supabase } = await requireAdmin();
    const admin = createAdminClient();
    if (!admin) return { ok: false, error: "Adding riders needs SUPABASE_SERVICE_ROLE_KEY on the server." };
    const { data: dupe } = await supabase.from("profiles").select("id").eq("phone", d.phone).maybeSingle();
    if (dupe) return { ok: false, error: "An account with this mobile number already exists. Open it under Users and give it the rider role instead." };
    const { data, error } = await admin.auth.admin.createUser({ email: d.email, password: d.password, email_confirm: true, user_metadata: { full_name: d.fullName, phone: d.phone, role: "rider" } });
    if (error) return { ok: false, error: /already/i.test(error.message) ? "An account with this email already exists." : error.message };
    const userId = data.user.id;
    await admin.from("profiles").update({ full_name: d.fullName, phone: d.phone, is_active: true }).eq("id", userId);
    const { error: roleErr } = await supabase.rpc("admin_set_user_role", { p_user_id: userId, p_role: "rider" });
    if (roleErr) return { ok: false, error: `Sign-in created, but the rider role was not set: ${friendlyError(roleErr)}` };
    // admin_set_user_role already creates a bare rider record for the user (pending, Merta City), so
    // fill that in rather than inserting a second one; insert only if, for any reason, it is missing.
    const details = { vehicle_type: d.vehicle_type, vehicle_number: d.vehicle_number, license_number: d.license_number, city_id: d.city_id, emergency_contact: d.emergency_contact, status: d.approve ? "active" : "pending" } as const;
    let riderId: string | null = null;
    const { data: existing, error: uErr } = await supabase.from("delivery_partners").update(details).eq("user_id", userId).select("id").maybeSingle();
    if (uErr) return { ok: false, error: `Sign-in created, but the rider record failed: ${friendlyError(uErr)}` };
    riderId = existing?.id ?? null;
    if (!riderId) {
      const { data: inserted, error: rErr } = await supabase.from("delivery_partners").insert({ user_id: userId, ...details }).select("id").single();
      if (rErr) return { ok: false, error: `Sign-in created, but the rider record failed: ${friendlyError(rErr)}` };
      riderId = inserted.id;
    }
    const rider = { id: riderId };
    if (d.applicationId) {
      type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
      await (supabase.rpc.bind(supabase) as unknown as Rpc)("admin_link_rider_application", { p_id: d.applicationId, p_user_id: userId });
    }
    await audit("rider.create", rider.id, { user_id: userId, email: d.email, phone: d.phone, status: d.approve ? "active" : "pending", application_id: d.applicationId ?? null });
    revalidate("/admin/riders", "/admin/users");
    return { ok: true, data: { id: rider.id } };
  } catch (e) { return fail(e); }
}

export type EditRiderInput = { fullName: string; phone: string; vehicle_type: Enums<"vehicle_type">; vehicle_number?: string | null; license_number?: string | null; city_id?: string | null; emergency_contact?: string | null };

/** Name and phone (profile) plus vehicle, licence, city and emergency contact (rider record) in one save. */
export async function updateRiderAction(riderId: string, input: EditRiderInput): Promise<ActionResult> {
  const parsed = z.object(riderFields).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (!uuid.safeParse(riderId).success) return { ok: false, error: "Invalid rider" };
  const d = parsed.data;
  try {
    const { supabase } = await requireAdmin();
    const { data: rider } = await supabase.from("delivery_partners").select("user_id").eq("id", riderId).maybeSingle();
    if (!rider) return { ok: false, error: "Rider not found." };
    const { data: dupe } = await supabase.from("profiles").select("id").eq("phone", d.phone).neq("id", rider.user_id).maybeSingle();
    if (dupe) return { ok: false, error: "Another account already uses this mobile number." };
    const { error: pErr } = await supabase.from("profiles").update({ full_name: d.fullName, phone: d.phone }).eq("id", rider.user_id);
    if (pErr) return fail(pErr);
    const { error } = await supabase.from("delivery_partners").update({ vehicle_type: d.vehicle_type, vehicle_number: d.vehicle_number, license_number: d.license_number, city_id: d.city_id, emergency_contact: d.emergency_contact }).eq("id", riderId);
    if (error) return fail(error);
    await audit("rider.update", riderId, { full_name: d.fullName, phone: d.phone, vehicle_type: d.vehicle_type, vehicle_number: d.vehicle_number, license_number: d.license_number, city_id: d.city_id });
    revalidate("/admin/riders", `/admin/riders/${riderId}`, "/admin/users");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/**
 * Removes a rider. Refused while a delivery is in progress, and refused when the rider has any
 * delivery or earnings history (those records must stay for accounts; suspend instead). The person's
 * sign-in is deleted too when it has no orders; otherwise it stays as a customer account.
 */
export async function deleteRiderAction(riderId: string): Promise<ActionResult<{ accountDeleted: boolean }>> {
  if (!uuid.safeParse(riderId).success) return { ok: false, error: "Invalid rider" };
  try {
    const { supabase, userId: me } = await requireAdmin();
    const { data: rider } = await supabase.from("delivery_partners").select("user_id, status, user:profiles!delivery_partners_user_id_fkey(full_name, email)").eq("id", riderId).maybeSingle();
    if (!rider) return { ok: false, error: "Rider not found." };
    if (rider.user_id === me) return { ok: false, error: "You cannot delete your own rider record." };
    const [{ count: live }, { count: history }, { count: earnings }] = await Promise.all([
      supabase.from("delivery_assignments").select("id", { count: "exact", head: true }).eq("rider_id", riderId).in("status", ["offered", "accepted", "picked_up"]),
      supabase.from("delivery_assignments").select("id", { count: "exact", head: true }).eq("rider_id", riderId),
      supabase.from("rider_earnings").select("id", { count: "exact", head: true }).eq("rider_id", riderId),
    ]);
    if ((live ?? 0) > 0) return { ok: false, error: "This rider has a delivery in progress. Wait for it to finish or reassign it, then delete." };
    if ((history ?? 0) > 0 || (earnings ?? 0) > 0) return { ok: false, error: `This rider has ${history ?? 0} ${history === 1 ? "delivery" : "deliveries"} and earnings on record, which must stay for accounts. Suspend the rider instead.` };
    const { error } = await supabase.from("delivery_partners").delete().eq("id", riderId);
    if (error) return fail(error);
    const { count: orders } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", rider.user_id);
    let accountDeleted = false;
    const admin = createAdminClient();
    if ((orders ?? 0) === 0 && admin) {
      const { error: delErr } = await admin.auth.admin.deleteUser(rider.user_id);
      accountDeleted = !delErr;
    }
    if (!accountDeleted) await supabase.rpc("admin_set_user_role", { p_user_id: rider.user_id, p_role: "customer" });
    const u = Array.isArray(rider.user) ? rider.user[0] : rider.user;
    await audit("rider.delete", riderId, { user_id: rider.user_id, name: u?.full_name ?? null, email: u?.email ?? null, account_deleted: accountDeleted });
    revalidate("/admin/riders", "/admin/users");
    return { ok: true, data: { accountDeleted } };
  } catch (e) { return fail(e); }
}

/** Decline (or reopen) a delivery partner application with a note (0047). */
export async function reviewRiderApplicationAction(id: string, status: "declined" | "new", note: string): Promise<ActionResult<null>> {
  try {
    const { supabase } = await requireAdmin();
    type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
    const { error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)("admin_review_rider_application", { p_id: id, p_status: status, p_note: note.trim().slice(0, 300) || null });
    if (error) return { ok: false, error: friendlyError(error) };
    revalidate("/admin/riders");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}
