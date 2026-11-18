import type { Metadata } from "next";
import Link from "next/link";
import { Headset } from "lucide-react";
import { notFound } from "next/navigation";
import { getSessionUser, createClient } from "@/lib/supabase/server";
import { ExceptionCard, type ExceptionView } from "@/components/shop/exception-card";
import { getOrderTracking } from "@/lib/data/orders";
import { env, isPushConfigured } from "@/lib/env";
import { OrderTrackingView } from "@/components/shop/order-tracking-view";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
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
  return (
    <div className="pt-1">
      <ShopPageHeader title="Track order" back="/account/orders" barClassName="-mt-1"
        actions={<Link href={`/account/support?order=${id}`} aria-label="Get help with this order" className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600"><Headset className="h-5 w-5" aria-hidden /></Link>} />
      {exceptions.length ? <div className="mb-3.5 px-4 sm:px-0"><ExceptionCard exceptions={exceptions} orderId={id} /></div> : null}
      <OrderTrackingView initial={tracking} placed={sp.placed === "1"} paymentState={sp.payment} push={{ configured: isPushConfigured(), vapidPublicKey: env.vapidPublicKey }} />
      {sp.placed === "1" ? <TrackEvent name="purchase" onceKey={`md-purchase-${tracking.order.id}`} params={{ transaction_id: tracking.order.order_number, value: Number(tracking.order.total), items: tracking.items.map((i) => ({ item_id: i.product_id, item_name: i.product_name, price: Number(i.unit_price), quantity: i.quantity })) }} /> : null}
    </div>
  );
}
