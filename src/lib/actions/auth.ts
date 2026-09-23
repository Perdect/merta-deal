"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

const ROLE_HOME: Record<string, string> = { store_owner: "/store", store_staff: "/store", rider: "/rider", admin: "/admin", super_admin: "/admin", customer: "/" };

/** Indian mobile numbers are stored in E.164 without the plus sign, e.g. 919876543210. */
const toE164 = (mobile: string) => `+91${mobile.replace(/\D/g, "").slice(-10)}`;
const mobileSchema = z.string().transform((v) => v.replace(/\D/g, "").slice(-10)).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"));

const signInSchema = z.object({ mobile: mobileSchema, password: z.string().min(6, "Password must be at least 6 characters"), next: z.string().optional() });
const signUpSchema = z.object({
  fullName: z.string().min(2, "Enter your name"),
  mobile: mobileSchema,
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["customer", "store_owner", "rider"]).default("customer"),
  next: z.string().optional(),
});

export type AuthResult = { ok: false; error: string; fieldErrors?: Record<string, string> } | { ok: true; message?: string; redirectTo?: string };

export async function signInAction(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Please check the form", fieldErrors: flatten(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ phone: toE164(parsed.data.mobile), password: parsed.data.password });
  if (error) {
    if (/phone.*(disabled|not enabled)|Unsupported phone provider/i.test(error.message)) return { ok: false, error: "Mobile sign-in is not enabled on the server yet. In Supabase → Authentication → Providers, turn on Phone (SMS provider optional when phone confirmations are off)." };
    return { ok: false, error: error.message === "Invalid login credentials" ? "Incorrect mobile number or password." : error.message };
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  const role = profile?.role ?? "customer";
  const next = parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : ROLE_HOME[role] ?? "/";
  redirect(next);
}

export async function signUpAction(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Please check the form", fieldErrors: flatten(parsed.error) };
  const supabase = await createClient();
  const { fullName, mobile, password, role } = parsed.data;
  const { data, error } = await supabase.auth.signUp({
    phone: toE164(mobile), password,
    options: { data: { full_name: fullName, phone: mobile, role }, channel: "sms" },
  });
  if (error) {
    if (/already registered|already exists/i.test(error.message)) return { ok: false, error: "This mobile number already has an account. Please sign in.", fieldErrors: { mobile: "Already registered" } };
    if (/phone.*(disabled|not enabled)|Unsupported phone provider/i.test(error.message)) return { ok: false, error: "Mobile sign-up is not enabled on the server yet (Supabase → Authentication → Providers → Phone)." };
    return { ok: false, error: error.message };
  }
  if (data.session) redirect(parsed.data.next?.startsWith("/") ? parsed.data.next : ROLE_HOME[role] ?? "/");
  // Phone confirmations are enabled on the project: an SMS OTP must be verified before the first sign-in.
  return { ok: true, message: `We sent a verification code to +91 ${mobile}. Enter it below to activate your account.`, redirectTo: `verify:${mobile}` };
}

/** Completes sign-up when the Supabase project has phone confirmations turned on. */
export async function verifySignupOtpAction(mobile: string, token: string): Promise<AuthResult> {
  const m = mobileSchema.safeParse(mobile);
  if (!m.success) return { ok: false, error: "Enter a valid mobile number" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone: toE164(m.data), token: token.replace(/\D/g, ""), type: "sms" });
  if (error) return { ok: false, error: error.message };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user!.id).maybeSingle();
  return { ok: true, redirectTo: ROLE_HOME[profile?.role ?? "customer"] ?? "/" };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** OTP login (passwordless) — only when an SMS provider is configured on the project. */
export async function sendPhoneOtpAction(phone: string): Promise<AuthResult> {
  if (!env.phoneAuthEnabled) return { ok: false, error: "OTP login needs an SMS provider (MSG91/Twilio) in Supabase Auth. Use your mobile number and password instead." };
  const m = mobileSchema.safeParse(phone);
  if (!m.success) return { ok: false, error: "Enter a valid 10-digit mobile number" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone: toE164(m.data) });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "OTP sent" };
}

export async function verifyPhoneOtpAction(phone: string, token: string): Promise<AuthResult> {
  const m = mobileSchema.safeParse(phone);
  if (!m.success) return { ok: false, error: "Enter a valid mobile number" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone: toE164(m.data), token: token.replace(/\D/g, ""), type: "sms" });
  if (error) return { ok: false, error: error.message };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user!.id).maybeSingle();
  return { ok: true, redirectTo: ROLE_HOME[profile?.role ?? "customer"] ?? "/" };
}

/** Password reset for phone accounts = OTP to the mobile, then set a new password (needs an SMS provider). */
export async function resetPasswordAction(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const m = mobileSchema.safeParse(String(formData.get("mobile") ?? ""));
  if (!m.success) return { ok: false, error: "Enter a valid 10-digit mobile number" };
  if (!env.phoneAuthEnabled) return { ok: false, error: "Password reset by SMS is not enabled yet. Please contact support to reset your password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone: toE164(m.data), options: { shouldCreateUser: false } });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "We sent a code to your mobile. Enter it to sign in, then set a new password in Settings.", redirectTo: `verify:${m.data}` };
}

function flatten(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of err.issues) { const k = String(issue.path[0] ?? "form"); if (!out[k]) out[k] = issue.message; }
  return out;
}
