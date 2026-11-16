import type { Metadata } from "next";
import { getBanners, getPromotions, getCities, getAllCategories, getProductOptions } from "@/lib/data/admin";
import { PromotionsWorkspace } from "@/components/admin/promotion-manager";

export const metadata: Metadata = { title: "Promotions" };

const nowIso = () => new Date().toISOString();

export default async function AdminPromotionsPage() {
  const [banners, promotions, cities, categories] = await Promise.all([getBanners(), getPromotions(), getCities(), getAllCategories()]);
  const productIds = [...new Set(promotions.flatMap((p) => p.product_ids))];
  const products = await getProductOptions(productIds);
  const productNames = Object.fromEntries(products.map((p) => [p.id, `${p.name}${p.pack_label ? ` ${p.pack_label}` : ""}`]));
  return (
    <PromotionsWorkspace banners={banners} promotions={promotions} cities={cities} productNames={productNames} nowIso={nowIso()}
      categories={categories} />
  );
}
