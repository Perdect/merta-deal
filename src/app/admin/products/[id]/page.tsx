import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, History, PackagePlus, Store as StoreIcon } from "lucide-react";
import { getAllCategories, getAllBrands } from "@/lib/data/admin";
import { getCatalogueProduct, MAIN_STORE_SLUG, type OfferWithStore } from "@/lib/data/admin-catalogue";
import { ProductForm } from "@/components/admin/product-form";
import { ProductFlags } from "@/components/admin/product-flags";
import { AdminPageHeader, Panel, DataTable, CellStack, EmptyBlock, ErrorBlock, StatusPill, StatusText, rupees } from "@/components/admin/kit";
import { ProductThumb, ProductStatusPill, StockPill } from "@/components/admin/catalogue/bits";
import { OfferQuickEdit, type QuickEditProduct } from "@/components/admin/catalogue/offer-quick-edit";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Product" };

const REASON_LABEL: Record<string, string> = { order: "Order", cancel_restock: "Order cancelled, restocked", manual_adjust: "Correction", restock: "Restock", damage: "Damaged or expired" };

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
  const { product, offers, movements, creator, category, brand, mainStore } = detail;
  const visible = product.is_active && product.is_approved;
  const mainOffer = offers.find((o) => o.store?.slug === MAIN_STORE_SLUG) ?? null;
  const qe: QuickEditProduct = { id: product.id, name: product.name, slug: product.slug, pack_label: product.pack_label, image_url: product.image_url, brand: brand?.name ?? null, mrp: Number(product.mrp), is_active: product.is_active, is_approved: product.is_approved };
  const storeName = (inventoryId: string) => offers.find((o) => o.id === inventoryId)?.store?.name ?? "Store";
  const isMain = (o: OfferWithStore) => o.store?.slug === MAIN_STORE_SLUG;

  return (
    <>
      <AdminPageHeader back="/admin/products" title={product.name}
        description={[brand?.name, product.pack_label, category?.name].filter(Boolean).join(" · ") || undefined}
        meta={<>
          <ProductStatusPill isActive={product.is_active} isApproved={product.is_approved} />
          {creator ? <span className="text-xs text-ink-3">Created by store <Link href={`/admin/stores/${creator.id}`} className="font-semibold text-brand-700 hover:underline">{creator.name}</Link></span> : null}
          {visible
            ? <Link href={`/p/${product.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">View on site<ExternalLink className="h-3 w-3" aria-hidden /><span className="sr-only">(opens in a new tab)</span></Link>
            : <span className="text-xs text-ink-3">Hidden from customers</span>}
        </>}
        actions={<ProductFlags id={product.id} name={product.name} isActive={product.is_active} isApproved={product.is_approved} />} />

      {/* ---------------- Store-specific prices and stock (inventory) ---------------- */}
      <Panel id="store-prices" className="mb-6" flush title="Store prices and stock"
        description={`What customers pay and what's on the shelf, per store. Separate from the catalogue MRP (${rupees(product.mrp)}).`}
        actions={!mainOffer && mainStore && offers.length > 0 ? <OfferQuickEdit variant="button" product={qe} offer={null} storeName={mainStore.name} showFlags={false} /> : null}>
        <div className="border-t border-line">
          <DataTable className="rounded-none border-0 shadow-none" maxHeight={null} caption="Store prices and stock" rows={offers} rowKey={(o) => o.id}
            empty={mainStore
              ? <EmptyBlock icon={PackagePlus} title={`Not listed at ${mainStore.name} yet`} description="Customers can't buy this product until it has a store price and stock." action={<OfferQuickEdit variant="button" product={qe} offer={null} storeName={mainStore.name} showFlags={false} />} />
              : <EmptyBlock icon={StoreIcon} title="No store lists this product" description="Set up the Merta Deal store under Stores, then list the product there." action={<Link href="/admin/stores" className="text-sm font-semibold text-brand-700 hover:underline">Go to stores</Link>} />}
            columns={[
              { key: "store", header: "Store", render: (o) => (
                <span className="flex flex-col items-start gap-1">
                  <CellStack primary={o.store?.name ?? "Store"} href={o.store ? `/admin/stores/${o.store.id}` : undefined} secondary={o.store?.area} />
                  {isMain(o) ? <StatusPill tone="blue">Main store</StatusPill> : o.store ? <StatusText value={o.store.status} label={`Partner · ${o.store.status}`} /> : null}
                </span>
              ) },
              { key: "price", header: "Selling price", align: "right", render: (o) => <span className="font-semibold tabular text-ink">{rupees(o.selling_price)}</span> },
              { key: "mrp", header: "Store MRP", align: "right", hideBelow: "sm", render: (o) => <span className="tabular text-ink-3">{rupees(o.mrp)}{Number(o.mrp) > Number(o.selling_price) ? <span className="block text-[11px] text-success">{Math.round((1 - Number(o.selling_price) / Number(o.mrp)) * 100)}% off</span> : null}</span> },
              { key: "stock", header: "Stock", render: (o) => <StockPill status={o.status} isActive={o.is_active} qty={o.stock_qty} /> },
              { key: "limits", header: "Alert / max", align: "right", hideBelow: "lg", render: (o) => <span className="text-xs tabular text-ink-3">≤{o.low_stock_threshold} · {o.max_order_qty}/order</span> },
              { key: "sold", header: "Sold", align: "right", hideBelow: "md", render: (o) => <span className="tabular text-ink-3">{o.sold_count}</span> },
              { key: "updated", header: "Updated", hideBelow: "lg", render: (o) => <span className="whitespace-nowrap text-xs text-ink-3" title={formatDateTime(o.updated_at)}>{timeAgo(o.updated_at)}</span> },
              { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (o) => isMain(o) || (!mainStore && o.store?.status === "active")
                ? <OfferQuickEdit variant="button" product={qe} offer={o} storeName={o.store?.name ?? null} showFlags={false} />
                : <span className="text-xs text-ink-4" title="Partner stores are closed; their old offers are kept for history.">Read only</span> },
            ]} />
        </div>
        {offers.some((o) => !isMain(o)) ? <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3 sm:px-5">Merta Deal now sells directly. Offers from former partner stores are shown for history and stay paused.</p> : null}
      </Panel>

      {movements.length ? (
        <Panel className="mb-6" flush title={<span className="inline-flex items-center gap-1.5"><History className="h-4 w-4 text-ink-3" aria-hidden />Recent stock changes</span>} description="Latest 12 movements across stores, from inventory history">
          <ul className="divide-y divide-line border-t border-line text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 sm:px-5">
                <span className={m.delta > 0 ? "w-14 font-semibold tabular text-success" : "w-14 font-semibold tabular text-danger"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                <span className="text-ink-2">{REASON_LABEL[m.reason] ?? m.reason}</span>
                <span className="text-xs text-ink-3">{storeName(m.inventory_id)}{m.actor?.full_name ? ` · ${m.actor.full_name}` : ""}</span>
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
          <p className="text-xs text-ink-3">Shared by every store: name, pack, MRP, photos, details and flags. Added {formatDateTime(product.created_at)} · updated {timeAgo(product.updated_at)}.</p>
        </div>
      </div>
      <ProductForm product={product} categories={categories} brands={brands} />
    </>
  );
}
