import type { Metadata } from "next";
import { getAllCategories, getAllBrands } from "@/lib/data/admin";
import { ProductForm } from "@/components/admin/product-form";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const [categories, brands] = await Promise.all([getAllCategories(), getAllBrands()]);
  return (
    <div className="space-y-4">
      <PageHeader back="/admin/products" title="New product" subtitle="Adds a SKU to the master catalogue. Stores then list it with their own price and stock." className="px-0" />
      <ProductForm product={null} categories={categories} brands={brands} />
    </div>
  );
}
