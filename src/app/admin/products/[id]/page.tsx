import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductAdmin, getAllCategories, getAllBrands } from "@/lib/data/admin";
import { ProductForm } from "@/components/admin/product-form";
import { ProductFlags } from "@/components/admin/product-flags";
import { PageHeader, Table } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { formatINR, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit product" };

export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, categories, brands] = await Promise.all([getProductAdmin(id), getAllCategories(), getAllBrands()]);
  if (!detail) notFound();
  const { product, offers, creator } = detail;
  return (
    <div className="space-y-4">
      <PageHeader back="/admin/products" title={product.name} subtitle={<span className="inline-flex flex-wrap items-center gap-2">{product.pack_label}{creator ? <span>· created by <Link href={`/admin/stores/${creator.id}`} className="font-semibold text-brand-700">{creator.name}</Link></span> : null}<Link href={`/p/${product.slug}`} className="text-brand-700 hover:underline">View on site</Link>{!product.is_approved ? <Badge tone="warning">Awaiting approval</Badge> : null}</span>} className="px-0"
        action={<ProductFlags id={product.id} isActive={product.is_active} isApproved={product.is_approved} />} />
      <ProductForm product={product} categories={categories} brands={brands} />
      <Card>
        <CardHeader title="Store offers" subtitle={`${offers.length} stores list this product`} />
        <CardBody className="px-0 sm:px-0">
          <Table className="rounded-none border-x-0 border-b-0" rows={offers as unknown as Record<string, unknown>[]} empty="No store lists this product yet." columns={[
            { key: "store", header: "Store", render: (r) => { const s = r.store as { id: string; name: string; area: string; status: string } | null; return s ? <Link href={`/admin/stores/${s.id}`} className="font-semibold text-brand-700">{s.name}<span className="ml-1 text-xs font-normal text-ink-3">{s.area} · {s.status}</span></Link> : "—"; } },
            { key: "selling_price", header: "Price", className: "text-right", render: (r) => <span className="tabular"><span className="font-semibold">{formatINR(r.selling_price as number)}</span> <span className="text-xs text-ink-3 line-through">{formatINR(r.mrp as number)}</span></span> },
            { key: "stock_qty", header: "Stock", className: "text-right", render: (r) => <span className="tabular">{r.stock_qty as number}</span> },
            { key: "status", header: "Status", render: (r) => <Badge tone={r.status === "in_stock" ? "success" : r.status === "low_stock" ? "warning" : "danger"} size="xs">{String(r.status).replace("_", " ")}</Badge> },
            { key: "sold_count", header: "Sold", className: "text-right", render: (r) => <span className="tabular text-ink-3">{r.sold_count as number}</span> },
            { key: "updated_at", header: "Updated", render: (r) => <span className="text-xs text-ink-3">{formatDateTime(r.updated_at as string)}</span> },
          ]} />
        </CardBody>
      </Card>
    </div>
  );
}
