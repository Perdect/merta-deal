import type { Metadata } from "next";
import Link from "next/link";
import { Box, Plus } from "lucide-react";
import { listProducts, getAllCategories, getAllBrands, spGet, spPage, type SP } from "@/lib/data/admin";
import { ListToolbar, ListPagination } from "@/components/admin/list-controls";
import { ProductImage } from "@/components/shop/product-image";
import { PageHeader, Table } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { VegMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { formatINR, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [{ items, total, page, pageSize }, categories, brands] = await Promise.all([
    listProducts({ q: spGet(sp, "q"), category: spGet(sp, "category"), brand: spGet(sp, "brand"), approval: spGet(sp, "approval"), active: spGet(sp, "active"), page: spPage(sp) }),
    getAllCategories(), getAllBrands(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Products" subtitle={`${total} SKUs in the master catalogue`} className="px-0" action={<Button href="/admin/products/new" size="sm"><Plus className="h-4 w-4" /> New product</Button>} />
      <ListToolbar searchPlaceholder="Name, slug or pack" filters={[
        { key: "category", label: "Categories", options: categories.map((c) => ({ value: c.id, label: c.parent_id ? `— ${c.name}` : c.name })) },
        { key: "brand", label: "Brands", options: brands.map((b) => ({ value: b.id, label: b.name })) },
        { key: "approval", label: "Approval", placeholder: "Any approval", options: [{ value: "pending", label: "Awaiting approval" }, { value: "approved", label: "Approved" }, { value: "store", label: "Store-created" }] },
        { key: "active", label: "Visibility", placeholder: "Active + inactive", options: [{ value: "1", label: "Active" }, { value: "0", label: "Inactive" }] },
      ]} />
      {items.length === 0 ? <EmptyState icon={<Box className="h-7 w-7" />} title="No products match" action={<Button href="/admin/products/new" variant="outline">Create a product</Button>} /> : (
        <Table rows={items as unknown as Record<string, unknown>[]} columns={[
          { key: "name", header: "Product", render: (r) => { const p = r as unknown as (typeof items)[number]; return <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3"><ProductImage image={p.image_url} productName={p.name} className="h-11 w-11 shrink-0 rounded-sm" sizes="44px" /><span className="min-w-0"><span className="flex items-center gap-1.5 font-semibold text-ink"><VegMark veg={p.is_veg} />{p.name}</span><span className="block truncate text-xs text-ink-3">{p.pack_label ?? ""}{p.brand?.name ? ` · ${p.brand.name}` : ""}{p.is_local ? " · Local" : ""}</span></span></Link>; } },
          { key: "category", header: "Category", render: (r) => (r.category as { name: string } | null)?.name ?? "—" },
          { key: "mrp", header: "MRP", className: "text-right", render: (r) => <span className="tabular">{formatINR(r.mrp as number)}</span> },
          { key: "flags", header: "Status", render: (r) => <span className="flex flex-wrap gap-1">{r.is_active ? <Badge tone="success" size="xs">active</Badge> : <Badge tone="neutral" size="xs">inactive</Badge>}{!r.is_approved ? <Badge tone="warning" size="xs">needs approval</Badge> : null}{r.created_by_store_id ? <Badge tone="info" size="xs">store SKU</Badge> : null}</span> },
          { key: "popularity_score", header: "Pop.", className: "text-right", render: (r) => <span className="tabular text-ink-3">{r.popularity_score as number}</span> },
          { key: "created_at", header: "Added", render: (r) => <span className="text-xs text-ink-3">{formatDate(r.created_at as string)}</span> },
        ]} />
      )}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
