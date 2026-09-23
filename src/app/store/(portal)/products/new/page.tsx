import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyStore, getCategoryGroups, getStoreProductIds } from "@/lib/data/store";
import { NewProductTabs } from "@/components/store/new-product-tabs";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Add product" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  const [categories, listed] = await Promise.all([getCategoryGroups(), getStoreProductIds(membership.store.id)]);
  return (
    <div>
      <PageHeader title="Add product" subtitle="Pick from the shared catalog (fastest) or create your own listing." back="/store/products" className="px-0" />
      <NewProductTabs storeId={membership.store.id} categories={categories} listedProductIds={listed} />
    </div>
  );
}
