"use server";
import { friendlyError } from "@/lib/utils";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";

const ROLE_HOME: Record<string, string> = { rider: "/rider", admin: "/admin", super_admin: "/admin", customer: "/" };

/** Indian mobile numbers are stored in E.164 without the plus sign, e.g. 919876543210. */
const toE164 = (mobile: string) => `+91${mobile.replace(/\D/g, "").slice(-10)}`;
const mobileSchema = z.string().transform((v) => v.replace(/\D/g, "").slice(-10)).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"));
/**
 * A guest (anonymous session) who signs in keeps their cart and addresses: the client sends the
 * guest session's id along and merge_guest_cart hands those rows to the account (ignored for non-guest ids).
 */
async function mergeGuest(supabase: Awaited<ReturnType<typeof createClient>>, guestId: string | undefined, userId: string) {
  if (!guestId || !/^[0-9a-f-]{36}$/i.test(guestId) || guestId === userId) return;
  const { error } = await supabase.rpc("merge_guest_cart", { p_guest_user_id: guestId });
  if (error) console.error("merge_guest_cart", error.message);
}

export type AuthResult = { ok: false; error: string; fieldErrors?: Record<string, string> } | { ok: true; message?: string; redirectTo?: string };

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/* ------------------------------------------------------------------------------------------------
 * Staff portals (admin, delivery partner): email + password accounts created by an admin (mobile + PIN is
 * still accepted for older accounts), but the portal is only entered
 * after the server confirms the account holds that role. A valid password without the role is signed straight
 * back out, so a customer session can never ride into a staff portal and no half-signed-in state remains.
 * ---------------------------------------------------------------------------------------------- */
export type StaffPortal = "admin" | "rider";
/** Older staff accounts sign in with mobile + a 6-digit PIN, stored as the Supabase password. */
const pinSchema = z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(/^\d{6}$/, "Enter your 6-digit PIN"));
const staffSignInSchema = z.object({ mobile: mobileSchema, password: pinSchema, next: z.string().optional(), portal: z.enum(["admin", "rider"]) });
/** Email + password accounts (no PIN rule: these are ordinary passwords, or the 6-digit one an admin reset gives). */
const staffEmailSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address"), password: z.string().min(6, "Enter your password").max(72), next: z.string().optional(), portal: z.enum(["admin", "rider"]) });

export async function staffSignInAction(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const raw = Object.fromEntries(formData);
  const byEmail = typeof raw.email === "string";
  const parsed = byEmail ? staffEmailSchema.safeParse(raw) : staffSignInSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check the form", fieldErrors: flatten(parsed.error) };
  const { portal } = parsed.data;
  const supabase = await createClient();
  const { data, error } = "email" in parsed.data
    ? await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password })
    : await supabase.auth.signInWithPassword({ phone: toE164(parsed.data.mobile), password: parsed.data.password });
  if (error) {
    if (/phone.*(disabled|not enabled)|Unsupported phone provider/i.test(error.message)) return { ok: false, error: "Mobile sign-in is not enabled on the server yet." };
    if (byEmail && /invalid login credentials/i.test(error.message)) return { ok: false, error: "Wrong email or password. Check them and try again." };
    return { ok: false, error: friendlyError(error) };
  }
  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", data.user.id).maybeSingle();
  let allowed = Boolean(profile?.is_active);
  if (portal === "admin") allowed &&= profile?.role === "admin" || profile?.role === "super_admin";
  else {
    const { data: rider } = await supabase.from("delivery_partners").select("id").eq("user_id", data.user.id).maybeSingle();
    allowed &&= Boolean(rider);
  }
  if (!allowed) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: !profile?.is_active
        ? "This account is deactivated. Contact Merta Deal support."
        : portal === "admin"
          ? "This account doesn't have admin access. Shoppers sign in from the Merta Deal website."
          : "This account isn't registered as a Merta Deal delivery partner. Use the email Merta Deal gave you, or apply from the \"Deliver with Merta Deal\" page first.",
    };
  }
  redirect(safeNext(parsed.data.next, `/${portal}`, `/${portal}`));
}

/** Sign out of a staff portal and land on that portal's login page. */
export async function staffSignOutAction(formData: FormData) {
  const portal: StaffPortal = formData.get("portal") === "rider" ? "rider" : "admin";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${portal}/login?signed_out=1`);
}

/**
 * Customer sign-in: the mobile number and a one-time code are the whole of it. A number seen for the first
 * time gets its account when the code is checked, so there is no sign-up, no PIN and no reset for customers.
 */
export async function sendPhoneOtpAction(phone: string): Promise<AuthResult> {
  if (!env.phoneAuthEnabled) return { ok: false, error: "Sign-in by OTP is not switched on for this site yet." };
  const m = mobileSchema.safeParse(phone);
  if (!m.success) return { ok: false, error: "Enter a valid 10-digit mobile number" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone: toE164(m.data) });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, message: "OTP sent" };
}

export async function verifyPhoneOtpAction(phone: string, token: string, guestUserId?: string): Promise<AuthResult> {
  const m = mobileSchema.safeParse(phone);
  if (!m.success) return { ok: false, error: "Enter a valid mobile number" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone: toE164(m.data), token: token.replace(/\D/g, ""), type: "sms" });
  if (error) return { ok: false, error: friendlyError(error) };
  await mergeGuest(supabase, guestUserId, data.user!.id);
  const { data: profile } = await supabase.from("profiles").select("role, full_name, is_guest").eq("id", data.user!.id).maybeSingle();
  // A number signing in by OTP for the first time gets its account here; the profile trigger named it "Guest"
  // (no name was given), so clear that and the account page asks for the name instead.
  if (profile && !profile.is_guest && profile.full_name === "Guest") await supabase.from("profiles").update({ full_name: null }).eq("id", data.user!.id);
  return { ok: true, redirectTo: ROLE_HOME[profile?.role ?? "customer"] ?? "/" };
}

/**
 * Email password reset for staff accounts (admin, delivery partner). Supabase emails a one-time link to
 * /auth/callback, which signs the person in and sends them to Settings to choose a new password. The reply
 * is the same whether or not the address exists, so the form cannot be used to probe for accounts.
 */
export async function requestEmailResetAction(email: string): Promise<AuthResult> {
  const e = z.string().trim().toLowerCase().email().safeParse(email);
  if (!e.success) return { ok: false, error: "Enter the email you sign in with." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(e.data, { redirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent("/account/settings?reset=1")}` });
  if (error && /rate limit|too many/i.test(error.message)) return { ok: false, error: "Too many reset emails just now. Wait a few minutes and try again." };
  if (error) console.warn("requestEmailResetAction:", error.message);
  return { ok: true, message: `If ${e.data} has a Merta Deal sign-in, a reset link is on its way. Open it on this device, then choose a new password.` };
}

function flatten(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of err.issues) { const k = String(issue.path[0] ?? "form"); if (!out[k]) out[k] = issue.message; }
  return out;
}
