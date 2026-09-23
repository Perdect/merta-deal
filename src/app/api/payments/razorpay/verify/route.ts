import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPaymentSignature } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

/** Verifies the checkout signature and marks the order as paid (service role). */
export async function POST(req: NextRequest) {
  const schema = z.object({ orderId: z.string().uuid(), razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: payment } = await supabase.from("payments").select("order_id, provider_order_id, status, user_id").eq("order_id", parsed.data.orderId).maybeSingle();
  if (!payment || payment.user_id !== user.id) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (payment.provider_order_id !== parsed.data.razorpay_order_id) return NextResponse.json({ error: "Order mismatch" }, { status: 409 });
  if (!verifyPaymentSignature(parsed.data.razorpay_order_id, parsed.data.razorpay_payment_id, parsed.data.razorpay_signature)) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 503 });
  if (payment.status === "paid") return NextResponse.json({ ok: true });
  const { error } = await admin.rpc("confirm_online_payment", { p_order_id: parsed.data.orderId, p_provider_order_id: parsed.data.razorpay_order_id, p_provider_payment_id: parsed.data.razorpay_payment_id, p_signature: parsed.data.razorpay_signature });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
