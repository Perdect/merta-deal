import type { Metadata } from "next";
import { getAllCategories, getAllBrands } from "@/lib/data/admin";
import { ProductForm } from "@/components/admin/product-form";
import { AdminPageHeader } from "@/components/admin/kit";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ barcode?: string }> }) {
  const [categories, brands, sp] = await Promise.all([getAllCategories(), getAllBrands(), searchParams]);
  const barcode = /^[0-9]{8,14}$/.test(sp.barcode ?? "") ? sp.barcode : undefined;
  return (
    <>
      <AdminPageHeader back="/admin/products" title="New product"
        description={barcode ? `Adds a product to the catalogue with packet barcode ${barcode} attached on save. Then give it a selling price and stock.` : "Adds a product to the shared catalogue. After saving, give it a selling price and stock so customers can buy it."} />
      <ProductForm product={null} categories={categories} brands={brands} barcode={barcode} />
    </>
  );
}
