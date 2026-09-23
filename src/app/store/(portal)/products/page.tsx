import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyStore, getStoreInventory, getCategoryGroups } from "@/lib/data/store";
import { ProductList } from "@/components/store/product-list";
import { PageHeader } from "@/components/ui/misc";
import type { Enums } from "@/types/database";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

const STATUSES: Enums<"inventory_status">[] = ["in_stock", "low_stock", "out_of_stock"];

export default async function StoreProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string }> }) {
  const sp = await searchParams;
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  const status = STATUSES.includes(sp.status as Enums<"inventory_status">) ? (sp.status as Enums<"inventory_status">) : "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [list, categories] = await Promise.all([
    getStoreInventory(membership.store.id, { q: sp.q ?? "", status, categoryId: sp.category || undefined, page, pageSize: 24 }),
    getCategoryGroups(),
  ]);
  return (
    <div>
      <PageHeader title="Products" subtitle={`${list.total} listing${list.total === 1 ? "" : "s"}`} className="px-0" />
      <ProductList items={list.items} total={list.total} page={list.page} pageSize={list.pageSize} filter={{ q: sp.q ?? "", status, categoryId: sp.category ?? "" }} categories={categories} />
    </div>
  );
}
