import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Order, OrderTracking } from "@/types/app";

export type OrderListItem = Order & { items: { product_name: string; quantity: number; image_url: string | null }[] };

export const getMyOrders = cache(async (opts: { status?: "active" | "past" | "all"; limit?: number; page?: number } = {}): Promise<{ orders: OrderListItem[]; total: number }> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { orders: [], total: 0 };
  const limit = opts.limit ?? 20; const page = opts.page ?? 1;
  let q = supabase.from("orders").select("*, items:order_items(product_name, quantity, image_url)", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (opts.status === "active") q = q.in("status", ["placed", "confirmed", "preparing", "ready_for_pickup", "rider_assigned", "out_for_delivery"]);
  if (opts.status === "past") q = q.in("status", ["delivered", "completed", "cancelled", "rejected"]);
  const { data, count } = await q;
  return { orders: (data ?? []) as unknown as OrderListItem[], total: count ?? 0 };
});

export const getOrderTracking = cache(async (orderId: string): Promise<OrderTracking | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_tracking", { p_order_id: orderId });
  if (error || !data) return null;
  const t = data as unknown as OrderTracking;
  if (t.payment?.provider === "upi" && t.payment.status === "pending") {
    // What the customer said about a direct UPI payment lives on the payment row (RLS: own order or staff).
    const { data: p } = await supabase.from("payments").select("provider_payment_id, raw_response").eq("order_id", orderId).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const raw = (p?.raw_response ?? {}) as Record<string, unknown>;
    t.upi_claim = p ? { reference: p.provider_payment_id, claimed_at: typeof raw.claimed_at === "string" ? raw.claimed_at : null, checked_at: typeof raw.checked_at === "string" ? raw.checked_at : null } : null;
  }
  return t;
});
