import type { Metadata } from "next";
import { getAllCategories, getAllBrands } from "@/lib/data/admin";
import { ProductForm } from "@/components/admin/product-form";
import { AdminPageHeader } from "@/components/admin/kit";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const [categories, brands] = await Promise.all([getAllCategories(), getAllBrands()]);
  return (
    <>
      <AdminPageHeader back="/admin/products" title="New product"
        description="Adds a product to the shared catalogue. After saving, give it a selling price and stock so customers can buy it." />
      <ProductForm product={null} categories={categories} brands={brands} />
    </>
  );
}
