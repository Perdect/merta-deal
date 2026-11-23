"use client";
import * as React from "react";
import { Minus, Plus } from "lucide-react";
import type { ProductVariant } from "@/types/app";
import { useCartStore } from "@/stores/cart-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { VariantSheet } from "./variant-sheet";
import { sizeSoldOut } from "@/lib/pack";
import { cn } from "@/lib/utils";

/**
 * The card's button for a product that comes in several sizes: "ADD" over "2 options". It adds nothing
 * itself; it opens the size sheet, where each size has its own Add. The number is the sizes that can be
 * added right now (the sheet also lists the sold-out ones, marked as such). Once any size is in the cart
 * the button becomes the family's total in a stepper-shaped pill; tapping it reopens the sheet, where
 * each size is changed on its own.
 */
export function PackSelector({ name, options, signedIn, className }: { name: string; options: ProductVariant[]; signedIn?: boolean; className?: string }) {
  const [open, setOpen] = React.useState(false);
  // The server always renders the ADD button; a cart that has already loaded when this card hydrates is read just after.
  const hydrated = useHydrated();
  const inCart = useCartStore((s) => options.reduce((n, v) => n + (v.inventory_id ? s.qtyFor(v.inventory_id) : 0), 0));
  const total = hydrated ? inCart : 0;
  const count = options.filter((v) => !sizeSoldOut(v)).length;
  const shape = "tap inline-flex h-10 shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
  return (
    <>
      {count === 0 ? (
        <span className={cn("inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-line-2 bg-surface-2 px-3 text-xs font-semibold text-ink-3", className)}>Out of stock</span>
      ) : total > 0 ? (
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${total} in cart. Change the sizes of ${name}`}
          className={cn(shape, "items-center bg-brand-600 text-white shadow-[0_1px_0_rgb(0_0_0/0.05)] motion-safe:animate-pop", className)}>
          <span className="flex h-full w-8 items-center justify-center"><Minus className="h-4 w-4" aria-hidden /></span>
          <span className="min-w-7 text-center text-sm font-bold tabular">{total}</span>
          <span className="flex h-full w-8 items-center justify-center"><Plus className="h-4 w-4" aria-hidden /></span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Add ${name}: ${count} ${count === 1 ? "option" : "options"}`}
          className={cn(shape, "min-w-[68px] flex-col items-center justify-center gap-[3px] border border-brand-600 bg-brand-50 px-2.5 leading-none text-brand-700 transition-[background-color,transform] duration-150 hover:bg-brand-100 motion-safe:active:scale-95 motion-reduce:transition-none", className)}>
          <span className="text-xs font-extrabold">ADD</span>
          <span className="whitespace-nowrap text-[11px] font-semibold text-brand-800">{count} {count === 1 ? "option" : "options"}</span>
        </button>
      )}
      {/* Mounted only while open: a grid of cards carries no dialog machinery until one is asked for. */}
      {open ? <VariantSheet open onClose={() => setOpen(false)} name={name} options={options} signedIn={signedIn} /> : null}
    </>
  );
}
