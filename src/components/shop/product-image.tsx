"use client";
import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Product photo presentation used everywhere a product appears (cards, rails, cart, orders, search, admin).
 *
 * Data contract (mirrors `products.image_url` / `products.images` in the database, keyed by product id):
 *   { image, imageAlt, brand, productName, packSize, fallbackImage }
 *
 * - Photos are transparent cutouts (background removed in the image pipeline, 8% built-in padding) rendered
 *   with `object-contain` on a white tile, so every product floats on the same clean surface, responsive
 *   sizes, lazy by default, dimensions reserved by the square container (no layout shift).
 * - When no photo exists (or the file fails to load) a clean neutral tile shows the brand and pack size —
 *   never a generic category icon.
 */
export type ProductImageProps = {
  image?: string | null;
  imageAlt?: string;
  brand?: string | null;
  productName?: string;
  packSize?: string | null;
  fallbackImage?: string | null;
  /** Kept for backwards compatibility with earlier call sites. */
  src?: string | null;
  alt?: string;
  categorySlug?: string | null;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** "card" = padded contain (default). "cover" = edge-to-edge (store/banner style). */
  fit?: "card" | "cover";
  rounded?: string;
};

export function productImageAlt(p: { brand?: string | null; productName?: string | null; packSize?: string | null }) {
  const name = p.productName ?? "";
  return [p.brand && !name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : null, name, p.packSize].filter(Boolean).join(" ") || "Product image";
}

export function ProductImage({ image, src, imageAlt, alt, brand, productName, packSize, fallbackImage, className, sizes = "(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px", priority, fit = "card", rounded = "rounded-md" }: ProductImageProps) {
  const primary = image ?? src ?? null;
  const [failed, setFailed] = React.useState<string | null>(null);
  const candidate = primary && failed !== primary ? primary : fallbackImage && failed !== fallbackImage ? fallbackImage : null;
  const name = productName ?? (alt && alt.trim() ? alt : undefined);
  const label = imageAlt ?? (alt && alt.trim() ? alt : productImageAlt({ brand, productName: name, packSize }));

  if (candidate) {
    return (
      <div className={cn("relative overflow-hidden bg-white", rounded, className)}>
        <Image src={candidate} alt={label} fill sizes={sizes} priority={priority} loading={priority ? undefined : "lazy"}
          className={cn("transition-transform duration-300 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100", fit === "cover" ? "object-cover" : "object-contain p-[3%]")}
          onError={() => setFailed(candidate)} />
      </div>
    );
  }
  return <ProductImageFallback brand={brand} productName={name} packSize={packSize} className={cn(rounded, className)} label={label} />;
}

/** Neutral "photo coming soon" tile. Deliberately plain so it never reads as fake packaging. The words sit
 *  under the pack size with room below, because a product card lays its delivery-time pill along the bottom edge. */
export function ProductImageFallback({ brand, productName, packSize, className, label }: { brand?: string | null; productName?: string | null; packSize?: string | null; className?: string; label?: string }) {
  const title = brand?.trim() || (productName ?? "").split(/[\s(]/)[0] || "MD";
  return (
    <div className={cn("@container relative flex flex-col items-center justify-center overflow-hidden bg-[#F3F3EF] pb-[10%] text-center", className)} role="img" aria-label={label ?? productImageAlt({ brand, productName, packSize })}>
      <span className="flex h-[38%] w-[62%] items-center justify-center rounded-[14%] border border-line bg-white/80 px-2 text-[clamp(10px,9cqw,20px)] font-bold uppercase tracking-wide text-ink-3 line-clamp-1">{title}</span>
      {packSize ? <span className="mt-[6%] hidden text-[clamp(9px,7cqw,14px)] font-semibold text-ink-4 @min-[96px]:block">{packSize}</span> : null}
      <span className="mt-[3%] hidden text-[clamp(8px,5cqw,11px)] text-ink-4 @min-[120px]:block">Photo coming soon</span>
    </div>
  );
}
