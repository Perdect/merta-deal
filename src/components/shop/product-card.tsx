import Link from "next/link";
import type { ProductCard as ProductCardType } from "@/types/app";
import { cn, formatINR } from "@/lib/utils";
import { DiscountBadge, VegMark } from "@/components/ui/badge";
import { ProductImage } from "./product-image";
import { AddToCart } from "./add-to-cart";
import { PackSelector } from "./pack-selector";
import { EtaPill } from "./eta-pill";

/**
 * Compact product card, read top to bottom the way a shopper decides:
 *
 *   photo (saving badge, veg mark and the delivery-time pill sit on its corners)
 *   name (up to two lines; cards in a row line up by their price row, not by padding the name)
 *   pack size, when the product has one — nothing is shown in its place when it has not
 *   "Only N left" while the listing is low on stock
 *   price (bold) over the struck MRP, and the ADD button, which becomes the quantity stepper
 *
 * Every figure is the listing's own: the badge is `discount_pct` and appears only with a real gap between
 * price and MRP, the stock line is `stock_qty`, the photo is `products.image_url` / `images`. A product that
 * comes in several sizes hands the lower half to `PackSelector`, where the chosen size sets the price.
 */
export function ProductCard({ product, signedIn, className, priority }: { product: ProductCardType; signedIn?: boolean; className?: string; priority?: boolean; showStore?: boolean }) {
  const price = Number(product.selling_price ?? product.base_mrp);
  const mrp = Number(product.mrp ?? product.base_mrp);
  const soldOut = !product.inventory_id || product.stock_status === "out_of_stock";
  const lowStock = !soldOut && product.stock_status === "low_stock" && Number(product.stock_qty ?? 0) > 0;
  const href = `/p/${product.slug}`;
  // Several sizes (500 g / 1 kg, 5 kg / 10 kg…): one card; the size is chosen on it.
  const options = (product.variants ?? []).filter((v) => v.inventory_id);
  const single = options.length < 2;
  // With sizes to choose from the price on the card changes with the choice, so no single badge is true.
  const pct = single && !soldOut && mrp > price ? Math.round(Number(product.discount_pct ?? 0)) : 0;
  return (
    <article className={cn("group relative flex flex-col rounded-[14px] border border-line bg-card p-2 transition-[border-color,box-shadow] duration-200 hover:border-line-2 hover:shadow-card motion-reduce:transition-none", className)}>
      <div className="relative">
        <Link href={href} aria-label={product.name} className="block rounded-[10px] focus-visible:outline-2 focus-visible:outline-brand-600">
          <ProductImage image={product.image_url} brand={product.brand_name} productName={product.name} packSize={product.pack_label} fallbackImage={product.images?.[0] ?? null} className={cn("aspect-square w-full", soldOut && single && "opacity-55 grayscale-[35%]")} rounded="rounded-[10px]" priority={priority} sizes="(max-width: 640px) 45vw, (max-width: 1280px) 22vw, 180px" />
        </Link>
        {/* Corner marks never take the tap: the whole photo stays one link to the product. */}
        {pct > 0 ? <DiscountBadge pct={pct} className="pointer-events-none absolute left-0 top-0 rounded-none rounded-br-[10px] rounded-tl-[10px] px-2 py-1" /> : null}
        <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-[5px] bg-white/90">
          <VegMark veg={product.is_veg} className="h-3 w-3" />
        </span>
        {/* Empty (and invisible) until the customer has chosen a location we deliver to. */}
        <EtaPill className="pointer-events-none absolute bottom-1.5 left-1.5" />
      </div>

      <div className="flex flex-1 flex-col px-0.5 pt-2">
        <Link href={href} className="tap line-clamp-2 text-[13px] font-semibold leading-[1.25] text-ink hover:text-brand-800">{product.name}</Link>
        {single ? (
          <>
            {product.pack_label ? <p className="mt-1 max-w-full self-start truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-ink-2">{product.pack_label}</p> : null}
            {lowStock ? <p className="mt-1 text-[11px] font-semibold leading-tight text-saffron-700">Only {product.stock_qty} left</p> : null}
            {/* If the price and the control ever cannot share a line (a four-figure price beside the stepper
                on a narrow card), the control drops under the price instead of covering it. */}
            <div className="mt-auto flex flex-wrap items-end justify-between gap-x-1.5 gap-y-1.5 pt-2">
              <p className="min-w-0 leading-tight tabular">
                <span className={cn("block text-[15px] font-bold", soldOut ? "text-ink-3" : "text-ink")}>{formatINR(price)}</span>
                {mrp > price ? <span className="block text-[11px] text-ink-3 line-through"><span className="sr-only">MRP </span>{formatINR(mrp)}</span> : null}
              </p>
              <AddToCart inventoryId={product.inventory_id} maxQty={product.max_order_qty} stockQty={product.stock_qty} size="sm" signedIn={signedIn} className="ml-auto h-9 rounded-lg px-3 text-xs font-extrabold" stepperClassName="ml-auto h-9 rounded-lg [&>button]:h-full" />
            </div>
          </>
        ) : (
          <PackSelector product={product} options={options} signedIn={signedIn} />
        )}
      </div>
    </article>
  );
}

/** A sideways row of cards. The first card rests on the page gutter and the next one peeks in. */
export function ProductRail({ products, signedIn, className }: { products: ProductCardType[]; signedIn?: boolean; className?: string }) {
  if (!products.length) return null;
  return (
    // scroll-pl matches the padding: without it the mandatory snap pulled the first card to the screen edge.
    <div className={cn("scroll-x scroll-pl-4 px-4 pb-1 sm:scroll-pl-0 sm:px-0", className)}>
      {products.map((p) => <ProductCard key={p.id} product={p} signedIn={signedIn} className="w-[164px] shrink-0 sm:w-[176px]" />)}
    </div>
  );
}

/**
 * `enterFrom`: cards from this position on fade in when they mount (the ones "Load more" appends). The
 * cards a page arrives with are never animated, so the first paint is the finished grid.
 */
export function ProductGrid({ products, signedIn, className, priorityCount = 4, enterFrom }: { products: ProductCardType[]; signedIn?: boolean; className?: string; priorityCount?: number; enterFrom?: number }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6", className)}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} signedIn={signedIn} priority={i < priorityCount} className={enterFrom != null && i >= enterFrom ? "motion-safe:animate-fade-in" : undefined} />)}
    </div>
  );
}
