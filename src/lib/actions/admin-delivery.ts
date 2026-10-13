"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";

/* Admin-only delivery and rider-payout actions. Every check (admin role, rider cannot confirm their
   own delivery, cash confirmation, no double payout) and the audit log live in the SQL functions
   (0021_otp_handover_rider_payouts.sql); these wrappers only validate input and refresh pages. */

export type RiderBalance = { rider_id: string; name: string; phone: string | null; payable: number; processing: number; paid: number; failed: number; cash_collected: number; cash_remitted: number; cash_due: number };

/** Support path when the customer cannot reach their OTP; requires a reason, audited. */
export async function adminConfirmDeliveryAction(orderId: string, reason: string, cashCollected: boolean): Promise<ActionResult<{ already: boolean }>> {
  if (reason.trim().length < 10) return { ok: false, error: "Describe how you confirmed the handover with the customer (at least 10 characters)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_confirm_delivery" as never, { p_order_id: orderId, p_reason: reason.trim(), p_cash_collected: cashCollected } as never);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/admin/orders/${orderId}`); revalidatePath("/admin/orders");
  return { ok: true, data: { already: Boolean((data as { already?: boolean } | null)?.already) } };
}

export async function createRiderPayoutAction(riderId: string, note?: string): Promise<ActionResult<{ payout_id: string; amount: number; earnings: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_rider_payout" as never, { p_rider_id: riderId, p_note: note?.trim() || null } as never);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/payouts");
  const d = data as { payout_id: string; amount: number; earnings: number };
  return { ok: true, data: { payout_id: d.payout_id, amount: Number(d.amount), earnings: Number(d.earnings) } };
}

/** Paid needs the UPI/bank reference; failed returns the earnings to the payable balance. */
export async function settleRiderPayoutAction(payoutId: string, outcome: "paid" | "failed", reference?: string, reason?: string): Promise<ActionResult<{ status: string; already: boolean }>> {
  if (outcome === "paid" && (reference ?? "").trim().length < 4) return { ok: false, error: "Enter the UPI/bank transaction reference." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_settle_rider_payout" as never, { p_payout_id: payoutId, p_outcome: outcome, p_reference: reference?.trim() || null, p_reason: reason?.trim() || null } as never);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/payouts");
  const d = data as { status: string; already?: boolean };
  return { ok: true, data: { status: d.status, already: Boolean(d.already) } };
}

/** Cash a rider collected on COD orders, handed over to Merta Deal (cannot exceed what they hold). */
export async function recordCashRemittanceAction(riderId: string, amount: number, reference?: string, note?: string): Promise<ActionResult<{ due: number }>> {
  if (!/^[0-9a-f-]{36}$/.test(riderId)) return { ok: false, error: "Invalid rider" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter the amount received." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_record_cash_remittance" as never, { p_rider_id: riderId, p_amount: Math.round(amount * 100) / 100, p_reference: reference?.trim() || null, p_note: note?.trim() || null } as never);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/payouts/riders");
  return { ok: true, data: { due: Number((data as { due: number }).due) } };
}
