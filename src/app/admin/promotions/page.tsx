import type { Metadata } from "next";
import { getBanners, getPromotions, getCities, getAllCategories, getProductOptions } from "@/lib/data/admin";
import { BannerManager, PromotionManager } from "@/components/admin/promotion-manager";
import { PageHeader } from "@/components/ui/misc";
import { SectionHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Promotions" };

export default async function AdminPromotionsPage() {
  const [banners, promotions, cities, categories] = await Promise.all([getBanners(), getPromotions(), getCities(), getAllCategories()]);
  const productIds = [...new Set(promotions.flatMap((p) => p.product_ids))];
  const products = await getProductOptions(productIds);
  const productNames = Object.fromEntries(products.map((p) => [p.id, `${p.name}${p.pack_label ? ` ${p.pack_label}` : ""}`]));
  return (
    <div className="space-y-6">
      <PageHeader title="Promotions" subtitle="Home banners and curated collections." className="px-0" />
      <section>
        <SectionHeader title="Banners" subtitle={`${banners.length} banners · shown on the customer site by placement and schedule`} className="px-0" />
        <BannerManager banners={banners} cities={cities} />
      </section>
      <section>
        <SectionHeader title="Collections & campaigns" subtitle={`${promotions.length} promotions`} className="px-0" />
        <PromotionManager promotions={promotions} categories={categories.filter((c) => !c.parent_id).map((c) => ({ id: c.id, name: c.name }))} productNames={productNames} />
      </section>
    </div>
  );
}
