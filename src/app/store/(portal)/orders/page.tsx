import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyStore, getStoreOrders, getStoreOrderTabCounts } from "@/lib/data/store";
import { STORE_ORDER_TABS, type StoreOrderTab } from "@/components/store/constants";
import { OrdersList } from "@/components/store/orders-list";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function StoreOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await searchParams;
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  const tab = (STORE_ORDER_TABS.some((t) => t.value === sp.tab) ? sp.tab : "new") as StoreOrderTab;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [list, counts] = await Promise.all([getStoreOrders(membership.store.id, { tab, page, pageSize: 20 }), getStoreOrderTabCounts(membership.store.id)]);
  return (
    <div>
      <PageHeader title="Orders" subtitle="Accept new orders quickly — customers see the countdown." className="px-0" />
      <OrdersList storeId={membership.store.id} tab={tab} orders={list.orders} total={list.total} page={list.page} pageSize={list.pageSize} counts={counts} />
    </div>
  );
}
