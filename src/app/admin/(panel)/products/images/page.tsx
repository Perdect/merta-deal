import type { Metadata } from "next";
import Link from "next/link";
import { Camera, CheckCircle2, ImageOff, Package, SearchX } from "lucide-react";
import { getAllCategories, getAllBrands, spGet, spPage, type SP } from "@/lib/data/admin";
import { listPhotoStudio, withSubcategories } from "@/lib/data/admin-catalogue";
import { AdminPageHeader, MetricCard, EmptyBlock, ErrorBlock, ListToolbar, StatusTabs, ListPagination } from "@/components/admin/kit";
import { PhotoStudio, BulkImport } from "@/components/admin/photo-studio";
import { btn } from "@/components/admin/catalogue/bits";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Photo studio" };

const TABS = [
  { value: "0", label: "Needs a photo" },
  { value: "1", label: "Has a photo" },
  { value: "all", label: "All" },
];

/**
 * Photo studio: the one place to see which active products still have no pack shot and to supply
 * official ones, either per product or in bulk from a supplier asset sheet.
 */
export default async function PhotoStudioPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const have = TABS.some((t) => t.value === spGet(sp, "have")) ? spGet(sp, "have") : "0";
  const [categories, brands] = await Promise.all([getAllCategories(), getAllBrands()]);
  const category = spGet(sp, "category");
  const filters = { q: spGet(sp, "q"), categoryIds: withSubcategories(categories, category), brand: spGet(sp, "brand") };
  const { items, total, page, pageSize, error, counts, withPhoto, totalProducts } = await listPhotoStudio({ ...filters, have, page: spPage(sp) });
  const pct = totalProducts ? Math.round((withPhoto / totalProducts) * 100) : 0;
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();
  const parentName = (id: string | null) => categories.find((c) => c.id === id)?.name;

  return (
    <>
      <AdminPageHeader title="Photo studio" description="Give every active product an official pack shot. Products without one show a neutral “photo coming soon” tile."
        actions={<Link href="/admin/products" className={btn.outline}><Package className="h-4 w-4" aria-hidden />All products</Link>} />

      <section aria-label="Photo coverage" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard label="With a photo" period="Active products, now" value={formatNumber(withPhoto)} icon={CheckCircle2} hint={`of ${formatNumber(totalProducts)}`} />
        <MetricCard label="Still needed" period="Active products, now" value={formatNumber(Math.max(0, totalProducts - withPhoto))} icon={ImageOff} tone={totalProducts - withPhoto > 0 ? "attention" : "default"} hint="Most popular listed first" />
        <MetricCard label="Coverage" period="Active products, now" value={`${pct}%`} icon={Camera} hint={pct === 100 ? "Every card shows a photo" : undefined} />
      </section>

      <div className="mb-4"><BulkImport /></div>

      <StatusTabs param="have" defaultValue="0" items={TABS.map((t) => ({ ...t, count: counts[t.value] ?? null }))} />
      <ListToolbar searchPlaceholder="Product name or slug" filters={[
        { key: "category", label: "Category", anyLabel: "All categories", options: categories.map((c) => ({ value: c.id, label: c.parent_id ? `${parentName(c.parent_id) ?? ""} › ${c.name}` : `${c.name} (incl. subcategories)` })) },
        { key: "brand", label: "Brand", anyLabel: "All brands", options: brands.map((b) => ({ value: b.id, label: b.name })) },
      ]} />

      {error ? (
        <ErrorBlock title="Couldn't load the photo queue" description={`${error}. Your filters are kept; try again.`} retryHref={`/admin/products/images${qs ? `?${qs}` : ""}`} />
      ) : items.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-card">
          {filters.q || category || filters.brand
            ? <EmptyBlock icon={SearchX} title="No products match" description="Clear a filter chip or search by a shorter name." />
            : have === "0"
              ? <EmptyBlock icon={CheckCircle2} title="Every active product has a photo" description="Nothing left in the queue. New products without a photo will appear here." />
              : <EmptyBlock icon={Camera} title="No products here yet" description="Add products to the catalogue, then give them photos here." action={<Link href="/admin/products/new" className={btn.primary}>New product</Link>} />}
        </div>
      ) : <PhotoStudio rows={items} />}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </>
  );
}
