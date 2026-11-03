import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, History, PackagePlus } from "lucide-react";
import { getAllCategories, getAllBrands } from "@/lib/data/admin";
import { getCatalogueProduct } from "@/lib/data/admin-catalogue";
import { ProductForm } from "@/components/admin/product-form";
import { ProductFlags } from "@/components/admin/product-flags";
import { AdminPageHeader, Panel, DetailList, EmptyBlock, ErrorBlock, rupees } from "@/components/admin/kit";
import { ProductThumb, ProductStatusPill, StockPill } from "@/components/admin/catalogue/bits";
import { OfferQuickEdit, type QuickEditProduct } from "@/components/admin/catalogue/offer-quick-edit";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Product" };

const REASON_LABEL: Record<string, string> = { order: "Order", cancel_restock: "Order cancelled, restocked", reject_restock: "Order rejected, restocked", manual_adjust: "Correction", restock: "Restock", damage: "Damaged or expired" };

export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ data: detail, error }, categories, brands] = await Promise.all([getCatalogueProduct(id), getAllCategories(), getAllBrands()]);
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
  const qe: QuickEditProduct = { id: product.id, name: product.name, slug: product.slug, pack_label: product.pack_label, image_url: product.image_url, brand: brand?.name ?? null, mrp: Number(product.mrp), is_active: product.is_active };
  const onSale = product.is_active && listing?.is_active;

  return (
    <>
      <AdminPageHeader back="/admin/products" title={product.name}
        description={[brand?.name, product.pack_label, category?.name].filter(Boolean).join(" · ") || undefined}
        meta={<>
          <ProductStatusPill isActive={product.is_active} />
          {onSale
            ? <Link href={`/p/${product.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">View on site<ExternalLink className="h-3 w-3" aria-hidden /><span className="sr-only">(opens in a new tab)</span></Link>
            : <span className="text-xs text-ink-3">Hidden from customers</span>}
        </>}
        actions={<ProductFlags id={product.id} name={product.name} isActive={product.is_active} />} />

      {/* ---------------- Price and stock (inventory) ---------------- */}
      <Panel id="listing" className="mb-6" title="Price and stock"
        description={`What customers pay and what's on the shelf. Separate from the catalogue MRP (${rupees(product.mrp)}).`}
        actions={<OfferQuickEdit variant="button" product={qe} offer={listing} showFlags={false} />}>
        {listing ? (
          <DetailList items={[
            { label: "Selling price", value: <span className="font-semibold tabular">{rupees(listing.selling_price)}{Number(listing.mrp) > Number(listing.selling_price) ? <span className="ml-2 text-xs font-normal text-success">{Math.round((1 - Number(listing.selling_price) / Number(listing.mrp)) * 100)}% off MRP {rupees(listing.mrp)}</span> : null}</span> },
            { label: "Stock", value: <StockPill status={listing.status} isActive={listing.is_active} qty={listing.stock_qty} /> },
            { label: "Low-stock alert", value: `at ${listing.low_stock_threshold}` },
            { label: "Max per order", value: `${listing.max_order_qty} packs` },
            { label: "Sold", value: `${listing.sold_count}` },
            { label: "Updated", value: <span title={formatDateTime(listing.updated_at)}>{timeAgo(listing.updated_at)}</span> },
          ]} />
        ) : (
          <EmptyBlock icon={PackagePlus} title="Not on sale yet" description="Customers can't buy this product until it has a selling price and stock." action={<OfferQuickEdit variant="button" product={qe} offer={null} showFlags={false} />} />
        )}
      </Panel>

      {movements.length ? (
        <Panel className="mb-6" flush title={<span className="inline-flex items-center gap-1.5"><History className="h-4 w-4 text-ink-3" aria-hidden />Recent stock changes</span>} description="Latest 12 movements, from inventory history">
          <ul className="divide-y divide-line border-t border-line text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 sm:px-5">
                <span className={m.delta > 0 ? "w-14 font-semibold tabular text-success" : "w-14 font-semibold tabular text-danger"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                <span className="text-ink-2">{REASON_LABEL[m.reason] ?? m.reason}</span>
                <span className="text-xs text-ink-3">{m.actor?.full_name ?? ""}</span>
                {m.note ? <span className="w-full truncate pl-[68px] text-xs text-ink-4">{m.note}</span> : null}
                <span className="ml-auto text-xs text-ink-3" title={formatDateTime(m.created_at)}>{timeAgo(m.created_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* ---------------- Catalogue information (products) ---------------- */}
      <div className="mb-3 flex items-center gap-3">
        <ProductThumb image={product.image_url} name={product.name} brand={brand?.name} pack={product.pack_label} />
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Catalogue details</h2>
          <p className="text-xs text-ink-3">Name, pack, MRP, photos, details and flags. Added {formatDateTime(product.created_at)} · updated {timeAgo(product.updated_at)}.</p>
        </div>
      </div>
      <ProductForm product={product} categories={categories} brands={brands} />
    </>
  );
}
