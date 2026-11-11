"use server";
import { friendlyError } from "@/lib/utils";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * Guest checkout: creates an anonymous Supabase session (no registration). Requires
 * "Allow anonymous sign-ins" in Supabase Auth + NEXT_PUBLIC_ANONYMOUS_AUTH_ENABLED=true.
 * The profile row is created by the auth trigger; name/phone are captured at checkout.
 */
export async function continueAsGuestAction(next?: string): Promise<{ ok: false; error: string } | never> {
  if (!env.anonymousAuthEnabled) return { ok: false, error: "Guest checkout is not enabled on this deployment yet." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInAnonymously({ options: { data: { full_name: "Guest", role: "customer" } } });
  if (error) return { ok: false, error: friendlyError(error) };
  redirect(safeNext(next, "/"));
}

/**
 * No-OTP checkout: a guest keeps their session and the order goes out under the name and mobile number
 * given with the delivery address. Saved on the guest's own profile row so the order, the admin's
 * customer list and the rider all show a real name and number instead of "Guest".
 */
export async function saveGuestContactAction(input: { full_name: string; phone: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const phone = String(input.phone ?? "").replace(/\D/g, "").slice(-10);
  const name = String(input.full_name ?? "").trim().slice(0, 120);
  if (!/^[6-9]\d{9}$/.test(phone)) return { ok: false, error: "Enter a valid 10-digit mobile number." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please add your delivery address first." };
  if (!user.is_anonymous) return { ok: true }; // a signed-in account keeps its own details
  const { error } = await supabase.from("profiles").update({ phone, ...(name ? { full_name: name } : {}) }).eq("id", user.id);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

/** Silently starts a guest session (no redirect) so "ADD" works straight from a scanned QR. */
export async function ensureGuestSessionAction(): Promise<{ ok: true; created: boolean } | { ok: false; error: string; needsLogin: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { ok: true, created: false };
  if (!env.anonymousAuthEnabled) return { ok: false, error: "Please sign in to add items.", needsLogin: true };
  const { error } = await supabase.auth.signInAnonymously({ options: { data: { full_name: "Guest", role: "customer" } } });
  if (error) return { ok: false, error: friendlyError(error), needsLogin: true };
  return { ok: true, created: true };
}
