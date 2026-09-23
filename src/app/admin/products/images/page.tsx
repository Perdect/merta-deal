import type { Metadata } from "next";
import { Camera } from "lucide-react";
import { listPhotoQueue, getAllCategories, getAllBrands, spGet, spPage, type SP } from "@/lib/data/admin";
import { ListToolbar, ListPagination } from "@/components/admin/list-controls";
import { PhotoStudio, BulkImport } from "@/components/admin/photo-studio";
import { PageHeader } from "@/components/ui/misc";
import { Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Photo studio" };

/**
 * Photo studio: the one place to see which SKUs still have no pack shot and to supply official ones,
 * either per product or in bulk from a supplier asset sheet.
 */
export default async function PhotoStudioPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const have = spGet(sp, "have") ?? "0";
  const [{ items, total, page, pageSize, withPhoto, totalProducts }, categories, brands] = await Promise.all([
    listPhotoQueue({ q: spGet(sp, "q"), have, category: spGet(sp, "category"), brand: spGet(sp, "brand"), page: spPage(sp) }),
    getAllCategories(), getAllBrands(),
  ]);
  const pct = totalProducts ? Math.round((withPhoto / totalProducts) * 100) : 0;
  return (
    <div className="space-y-4">
      <PageHeader title="Photo studio" subtitle="Give every SKU an official pack shot" className="px-0" action={<Button href="/admin/products" size="sm" variant="outline">All products</Button>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="With a photo" value={`${withPhoto}`} hint={`of ${totalProducts} active SKUs`} />
        <Stat label="Coverage" value={`${pct}%`} hint={pct === 100 ? "Every card shows a photo" : "Cards without one show a neutral tile"} />
        <Stat label="Still needed" value={`${totalProducts - withPhoto}`} hint="Listed below, most popular first" />
      </div>
      <BulkImport />
      <ListToolbar searchPlaceholder="Product name or slug" filters={[
        { key: "have", label: "Photo", placeholder: "Needs a photo", options: [{ value: "1", label: "Has a photo" }, { value: "all", label: "All products" }] },
        { key: "category", label: "Categories", options: categories.map((c) => ({ value: c.id, label: c.parent_id ? `— ${c.name}` : c.name })) },
        { key: "brand", label: "Brands", options: brands.map((b) => ({ value: b.id, label: b.name })) },
      ]} />
      {items.length === 0 ? (
        <EmptyState icon={<Camera className="h-7 w-7" />} title={have === "0" ? "Every active product has a photo" : "No products match"} description={have === "0" ? "Nothing left in the queue." : undefined} />
      ) : <PhotoStudio rows={items} />}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
