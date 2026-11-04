"use client";
import * as React from "react";
import type { ProductCard, ProductVariant } from "@/types/app";
import { AddToCart } from "./add-to-cart";
import { PackOptionsButton } from "./variant-sheet";
import { cn, formatINR } from "@/lib/utils";

/**
 * Weight / pack choice right on the card (500 g · 1 kg): chips pick a size, the price and stock shown
 * are that size's own listing (never derived from another size), and ADD puts that size in the cart
 * as its own line. Up to three sizes fit as chips; more open the size sheet instead.
 */
export function PackSelector({ product, options, signedIn }: { product: ProductCard; options: ProductVariant[]; signedIn?: boolean }) {
  const [id, setId] = React.useState(() => (options.find((v) => v.id === product.id && !out(v)) ?? options.find((v) => !out(v)) ?? options[0]).id);
  const v = options.find((o) => o.id === id) ?? options[0];
  const many = options.length > 3;
  const price = Number(v.selling_price ?? 0); const mrp = Number(v.mrp ?? price);
  return (
    <>
      {many ? null : (
        <div role="radiogroup" aria-label="Pack size" className="mt-1 flex flex-wrap gap-1">
          {options.map((o) => { const on = o.id === id; const dis = out(o); return (
            <button key={o.id} type="button" role="radio" aria-checked={on} aria-disabled={dis || undefined} onClick={() => !dis && setId(o.id)}
              className={cn("tap h-6 rounded-md border px-1.5 text-[11px] font-semibold leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600", on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line-2 bg-card text-ink-2", dis && "cursor-not-allowed text-ink-4 line-through")}>
              {o.pack_label ?? `${o.weight_value} ${o.weight_unit}`}
            </button>); })}
        </div>
      )}
      {!many && v.stock_status === "low_stock" && !out(v) ? <p className="mt-0.5 text-[11px] font-semibold text-saffron-700">Only {v.stock_qty} left</p> : null}
      <div className="mt-auto flex items-end justify-between gap-1.5 pt-2">
        <p className="min-w-0 leading-tight tabular">
          <span className="block text-[15px] font-bold text-ink">{formatINR(price)}</span>
          {mrp > price ? <span className="block text-[11px] text-ink-3 line-through"><span className="sr-only">MRP </span>{formatINR(mrp)}</span> : null}
        </p>
        {many
          ? <PackOptionsButton product={product} options={options} signedIn={signedIn} />
          : <AddToCart key={v.id} inventoryId={v.inventory_id} maxQty={v.max_order_qty} stockQty={v.stock_qty} size="sm" signedIn={signedIn} className="h-8 rounded-lg px-3.5 text-xs font-extrabold" stepperClassName="h-8 rounded-lg" />}
      </div>
    </>
  );
}

function out(v: ProductVariant) { return !v.inventory_id || v.stock_status === "out_of_stock" || (v.stock_qty ?? 0) <= 0; }
