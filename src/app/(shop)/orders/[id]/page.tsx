import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser, createClient } from "@/lib/supabase/server";
import { ExceptionCard, type ExceptionView } from "@/components/shop/exception-card";
import { getOrderTracking } from "@/lib/data/orders";
import { env, isPushConfigured } from "@/lib/env";
import { OrderTrackingView } from "@/components/shop/order-tracking-view";
import { TrackEvent } from "@/components/shared/track-event";
import { getPublicSettings } from "@/lib/data/catalog";
import { etaText } from "@/lib/eta";
import { PleaseLogin } from "@/components/auth/please-login";

export const metadata: Metadata = { title: "Track order", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; payment?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) {
    const settings = await getPublicSettings();
    return <PleaseLogin description="Please login to see this order." eta={etaText(Number(settings.delivery_eta_min_minutes), Number(settings.delivery_eta_max_minutes)) ?? "minutes"} loginTitle="Login to track your order" />;
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const tracking = await getOrderTracking(id);
  if (!tracking) notFound();
  const { data: exRows } = await (await createClient()).from("order_exceptions").select("*, item:order_items(product_name, pack_label, unit_price)").eq("order_id", id).eq("status", "pending");
  const exceptions: ExceptionView[] = (exRows ?? []).map((r) => { const it = (r as unknown as { item: { product_name: string; pack_label: string | null; unit_price: number } | null }).item; return { ...(r as unknown as ExceptionView), product_name: it?.product_name ?? "Item", pack_label: it?.pack_label ?? null, unit_price: Number(it?.unit_price ?? 0) }; });
  // The screen brings its own header (Back, status, arrival) in place of the shop's page bar, and an
  // item the customer has to answer about goes straight under it.
  return (
    <div className="lg:pt-4">
      <OrderTrackingView initial={tracking} placed={sp.placed === "1"} paymentState={sp.payment} push={{ configured: isPushConfigured(), vapidPublicKey: env.vapidPublicKey }}
        attention={exceptions.length ? <ExceptionCard exceptions={exceptions} orderId={id} /> : null} />
      {sp.placed === "1" ? <TrackEvent name="purchase" onceKey={`md-purchase-${tracking.order.id}`} params={{ transaction_id: tracking.order.order_number, value: Number(tracking.order.total), items: tracking.items.map((i) => ({ item_id: i.product_id, item_name: i.product_name, price: Number(i.unit_price), quantity: i.quantity })) }} /> : null}
    </div>
  );
}
