import type { Metadata } from "next";
import { getMyOrders } from "@/lib/data/orders";
import { AccountSection } from "@/components/account/account-section";
import { OrdersList } from "@/components/account/orders-list";

export const metadata: Metadata = { title: "My account", robots: { index: false } };
export const dynamic = "force-dynamic";

/** On a phone this route is the account menu (rendered by the shell); on desktop it opens on Orders. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "all" } = await searchParams;
  const { orders } = await getMyOrders({ status: tab === "active" ? "active" : tab === "past" ? "past" : "all", limit: 30 });
  return <AccountSection title="Orders" back="/"><OrdersList orders={orders} tab={tab} base="/account" /></AccountSection>;
}
