import Link from "next/link";
import { Heart } from "lucide-react";
import type { ProductCard as ProductCardType } from "@/types/app";
import { cn, formatINR } from "@/lib/utils";
import { VegMark } from "@/components/ui/badge";
import { ProductImage } from "./product-image";
import { AddToCart } from "./add-to-cart";
import { PackOptionsButton } from "./variant-sheet";
import { EtaPill } from "./eta-pill";
import { WishlistButton } from "./wishlist-button";

/**
 * Compact product card: same-size image area, then name (2 lines), pack size, and a bottom row with
 * the price (bold, dark; MRP struck beside it) and the ADD button, which becomes a stepper.
 * Image data comes from the product record (products.image_url / images) — never hardcoded here.
 */
export function ProductCard({ product, signedIn, wished, className, priority }: { product: ProductCardType; signedIn?: boolean; wished?: boolean; className?: string; priority?: boolean; showStore?: boolean }) {
  const price = Number(product.selling_price ?? product.base_mrp);
  const mrp = Number(product.mrp ?? product.base_mrp);
  const lowStock = product.stock_status === "low_stock";
  const soldOut = !product.inventory_id || product.stock_status === "out_of_stock";
  const href = `/p/${product.slug}`;
  // Several sizes (5 kg / 10 kg…): one card, and ADD opens the size picker instead of adding straight away.
  const options = (product.variants ?? []).filter((v) => v.inventory_id);
  return (
    <article className={cn("group relative flex flex-col rounded-[14px] border border-line bg-card p-2 transition-[border-color,box-shadow] duration-200 hover:border-line-2 hover:shadow-card", className)}>
      <div className="relative">
        <Link href={href} aria-label={product.name} className="block rounded-[10px] focus-visible:outline-2 focus-visible:outline-brand-600">
          <ProductImage image={product.image_url} brand={product.brand_name} productName={product.name} packSize={product.pack_label} fallbackImage={product.images?.[0] ?? null} className={cn("aspect-square w-full", soldOut && "opacity-60")} rounded="rounded-[10px]" priority={priority} sizes="(max-width: 640px) 45vw, (max-width: 1280px) 22vw, 180px" />
        </Link>
        <div className="absolute right-1 top-1 z-10">
          {signedIn ? <WishlistButton productId={product.id} initial={Boolean(wished)} size={14} className="h-7 w-7 bg-white/80 shadow-none" /> : <Link href={`/login?next=${encodeURIComponent(href)}`} aria-label="Sign in to save" className="tap flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-ink-4 hover:text-ink-2"><Heart className="h-3.5 w-3.5" strokeWidth={2} /></Link>}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-0.5 pt-2">
        <EtaPill className="mb-1.5 self-start" />
        <Link href={href} className="tap line-clamp-2 min-h-[2.5em] text-[13px] font-semibold leading-[1.25] text-ink hover:text-brand-800">{product.name}</Link>
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
          {options.length > 1
            ? <PackOptionsButton product={product} options={options} signedIn={signedIn} />
            : <AddToCart inventoryId={product.inventory_id} maxQty={product.max_order_qty} stockQty={product.stock_qty} size="sm" signedIn={signedIn} className="h-8 rounded-lg px-3.5 text-xs font-extrabold" stepperClassName="h-8 rounded-lg" />}
        </div>
      </div>
    </article>
  );
}

export function ProductRail({ products, signedIn, wished, className }: { products: ProductCardType[]; signedIn?: boolean; wished?: Set<string>; className?: string }) {
  if (!products.length) return null;
  return (
    <div className={cn("scroll-x px-4 pb-1 sm:px-0", className)}>
      {products.map((p) => <ProductCard key={p.id} product={p} signedIn={signedIn} wished={wished?.has(p.id)} className="w-[150px] shrink-0 sm:w-[170px]" />)}
    </div>
  );
}

export function ProductGrid({ products, signedIn, wished, className, priorityCount = 4 }: { products: ProductCardType[]; signedIn?: boolean; wished?: Set<string>; className?: string; priorityCount?: number }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6", className)}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} signedIn={signedIn} wished={wished?.has(p.id)} priority={i < priorityCount} />)}
    </div>
  );
}
