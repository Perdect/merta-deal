import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRazorpay } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

/** Admin-only: issue a Razorpay refund for a paid order and record it. */
export async function POST(req: NextRequest) {
  const parsed = z.object({ orderId: z.string().uuid(), amount: z.number().positive().optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rzp = getRazorpay(); const admin = createAdminClient();
  if (!rzp || !admin) return NextResponse.json({ error: "Razorpay keys and SUPABASE_SERVICE_ROLE_KEY are required for refunds." }, { status: 503 });
  const { data: payment } = await admin.from("payments").select("provider_payment_id, amount, refund_amount").eq("order_id", parsed.data.orderId).maybeSingle();
  if (!payment?.provider_payment_id) return NextResponse.json({ error: "No captured online payment for this order" }, { status: 409 });
  const amount = parsed.data.amount ?? Number(payment.amount) - Number(payment.refund_amount);
  const refund = await rzp.payments.refund(payment.provider_payment_id, { amount: Math.round(amount * 100), notes: { merta_order_id: parsed.data.orderId } });
  await admin.rpc("mark_refund_processed", { p_order_id: parsed.data.orderId, p_refund_id: refund.id, p_amount: amount, p_raw: refund as never });
  return NextResponse.json({ ok: true, refundId: refund.id, amount });
}
