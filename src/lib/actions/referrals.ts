"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";

/** Save a referral link to the signed-in customer's account before their first order. */
export async function trackReferralAction(code: string): Promise<ActionResult<{ accepted: boolean }>> {
  const normalized = code.trim().toUpperCase().slice(0, 32);
  if (!normalized) return { ok: false, error: "This referral link is not valid." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("track_referral" as never, { p_code: normalized } as never);
  if (error) return { ok: false, error: friendlyError(error) };
  const result = data as unknown as { accepted?: boolean; reason?: string };
  if (!result.accepted) return { ok: false, error: result.reason ?? "This referral could not be applied." };
  revalidatePath("/cart");
  revalidatePath("/account/rewards");
  return { ok: true, data: { accepted: true } };
}
