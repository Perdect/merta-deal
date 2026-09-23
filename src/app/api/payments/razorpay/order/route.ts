import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRazorpay } from "@/lib/payments/razorpay";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Creates a Razorpay order for an existing Merta Deal order (payment pending).
 * Requires: Razorpay keys AND the Supabase service role (needed later to confirm the payment).
 */
export async function POST(req: NextRequest) {
  const parsed = z.object({ orderId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "orderId required" }, { status: 400 });
  const rzp = getRazorpay();
  if (!rzp) return NextResponse.json({ error: "Online payments are not configured. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.", code: "RAZORPAY_NOT_CONFIGURED" }, { status: 503 });
  if (!createAdminClient()) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is required to confirm online payments.", code: "SERVICE_ROLE_MISSING" }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: order } = await supabase.from("orders").select("id, order_number, total, payment_status, payment_method, user_id").eq("id", parsed.data.orderId).maybeSingle();
  if (!order || order.user_id !== user.id) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status !== "pending") return NextResponse.json({ error: "Payment is not pending for this order" }, { status: 409 });

  const amountPaise = Math.round(Number(order.total) * 100);
  const rzpOrder = await rzp.orders.create({ amount: amountPaise, currency: "INR", receipt: order.order_number, notes: { merta_order_id: order.id, order_number: order.order_number } });
  const { error } = await supabase.rpc("attach_provider_order", { p_order_id: order.id, p_provider_order_id: rzpOrder.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profile } = await supabase.from("profiles").select("full_name, phone, email").eq("id", user.id).maybeSingle();
  return NextResponse.json({ keyId: serverEnv().razorpayKeyId, razorpayOrderId: rzpOrder.id, amount: amountPaise, currency: "INR", orderNumber: order.order_number, prefill: { name: profile?.full_name ?? "", contact: profile?.phone ?? "", email: profile?.email ?? user.email ?? "" } });
}
