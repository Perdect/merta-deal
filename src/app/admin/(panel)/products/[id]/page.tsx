import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getAllCategories, getAllBrands, adminRpc } from "@/lib/data/admin";
import { env } from "@/lib/env";
import type { ScanProduct } from "@/lib/scan/types";
import { getCatalogueProduct } from "@/lib/data/admin-catalogue";
import { ProductEditor } from "@/components/admin/catalogue/product-editor";
import { ProductFlags } from "@/components/admin/product-flags";
import { AdminPageHeader, ErrorBlock } from "@/components/admin/kit";
import { ProductStatusPill, StockPill } from "@/components/admin/catalogue/bits";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Product" };

/**
 * One product, one editor: the daily fields (name, category, price, stock, photo) are open at the
 * top and everything else sits in a section that opens when it is needed. The header keeps the
 * page-level actions — activate / deactivate and the link to the live page.
 */
export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ data: detail, error }, categories, brands, scan] = await Promise.all([getCatalogueProduct(id), getAllCategories(), getAllBrands(), adminRpc<ScanProduct>("scan_product", { p_product_id: id })]);
  if (error) {
    return (
      <>
        <AdminPageHeader back="/admin/products" title="Product" />
        <ErrorBlock title="Couldn't load this product" description={error} retryHref={`/admin/products/${id}`} />
      </>
    );
  }
  if (!detail) notFound();
  const { product, listing, movements, category, brand } = detail;
  const onSale = product.is_active && listing?.is_active;

  return (
    <>
      <AdminPageHeader back="/admin/products" title={product.name}
        description={[brand?.name, product.pack_label, category?.name].filter(Boolean).join(" · ") || undefined}
        meta={<>
          <ProductStatusPill isActive={product.is_active} />
          {listing ? <StockPill status={listing.status} isActive={listing.is_active} qty={listing.stock_qty} /> : null}
          {onSale
            ? <Link href={`/p/${product.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">View on site<ExternalLink className="h-3 w-3" aria-hidden /><span className="sr-only">(opens in a new tab)</span></Link>
            : <span className="text-xs text-ink-3">Hidden from customers</span>}
          <span className="text-xs text-ink-4">Updated {timeAgo(product.updated_at)}</span>
        </>}
        actions={<ProductFlags id={product.id} name={product.name} isActive={product.is_active} />} />

      <ProductEditor product={product} listing={listing} movements={movements} scan={scan.data} siteUrl={env.siteUrl} categories={categories} brands={brands} />
    </>
  );
}
