import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getOrderTracking } from "@/lib/data/orders";
import { OrderTrackingView } from "@/components/shop/order-tracking-view";
import { PageHeader } from "@/components/ui/misc";

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
      <PageHeader title="Track order" back="/orders" />
      <OrderTrackingView initial={tracking} placed={sp.placed === "1"} paymentState={sp.payment} />
    </div>
  );
}
