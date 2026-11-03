"use client";
import * as React from "react";
import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import type { ProductCard, ProductVariant } from "@/types/app";
import { useCartStore } from "@/stores/cart-store";
import { BottomSheet } from "@/components/ui/overlay";
import { DiscountBadge } from "@/components/ui/badge";
import { ProductImage } from "./product-image";
import { AddToCart } from "./add-to-cart";
import { cn, formatINR } from "@/lib/utils";

/**
 * "ADD · 2 options" on a card whose product comes in several sizes. Tapping opens a sheet with one
 * row per size (pack, price, MRP, ADD); each row is the ordinary ADD → stepper backed by the server
 * cart. Once any size is in the cart the card shows the family's total as a stepper-shaped pill;
 * − and + reopen the sheet, where each size is adjusted on its own.
 */
export function PackOptionsButton({ product, options, signedIn }: { product: ProductCard; options: ProductVariant[]; signedIn?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const total = useCartStore((s) => options.reduce((n, v) => n + (v.inventory_id ? s.qtyFor(v.inventory_id) : 0), 0));
  const allOut = options.every((v) => v.stock_status === "out_of_stock" || (v.stock_qty ?? 0) <= 0);
  return (
    <>
      {allOut ? (
        <span className="inline-flex h-8 items-center justify-center rounded-lg border border-line-2 bg-surface-2 px-3 text-xs font-semibold text-ink-3">Out of stock</span>
      ) : total > 0 ? (
        <button type="button" onClick={() => setOpen(true)} aria-label={`${total} in cart across ${options.length} pack sizes. Change`}
          className="tap inline-flex h-8 items-center rounded-lg bg-brand-600 text-white shadow-[0_1px_0_rgb(0_0_0/0.05)] motion-safe:animate-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          <span className="flex h-8 w-8 items-center justify-center"><Minus className="h-4 w-4" aria-hidden /></span>
          <span className="min-w-7 text-center text-sm font-bold tabular">{total}</span>
          <span className="flex h-8 w-8 items-center justify-center"><Plus className="h-4 w-4" aria-hidden /></span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label={`Add ${product.name}: choose from ${options.length} pack sizes`}
          className="tap inline-flex h-9 flex-col items-center justify-center rounded-lg border border-brand-600 bg-brand-50 px-3 leading-none text-brand-700 transition-[background-color,transform] duration-150 hover:bg-brand-100 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          <span className="text-xs font-extrabold">ADD</span>
          <span className="mt-0.5 text-[10px] font-semibold text-brand-700/80">{options.length} options</span>
        </button>
      )}
      <VariantSheet open={open} onClose={() => setOpen(false)} name={product.name} options={options} signedIn={signedIn} />
    </>
  );
}

/** One row per size: image (discount badge, count in cart), pack label, price and MRP, ADD / stepper. */
export function VariantSheet({ open, onClose, name, options, signedIn }: { open: boolean; onClose: () => void; name: string; options: ProductVariant[]; signedIn?: boolean }) {
  const qtys = useCartStore((s) => options.map((v) => (v.inventory_id ? s.qtyFor(v.inventory_id) : 0)));
  return (
    <BottomSheet open={open} onClose={onClose} title={name} className="sm:max-w-md">
      <ul className="-mx-1 space-y-2.5 pb-1">
        {options.map((v, i) => {
          const price = Number(v.selling_price ?? 0); const mrp = Number(v.mrp ?? price);
          const out = v.stock_status === "out_of_stock" || (v.stock_qty ?? 0) <= 0;
          return (
            <li key={v.id} className={cn("flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5", out && "opacity-70")}>
              <Link href={`/p/${v.slug}`} onClick={onClose} className="relative shrink-0 overflow-hidden rounded-xl" aria-label={`${name} ${v.pack_label ?? ""}, details`}>
                <ProductImage image={v.image_url} productName={name} packSize={v.pack_label} className="h-[72px] w-[72px]" sizes="72px" />
                <DiscountBadge pct={Number(v.discount_pct ?? 0)} className="absolute left-0 top-0 rounded-none rounded-br-lg bg-info px-1.5 py-1 text-[10px]" />
                {qtys[i] > 0 ? <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white" aria-hidden>×{qtys[i]}</span> : null}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{v.pack_label ?? `${v.weight_value} ${v.weight_unit}`}</p>
                <p className="mt-0.5 tabular"><span className="text-[15px] font-bold text-ink">{formatINR(price)}</span>{mrp > price ? <span className="ml-1.5 text-xs text-ink-3 line-through"><span className="sr-only">MRP </span>{formatINR(mrp)}</span> : null}</p>
                {!out && v.stock_status === "low_stock" ? <p className="text-[11px] font-semibold text-saffron-700">Only {v.stock_qty} left</p> : null}
              </div>
              <AddToCart inventoryId={v.inventory_id} maxQty={v.max_order_qty} stockQty={v.stock_qty} size="sm" signedIn={signedIn} className="h-9 rounded-lg px-4 text-xs font-extrabold" stepperClassName="h-9 rounded-lg" />
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
