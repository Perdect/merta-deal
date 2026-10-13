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
