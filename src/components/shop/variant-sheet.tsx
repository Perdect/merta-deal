"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProductVariant } from "@/types/app";
import { Modal } from "@/components/ui/overlay";
import { afterOverlayClose } from "@/hooks/use-back-to-close";
import { ProductImage } from "./product-image";
import { AddToCart } from "./add-to-cart";
import { cn, formatINR } from "@/lib/utils";
import { sizeName, sizeSoldOut, unitPrices } from "@/lib/pack";

/**
 * The sizes of one product, opened from the card's "ADD · N options" button: a bottom sheet on phones,
 * a small dialog from `sm` up. One row per listed size, each with its own picture, pack, price and Add.
 *
 * Every figure is that size's own listing, never worked out from another size:
 *   - the struck MRP shows only above the selling price, and "Save ₹N" is that same gap in rupees;
 *   - the per-unit line shows only when the pack's weight or volume is certain (see `packMeasure`);
 *   - a size that cannot be added says "Out of stock" and has no button.
 * Add is the ordinary `AddToCart`, so a size in the cart shows its quantity stepper here and on its page.
 */
export function VariantSheet({ open, onClose, name, options, signedIn }: { open: boolean; onClose: () => void; name: string; options: ProductVariant[]; signedIn?: boolean }) {
  const router = useRouter();
  const perUnit = unitPrices(options);
  // Closing pops the sheet's history entry; the product page is opened once that has landed, or the pop would undo it.
  const openSize = (e: React.MouseEvent, slug: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onClose();
    afterOverlayClose(() => router.push(`/p/${slug}`));
  };
  return (
    <Modal open={open} onClose={onClose} title={<span className="line-clamp-2">{name}</span>} className="sm:max-w-[26rem] [&_button[title=Close]]:bg-surface-2 [&_button[title=Close]]:h-11 [&_button[title=Close]]:w-11 [&_button[title=Close]]:shrink-0">
      <ul className="space-y-2.5 pt-1" style={{ paddingBottom: "var(--safe-bottom)" }}>
        {options.map((v, i) => {
          const price = Number(v.selling_price ?? 0); const mrp = Number(v.mrp ?? price);
          const out = sizeSoldOut(v); const size = sizeName(v); const saving = mrp - price;
          return (
            <li key={v.id} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5">
              <Link href={`/p/${v.slug}`} onClick={(e) => openSize(e, v.slug)} aria-label={`${name}, ${size}: details`}
                className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
                <ProductImage image={v.image_url} productName={name} packSize={v.pack_label} className={cn("h-16 w-16", out && "opacity-55 grayscale-[35%]")} rounded="rounded-xl" sizes="64px" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-semibold leading-snug", out ? "text-ink-3" : "text-ink")}>{size}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 leading-tight tabular">
                  <span className={cn("text-base font-bold", out ? "text-ink-3" : "text-ink")}>{formatINR(price)}</span>
                  {saving > 0 ? <span className="text-xs text-ink-3 line-through"><span className="sr-only">MRP </span>{formatINR(mrp)}</span> : null}
                  {saving > 0 && !out ? <span className="rounded-xs bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold leading-none text-brand-800">Save {formatINR(saving)}</span> : null}
                </p>
                {perUnit[i] ? <p className="mt-0.5 text-[11px] leading-tight text-ink-3 tabular">{perUnit[i]}</p> : null}
                {!out && v.stock_status === "low_stock" ? <p className="mt-0.5 text-[11px] font-semibold leading-tight text-saffron-700">Only {v.stock_qty} left</p> : null}
              </div>
              {out
                ? <span className="shrink-0 text-xs font-semibold text-ink-3">Out of stock</span>
                : <AddToCart inventoryId={v.inventory_id} maxQty={v.max_order_qty} stockQty={v.stock_qty} size="sm" signedIn={signedIn}
                    className="h-11 min-w-[76px] shrink-0 rounded-lg px-3 text-sm font-extrabold" stepperClassName="h-11 shrink-0 rounded-lg [&>button]:h-full [&>button]:w-10" />}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
