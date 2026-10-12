import type { Metadata } from "next";
import { getMyOrders } from "@/lib/data/orders";
import { AccountSection } from "@/components/account/account-section";
import { OrdersList } from "@/components/account/orders-list";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "all" } = await searchParams;
  const { orders } = await getMyOrders({ status: tab === "active" ? "active" : tab === "past" ? "past" : "all", limit: 30 });
  return <AccountSection title="Orders"><OrdersList orders={orders} tab={tab} /></AccountSection>;
}
