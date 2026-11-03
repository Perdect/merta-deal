import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getOrderTracking } from "@/lib/data/orders";
import { env, isPushConfigured } from "@/lib/env";
import { OrderTrackingView } from "@/components/shop/order-tracking-view";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
import { TrackEvent } from "@/components/shared/track-event";

export const metadata: Metadata = { title: "Track order", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; payment?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/orders/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const tracking = await getOrderTracking(id);
  if (!tracking) notFound();
  return (
    <div className="pt-1">
      <ShopPageHeader title="Track order" back="/account/orders" />
      <OrderTrackingView initial={tracking} placed={sp.placed === "1"} paymentState={sp.payment} push={{ configured: isPushConfigured(), vapidPublicKey: env.vapidPublicKey }} />
      {sp.placed === "1" ? <TrackEvent name="purchase" onceKey={`md-purchase-${tracking.order.id}`} params={{ transaction_id: tracking.order.order_number, value: Number(tracking.order.total), items: tracking.items.map((i) => ({ item_id: i.product_id, item_name: i.product_name, price: Number(i.unit_price), quantity: i.quantity })) }} /> : null}
    </div>
  );
}
