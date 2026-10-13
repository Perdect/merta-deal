import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyStore, getStoreInventory, getStoreInventoryCounts, getCategoryGroups, INVENTORY_SORTS, type InventorySort } from "@/lib/data/store";
import { ProductList } from "@/components/store/product-list";
import type { Enums } from "@/types/database";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

const STATUSES: Enums<"inventory_status">[] = ["in_stock", "low_stock", "out_of_stock"];

export default async function StoreProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; category?: string; sort?: string; page?: string }> }) {
  const sp = await searchParams;
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  const status = STATUSES.includes(sp.status as Enums<"inventory_status">) ? (sp.status as Enums<"inventory_status">) : "";
  const sort: InventorySort = sp.sort && sp.sort in INVENTORY_SORTS ? (sp.sort as InventorySort) : "recent";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const categoryId = /^[0-9a-f-]{36}$/.test(sp.category ?? "") ? sp.category! : "";
  const page = Math.max(1, Math.floor(Number(sp.page ?? 1)) || 1);
  const [list, counts, categories] = await Promise.all([
    getStoreInventory(membership.store.id, { q, status, categoryId: categoryId || undefined, sort, page, pageSize: 24 }),
    getStoreInventoryCounts(membership.store.id, { q, categoryId: categoryId || undefined }),
    getCategoryGroups(),
  ]);
  return (
    <ProductList items={list.items} total={list.total} page={list.page} pageSize={list.pageSize} error={list.error}
      filter={{ q, status, categoryId, sort }} categories={categories} sorts={INVENTORY_SORTS} counts={counts} />
  );
}
