import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyStore, getCategoryGroups, getStoreProductIds } from "@/lib/data/store";
import { NewProductTabs } from "@/components/store/new-product-tabs";
import { productsBackHref } from "@/components/store/back-href";

export const metadata: Metadata = { title: "Add product" };
export const dynamic = "force-dynamic";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  const sp = await searchParams;
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  const [categories, listed] = await Promise.all([getCategoryGroups(), getStoreProductIds(membership.store.id)]);
  return <NewProductTabs storeId={membership.store.id} categories={categories} listedProductIds={listed} backHref={productsBackHref(sp.back)} />;
}
