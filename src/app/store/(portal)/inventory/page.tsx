import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyStore, getStoreInventory, getLowStockItems, getRecentMovements } from "@/lib/data/store";
import { InventoryConsole } from "@/components/store/inventory-console";
import { PageHeader } from "@/components/ui/misc";
import type { Enums } from "@/types/database";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

const STATUSES: Enums<"inventory_status">[] = ["in_stock", "low_stock", "out_of_stock"];

export default async function StoreInventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  const id = membership.store.id;
  const status = STATUSES.includes(sp.status as Enums<"inventory_status">) ? (sp.status as Enums<"inventory_status">) : "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [list, alerts, movements] = await Promise.all([
    getStoreInventory(id, { q: sp.q ?? "", status, page, pageSize: 30 }),
    getLowStockItems(id, 40),
    getRecentMovements(id, 25),
  ]);
  return (
    <div>
      <PageHeader title="Inventory" subtitle="Tap +/− to change stock; tap a price to edit it." className="px-0" />
      <InventoryConsole storeId={id} items={list.items} total={list.total} page={list.page} pageSize={list.pageSize} filter={{ q: sp.q ?? "", status }} alerts={alerts} movements={movements} />
    </div>
  );
}
