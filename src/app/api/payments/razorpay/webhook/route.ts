import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

type RzpEvent = { event: string; payload: { payment?: { entity: { id: string; order_id: string; status: string; error_description?: string; notes?: Record<string, string> } }; refund?: { entity: { id: string; payment_id: string; amount: number; notes?: Record<string, string> } } } };

/**
 * Razorpay webhook (payment.captured, payment.failed, refund.processed).
 * Configure the URL https://<site>/api/payments/razorpay/webhook in the Razorpay dashboard with RAZORPAY_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, sig)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 503 });
  const evt = JSON.parse(raw) as RzpEvent;

  const findOrderId = async (providerOrderId?: string, notes?: Record<string, string>) => {
    if (notes?.merta_order_id) return notes.merta_order_id;
    if (!providerOrderId) return null;
    const { data } = await admin.from("payments").select("order_id").eq("provider_order_id", providerOrderId).maybeSingle();
    return data?.order_id ?? null;
  };

  if (evt.event === "payment.captured" && evt.payload.payment) {
    const p = evt.payload.payment.entity;
    const orderId = await findOrderId(p.order_id, p.notes);
    if (orderId) await admin.rpc("confirm_online_payment", { p_order_id: orderId, p_provider_order_id: p.order_id, p_provider_payment_id: p.id, p_signature: sig, p_raw: evt as never });
  } else if (evt.event === "payment.failed" && evt.payload.payment) {
    const p = evt.payload.payment.entity;
    const orderId = await findOrderId(p.order_id, p.notes);
    if (orderId) await admin.rpc("mark_payment_failed", { p_order_id: orderId, p_reason: p.error_description ?? "Payment failed" });
  } else if (evt.event === "refund.processed" && evt.payload.refund) {
    const r = evt.payload.refund.entity;
    const { data } = await admin.from("payments").select("order_id").eq("provider_payment_id", r.payment_id).maybeSingle();
    if (data) await admin.rpc("mark_refund_processed", { p_order_id: data.order_id, p_refund_id: r.id, p_amount: r.amount / 100, p_raw: evt as never });
  }
  return NextResponse.json({ received: true });
}
