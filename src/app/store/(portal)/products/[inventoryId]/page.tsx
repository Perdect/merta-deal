import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getMyStore, getCategoryGroups, getInventoryItem } from "@/lib/data/store";
import { ProductForm } from "@/components/store/product-form";
import { productsBackHref } from "@/components/store/back-href";

export const metadata: Metadata = { title: "Edit product" };
export const dynamic = "force-dynamic";

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ inventoryId: string }>; searchParams: Promise<{ back?: string }> }) {
  const [{ inventoryId }, sp] = await Promise.all([params, searchParams]);
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  if (!/^[0-9a-f-]{36}$/.test(inventoryId)) notFound();
  const [item, categories] = await Promise.all([getInventoryItem(membership.store.id, inventoryId), getCategoryGroups()]);
  if (!item) notFound();
  return <ProductForm storeId={membership.store.id} categories={categories} item={item} backHref={productsBackHref(sp.back)} />;
}
