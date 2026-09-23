import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getMyStore, getCategoryGroups, getInventoryItem } from "@/lib/data/store";
import { ProductForm } from "@/components/store/product-form";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { INVENTORY_STATUS_META } from "@/components/store/constants";

export const metadata: Metadata = { title: "Edit product" };
export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ inventoryId: string }> }) {
  const { inventoryId } = await params;
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  if (!/^[0-9a-f-]{36}$/.test(inventoryId)) notFound();
  const [item, categories] = await Promise.all([getInventoryItem(membership.store.id, inventoryId), getCategoryGroups()]);
  if (!item) notFound();
  const meta = INVENTORY_STATUS_META[item.status];
  return (
    <div>
      <PageHeader title={item.product.name} subtitle={item.product.pack_label ?? `${item.product.weight_value} ${item.product.weight_unit}`} back="/store/products" className="px-0" action={<Badge tone={meta.tone}>{meta.label} · {item.stock_qty}</Badge>} />
      <ProductForm storeId={membership.store.id} categories={categories} item={item} />
    </div>
  );
}
