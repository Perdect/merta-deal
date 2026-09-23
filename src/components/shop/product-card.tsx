import Link from "next/link";
import { Heart } from "lucide-react";
import type { ProductCard as ProductCardType } from "@/types/app";
import { cn } from "@/lib/utils";
import { DiscountBadge, VegMark } from "@/components/ui/badge";
import { Price, StarRating } from "@/components/ui/misc";
import { ProductImage } from "./product-image";
import { AddToCart } from "./add-to-cart";
import { WishlistButton } from "./wishlist-button";

/**
 * Product card: photo-first, consistent square image area, clear price hierarchy, ADD control.
 * Image data comes from the product record (products.image_url / images) — never hardcoded here.
 */
export function ProductCard({ product, signedIn, wished, className, priority, showStore = true }: { product: ProductCardType; signedIn?: boolean; wished?: boolean; className?: string; priority?: boolean; showStore?: boolean }) {
  const price = Number(product.selling_price ?? product.base_mrp);
  const mrp = Number(product.mrp ?? product.base_mrp);
  const pct = Number(product.discount_pct ?? 0);
  const lowStock = product.stock_status === "low_stock";
  const href = `/p/${product.slug}`;
  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-lg border border-line bg-card shadow-card transition-[box-shadow,transform,border-color] duration-200 md:hover:-translate-y-0.5 md:hover:border-line-2 md:hover:shadow-float", className)}>
      <div className="relative p-2 pb-0">
        <Link href={href} aria-label={product.name} className="block">
          <ProductImage image={product.image_url} brand={product.brand_name} productName={product.name} packSize={product.pack_label} fallbackImage={product.images?.[0] ?? null} className="aspect-square w-full rounded-md" priority={priority} />
        </Link>
        <div className="pointer-events-none absolute left-3.5 top-3.5 z-10 flex flex-col items-start gap-1">
          <DiscountBadge pct={pct} />
          {product.is_local ? <span className="rounded-xs bg-saffron-500 px-1.5 py-0.5 text-[10px] font-bold text-ink">LOCAL</span> : null}
        </div>
        <div className="absolute right-3.5 top-3.5 z-10">
          {signedIn ? <WishlistButton productId={product.id} initial={Boolean(wished)} /> : <Link href={`/login?next=${encodeURIComponent(href)}`} aria-label="Sign in to save" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink-3 shadow-card"><Heart className="h-4 w-4" /></Link>}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">
          <VegMark veg={product.is_veg} />
          <span className="truncate">{product.brand_name ?? product.category_name}</span>
        </div>
        <Link href={href} className="mt-1 line-clamp-2 min-h-[2.6em] text-[13.5px] font-semibold leading-snug text-ink sm:text-sm">{product.name}</Link>
        <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
          <span>{product.pack_label}</span>
          {Number(product.rating_count) > 0 ? <StarRating value={product.rating_avg} count={product.rating_count} size={12} /> : null}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            <Price price={price} mrp={mrp} size="md" />
            {showStore && product.store_name ? <p className="truncate text-[11px] text-ink-3">{product.store_name}</p> : null}
            {lowStock ? <p className="text-[11px] font-semibold text-saffron-700">Only {product.stock_qty} left</p> : null}
          </div>
          <AddToCart inventoryId={product.inventory_id} maxQty={product.max_order_qty} stockQty={product.stock_qty} size="sm" signedIn={signedIn} />
        </div>
      </div>
    </article>
  );
}

export function ProductRail({ products, signedIn, wished, className }: { products: ProductCardType[]; signedIn?: boolean; wished?: Set<string>; className?: string }) {
  if (!products.length) return null;
  return (
    <div className={cn("scroll-x px-4 pb-1 sm:px-0", className)}>
      {products.map((p) => <ProductCard key={p.id} product={p} signedIn={signedIn} wished={wished?.has(p.id)} className="w-[156px] sm:w-[184px]" />)}
    </div>
  );
}

export function ProductGrid({ products, signedIn, wished, className }: { products: ProductCardType[]; signedIn?: boolean; wished?: Set<string>; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} signedIn={signedIn} wished={wished?.has(p.id)} priority={i < 4} />)}
    </div>
  );
}
