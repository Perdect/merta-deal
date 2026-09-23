import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Order, OrderTracking } from "@/types/app";

export type OrderListItem = Order & { store: { name: string; slug: string; logo_url: string | null } | null; items: { product_name: string; quantity: number; image_url: string | null }[] };

export const getMyOrders = cache(async (opts: { status?: "active" | "past" | "all"; limit?: number; page?: number } = {}): Promise<{ orders: OrderListItem[]; total: number }> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { orders: [], total: 0 };
  const limit = opts.limit ?? 20; const page = opts.page ?? 1;
  let q = supabase.from("orders").select("*, store:stores(name, slug, logo_url), items:order_items(product_name, quantity, image_url)", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (opts.status === "active") q = q.in("status", ["placed", "store_confirmed", "preparing", "ready_for_pickup", "rider_assigned", "out_for_delivery"]);
  if (opts.status === "past") q = q.in("status", ["delivered", "completed", "cancelled", "rejected"]);
  const { data, count } = await q;
  return { orders: (data ?? []) as unknown as OrderListItem[], total: count ?? 0 };
});

export const getOrderTracking = cache(async (orderId: string): Promise<OrderTracking | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_tracking", { p_order_id: orderId });
  if (error || !data) return null;
  return data as unknown as OrderTracking;
});
