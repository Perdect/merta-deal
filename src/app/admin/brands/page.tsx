import type { Metadata } from "next";
import { getAllBrands, getBrandProductCounts } from "@/lib/data/admin";
import { BrandManager } from "@/components/admin/brand-manager";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Brands" };

export default async function AdminBrandsPage() {
  const [brands, counts] = await Promise.all([getAllBrands(), getBrandProductCounts()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Brands" subtitle={`${brands.length} brands`} className="px-0" />
      <BrandManager brands={brands} counts={counts} />
    </div>
  );
}
