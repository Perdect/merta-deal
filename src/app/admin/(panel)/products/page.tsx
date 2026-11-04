import type { Metadata } from "next";
import Link from "next/link";
import { Box, Camera, Plus, Printer, SearchX } from "lucide-react";
import { getAllCategories, getAllBrands, spGet, spPage, type SP } from "@/lib/data/admin";
import { listCatalogueProducts, countProductTabs, withSubcategories, PRODUCT_TABS, PRODUCT_SORTS, type ProductFilters } from "@/lib/data/admin-catalogue";
import { AdminPageHeader, DataTable, CellStack, RowLink, EmptyBlock, ErrorBlock, ListToolbar, StatusTabs, ListPagination, rupees } from "@/components/admin/kit";
import { ProductThumb, ProductStatusPill, StockPill, btn } from "@/components/admin/catalogue/bits";
import { OfferQuickEdit } from "@/components/admin/catalogue/offer-quick-edit";
import { VegMark } from "@/components/ui/badge";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // Lookups run alongside the list; the category tree is only awaited first when a category filter needs it.
  const categoriesP = getAllCategories(); const brandsP = getAllBrands();
  const category = spGet(sp, "category");
  const filters: ProductFilters = {
    q: spGet(sp, "q"), status: spGet(sp, "status"), categoryIds: category ? withSubcategories(await categoriesP, category) : undefined, brand: spGet(sp, "brand"),
    photo: spGet(sp, "photo"), stock: spGet(sp, "stock"), sort: spGet(sp, "sort"),
  };
  const [list, counts, categories, brands] = await Promise.all([listCatalogueProducts({ ...filters, page: spPage(sp) }), countProductTabs(filters), categoriesP, brandsP]);
  const { items, total, page, pageSize, error } = list;
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();
  const filtered = Boolean(filters.q || category || filters.brand || filters.photo || filters.stock || filters.status);
  const parentName = (id: string | null) => categories.find((c) => c.id === id)?.name;

  return (
    <>
      <AdminPageHeader title="Products"
        description="The catalogue: names, packs, photos and flags, with each product's selling price and stock."
        actions={<>
          <a href={`/admin/print/labels${category ? `?category=${encodeURIComponent(categories.find((c) => c.id === category)?.slug ?? "")}` : ""}`} target="_blank" rel="noopener" className={btn.outline}><Printer className="h-4 w-4" aria-hidden />Print labels</a>
          <Link href="/admin/products/images" className={btn.outline}><Camera className="h-4 w-4" aria-hidden />Photo studio</Link>
          <Link href="/admin/products/new" className={btn.primary}><Plus className="h-4 w-4" aria-hidden />New product</Link>
        </>} />

      <StatusTabs items={PRODUCT_TABS.map((t) => ({ ...t, count: counts[t.value] ?? null }))} />

      <ListToolbar searchPlaceholder="Product name, slug or pack size" filters={[
        { key: "category", label: "Category", anyLabel: "All categories", options: categories.map((c) => ({ value: c.id, label: c.parent_id ? `${parentName(c.parent_id) ?? ""} › ${c.name}` : `${c.name} (incl. subcategories)` })) },
        { key: "brand", label: "Brand", anyLabel: "All brands", options: [{ value: "none", label: "Unbranded" }, ...brands.map((b) => ({ value: b.id, label: b.name }))] },
        { key: "stock", label: "Stock", anyLabel: "Any stock", options: [{ value: "in_stock", label: "In stock" }, { value: "low_stock", label: "Low stock" }, { value: "out_of_stock", label: "Out of stock" }, { value: "paused", label: "Paused" }, { value: "unlisted", label: "No price yet" }] },
        { key: "photo", label: "Photo", anyLabel: "With or without", options: [{ value: "0", label: "Needs a photo" }, { value: "1", label: "Has a photo" }] },
        { key: "sort", label: "Sort by", anyLabel: "Newest first", options: PRODUCT_SORTS.map((s) => ({ value: s.value, label: s.label })) },
      ]} />

      {error ? (
        <ErrorBlock title="Couldn't load products" description={`${error}. Your filters are kept; try again.`} retryHref={`/admin/products${qs ? `?${qs}` : ""}`} />
      ) : (
        <DataTable caption="Products" rows={items} rowKey={(p) => p.id}
          empty={filtered
            ? <EmptyBlock icon={SearchX} title="No products match" description="Try another tab, remove a filter chip, or search by a shorter name." />
            : <EmptyBlock icon={Box} title="The catalogue is empty" description="Add the first product, then give it a selling price and stock." action={<Link href="/admin/products/new" className={btn.primary}><Plus className="h-4 w-4" aria-hidden />New product</Link>} />}
          columns={[
            { key: "product", header: "Product", render: (p) => (
              <span className="flex min-w-0 items-center gap-3">
                <ProductThumb image={p.image_url} name={p.name} brand={p.brand?.name} pack={p.pack_label} />
                <span className="min-w-0">
                  <CellStack className="max-w-[220px] sm:max-w-[300px]" href={`/admin/products/${p.id}`}
                    primary={<span className="inline-flex items-center gap-1.5"><VegMark veg={p.is_veg} /><span className="truncate">{p.name}</span></span>}
                    secondary={[p.brand?.name, p.pack_label, p.is_local ? "Local" : null].filter(Boolean).join(" · ") || undefined} />
                  <span className="mt-1 block sm:hidden"><ProductStatusPill isActive={p.is_active} /></span>
                </span>
              </span>
            ) },
            { key: "category", header: "Category", hideBelow: "lg", render: (p) => <span className="text-ink-2">{p.category?.name ?? "—"}</span> },
            { key: "mrp", header: "Catalogue MRP", align: "right", hideBelow: "xl", render: (p) => <span className="tabular text-ink-3">{rupees(p.mrp)}</span> },
            { key: "price", header: "Selling price", align: "right", render: (p) => p.offer
              ? <span className="block whitespace-nowrap tabular"><span className="font-semibold text-ink">{rupees(p.offer.selling_price)}</span>{Number(p.offer.mrp) > Number(p.offer.selling_price) ? <span className="block text-xs text-ink-4 line-through">{rupees(p.offer.mrp)}</span> : null}</span>
              : <span className="text-xs text-ink-4">No price yet</span> },
            { key: "stock", header: "Stock", hideBelow: "md", render: (p) => p.offer ? <StockPill status={p.offer.status} isActive={p.offer.is_active} qty={p.offer.stock_qty} /> : <span className="text-xs text-ink-4">—</span> },
            { key: "status", header: "Status", hideBelow: "sm", render: (p) => <ProductStatusPill isActive={p.is_active} /> },
            { key: "updated", header: "Updated", hideBelow: "xl", render: (p) => <span className="whitespace-nowrap text-xs text-ink-3" title={formatDateTime(p.updated_at)}>{timeAgo(p.updated_at)}</span> },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (p) => (
              <span className="inline-flex items-center justify-end gap-1">
                <OfferQuickEdit offer={p.offer}
                  product={{ id: p.id, name: p.name, slug: p.slug, pack_label: p.pack_label, image_url: p.image_url, brand: p.brand?.name ?? null, mrp: Number(p.mrp), is_active: p.is_active }} />
                <span className="hidden sm:inline-flex"><RowLink href={`/admin/products/${p.id}`} label={`Open ${p.name}`}>Open</RowLink></span>
              </span>
            ) },
          ]} />
      )}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </>
  );
}
