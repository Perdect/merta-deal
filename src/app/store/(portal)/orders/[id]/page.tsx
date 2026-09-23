import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getMyStore, getStoreOrderTracking } from "@/lib/data/store";
import { StoreOrderDetail } from "@/components/store/order-detail";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

export default async function StoreOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const tracking = await getStoreOrderTracking(membership.store.id, id);
  if (!tracking) notFound();
  return (
    <div>
      <PageHeader title={`Order ${tracking.order.order_number}`} back="/store/orders" className="px-0" />
      <StoreOrderDetail initial={tracking} />
    </div>
  );
}
