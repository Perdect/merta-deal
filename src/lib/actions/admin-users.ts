"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";
import type { Enums, Json } from "@/types/database";

const ROLES = ["customer", "rider", "admin", "super_admin"] as const;
const uuid = z.string().uuid("Invalid user");
const phone = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number").optional().or(z.literal(""));
const fail = (e: unknown): ActionResult<never> => ({ ok: false, error: friendlyError(e) });

/** Every action re-checks the caller on the server: admin for edits, super admin for anything touching admin roles. */
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("SESSION_EXPIRED");
  const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([supabase.rpc("is_admin"), supabase.rpc("is_super_admin")]);
  if (!isAdmin) throw new Error("FORBIDDEN");
  return { supabase, userId: user.id, isSuper: Boolean(isSuper) };
}

async function audit(action: string, entityId: string, after: Record<string, unknown>) {
  const supabase = await createClient();
  await supabase.rpc("admin_audit", { p_action: action, p_entity: "profiles", p_entity_id: entityId, p_after: after as unknown as Json });
}

export type NewUserInput = { email: string; password: string; fullName: string; phone?: string; role: Enums<"user_role"> };

/**
 * Creates a sign-in (email + password, confirmed) and its profile, then sets the role. Needs the
 * service role key on the server; admin roles need a super admin. The password is never stored or
 * logged here beyond the call that creates the account.
 */
export async function createUserAction(input: NewUserInput): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    password: z.string().min(8, "Use at least 8 characters").max(72),
    fullName: z.string().trim().min(2, "Enter the person's name").max(80),
    phone, role: z.enum(ROLES),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const { supabase, isSuper } = await requireAdmin();
    if ((parsed.data.role === "admin" || parsed.data.role === "super_admin") && !isSuper) return { ok: false, error: "Only a super admin can create admin accounts." };
    const admin = createAdminClient();
    if (!admin) return { ok: false, error: "Creating accounts needs SUPABASE_SERVICE_ROLE_KEY on the server." };
    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.data.email, password: parsed.data.password, email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName, phone: parsed.data.phone || null, role: parsed.data.role === "rider" ? "rider" : "customer" },
    });
    if (error) return { ok: false, error: /already/i.test(error.message) ? "An account with this email already exists." : error.message };
    const id = data.user.id;
    // The auth trigger made the profile; name/phone from metadata, role through the audited RPC.
    await admin.from("profiles").update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null, is_active: true }).eq("id", id);
    if (parsed.data.role !== "customer") {
      const { error: roleErr } = await supabase.rpc("admin_set_user_role", { p_user_id: id, p_role: parsed.data.role });
      if (roleErr) return { ok: false, error: `Account created, but the role was not set: ${friendlyError(roleErr)}` };
    }
    await audit("user.create", id, { email: parsed.data.email, role: parsed.data.role });
    revalidatePath("/admin/users");
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export type EditUserInput = { fullName: string; phone?: string; role: Enums<"user_role">; isActive: boolean };

/** Name, phone, role and active flag in one save. Role changes go through admin_set_user_role (audited, super-admin gated). */
export async function updateUserAction(userId: string, input: EditUserInput): Promise<ActionResult> {
  const parsed = z.object({ fullName: z.string().trim().min(1, "Enter a name").max(80), phone, role: z.enum(ROLES), isActive: z.boolean() }).safeParse(input);
  if (!parsed.success || !uuid.safeParse(userId).success) return { ok: false, error: parsed.success ? "Invalid user" : parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const { supabase, userId: me, isSuper } = await requireAdmin();
    const { data: before, error: readErr } = await supabase.from("profiles").select("full_name, phone, role, is_active").eq("id", userId).maybeSingle();
    if (readErr || !before) return { ok: false, error: "User not found." };
    if (userId === me && (!parsed.data.isActive || parsed.data.role !== before.role)) return { ok: false, error: "You cannot deactivate yourself or change your own role." };
    if ((before.role === "super_admin" || before.role === "admin") && !isSuper) return { ok: false, error: "Only a super admin can change an admin account." };
    const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null, is_active: parsed.data.isActive }).eq("id", userId);
    if (error) return fail(error);
    if (parsed.data.role !== before.role) {
      const { error: roleErr } = await supabase.rpc("admin_set_user_role", { p_user_id: userId, p_role: parsed.data.role });
      if (roleErr) return fail(roleErr);
    }
    await audit("user.update", userId, { before, after: { full_name: parsed.data.fullName, phone: parsed.data.phone || null, role: parsed.data.role, is_active: parsed.data.isActive } });
    revalidatePath("/admin/users"); revalidatePath(`/admin/users/${userId}`);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/**
 * Permanently removes an account. Refused when the person has orders (those records must stay for
 * accounting; deactivate instead), for yourself, and for admin accounts unless you are a super admin.
 */
export async function deleteUserAction(userId: string): Promise<ActionResult> {
  if (!uuid.safeParse(userId).success) return { ok: false, error: "Invalid user" };
  try {
    const { supabase, userId: me, isSuper } = await requireAdmin();
    if (userId === me) return { ok: false, error: "You cannot delete your own account." };
    const { data: p } = await supabase.from("profiles").select("role, email, full_name").eq("id", userId).maybeSingle();
    if (!p) return { ok: false, error: "User not found." };
    if ((p.role === "admin" || p.role === "super_admin") && !isSuper) return { ok: false, error: "Only a super admin can delete an admin account." };
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) > 0) return { ok: false, error: `This account has ${count} ${count === 1 ? "order" : "orders"}. Deactivate it instead so the order history stays.` };
    const admin = createAdminClient();
    if (!admin) return { ok: false, error: "Deleting accounts needs SUPABASE_SERVICE_ROLE_KEY on the server." };
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return { ok: false, error: error.message };
    await audit("user.delete", userId, { email: p.email, name: p.full_name, role: p.role });
    revalidatePath("/admin/users");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
