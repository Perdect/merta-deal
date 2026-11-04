import Link from "next/link";
import type { ProductCard as ProductCardType } from "@/types/app";
import { cn, formatINR } from "@/lib/utils";
import { VegMark } from "@/components/ui/badge";
import { ProductImage } from "./product-image";
import { AddToCart } from "./add-to-cart";
import { PackSelector } from "./pack-selector";
import { EtaPill } from "./eta-pill";

/**
 * Compact product card: same-size image area, delivery-time pill, name (2 lines), pack size (or the
 * weight chips when the product comes in several sizes), and a bottom row with the price (bold,
 * dark; MRP struck beside it) and the ADD button, which becomes a stepper.
 * Image data comes from the product record (products.image_url / images) — never hardcoded here.
 */
export function ProductCard({ product, signedIn, className, priority }: { product: ProductCardType; signedIn?: boolean; className?: string; priority?: boolean; showStore?: boolean }) {
  const price = Number(product.selling_price ?? product.base_mrp);
  const mrp = Number(product.mrp ?? product.base_mrp);
  const lowStock = product.stock_status === "low_stock";
  const soldOut = !product.inventory_id || product.stock_status === "out_of_stock";
  const href = `/p/${product.slug}`;
  // Several sizes (500 g / 1 kg, 5 kg / 10 kg…): one card; the size is chosen on it.
  const options = (product.variants ?? []).filter((v) => v.inventory_id);
  return (
    <article className={cn("group relative flex flex-col rounded-[14px] border border-line bg-card p-2 transition-[border-color,box-shadow] duration-200 hover:border-line-2 hover:shadow-card", className)}>
      <Link href={href} aria-label={product.name} className="block rounded-[10px] focus-visible:outline-2 focus-visible:outline-brand-600">
        <ProductImage image={product.image_url} brand={product.brand_name} productName={product.name} packSize={product.pack_label} fallbackImage={product.images?.[0] ?? null} className={cn("aspect-square w-full", soldOut && options.length < 2 && "opacity-60")} rounded="rounded-[10px]" priority={priority} sizes="(max-width: 640px) 45vw, (max-width: 1280px) 22vw, 180px" />
      </Link>

      <div className="flex flex-1 flex-col px-0.5 pt-2">
        <EtaPill className="mb-1.5 self-start" />
        <Link href={href} className="tap line-clamp-2 min-h-[2.5em] text-[13px] font-semibold leading-[1.25] text-ink hover:text-brand-800">{product.name}</Link>
        {options.length > 1 ? (
          <PackSelector product={product} options={options} signedIn={signedIn} />
        ) : (
          <>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-3">
              <VegMark veg={product.is_veg} className="h-3 w-3" />
              <span className="truncate">{product.pack_label}</span>
            </p>
            {lowStock && !soldOut ? <p className="mt-0.5 text-[11px] font-semibold text-saffron-700">Only {product.stock_qty} left</p> : null}
            <div className="mt-auto flex items-end justify-between gap-1.5 pt-2">
              <p className="min-w-0 leading-tight tabular">
                <span className="block text-[15px] font-bold text-ink">{formatINR(price)}</span>
                {mrp > price ? <span className="block text-[11px] text-ink-3 line-through"><span className="sr-only">MRP </span>{formatINR(mrp)}</span> : null}
              </p>
              <AddToCart inventoryId={product.inventory_id} maxQty={product.max_order_qty} stockQty={product.stock_qty} size="sm" signedIn={signedIn} className="h-8 rounded-lg px-3.5 text-xs font-extrabold" stepperClassName="h-8 rounded-lg" />
            </div>
          </>
        )}
      </div>
    </article>
  );
}

export function ProductRail({ products, signedIn, className }: { products: ProductCardType[]; signedIn?: boolean; className?: string }) {
  if (!products.length) return null;
  return (
    <div className={cn("scroll-x px-4 pb-1 sm:px-0", className)}>
      {products.map((p) => <ProductCard key={p.id} product={p} signedIn={signedIn} className="w-[150px] shrink-0 sm:w-[170px]" />)}
    </div>
  );
}

export function ProductGrid({ products, signedIn, className, priorityCount = 4 }: { products: ProductCardType[]; signedIn?: boolean; className?: string; priorityCount?: number }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6", className)}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} signedIn={signedIn} priority={i < priorityCount} />)}
    </div>
  );
}
