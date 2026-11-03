"use client";
import Link from "next/link";
import { SearchX } from "lucide-react";
import type { MatchedLine } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";
import { VegMark } from "@/components/ui/badge";
import { Price, QuantityStepper } from "@/components/ui/misc";
import { ProductImage } from "@/components/shop/product-image";
import { AddToCart } from "@/components/shop/add-to-cart";

export type LineChoice = { candidate: number; packs: number };

function describe(line: MatchedLine) {
  const { quantity, unit } = line.item;
  return unit ? `${quantity} ${unit}` : `${quantity} ×`;
}

/** One list line: requested item, best match (or alternative), planned packs and the cart button. */
export function MatchRow({ line, choice, onChange, signedIn }: { line: MatchedLine; choice: LineChoice; onChange: (c: LineChoice) => void; signedIn: boolean }) {
  const c = line.candidates[choice.candidate] ?? line.candidates[0];
  if (!c) {
    return (
      <li className="flex items-center gap-3 rounded-md border border-dashed border-line-2 bg-surface-2/60 px-3 py-2.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-4"><SearchX className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{line.item.query} <span className="font-normal text-ink-3">· {describe(line)}</span></p>
          <p className="text-xs text-ink-3">No in-stock match right now. <Link href={`/search?q=${encodeURIComponent(line.item.query)}`} className="font-medium text-brand-700 hover:underline">Search manually</Link></p>
        </div>
      </li>
    );
  }
  const max = Math.max(1, Math.min(c.max_order_qty ?? 10, c.stock_qty ?? 99));
  return (
    <li className={cn("rounded-md border border-line bg-card p-2.5 shadow-card sm:p-3")}>
      <div className="flex gap-3">
        <Link href={`/p/${c.slug}`} className="shrink-0" aria-label={c.name}>
          <ProductImage image={c.image_url} brand={c.brand_name} productName={c.name} packSize={c.pack_label} className="h-16 w-16 rounded-md sm:h-20 sm:w-20" sizes="80px" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-ink-3">You asked: <span className="font-medium text-ink-2">{describe(line)} {line.item.query}</span>{line.item.note ? <span className="text-ink-4"> · {line.item.note}</span> : null}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <VegMark veg={c.is_veg} />
            <Link href={`/p/${c.slug}`} className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{c.name}</Link>
          </div>
          <p className="text-xs text-ink-3">{c.pack_label}{c.brand_name ? ` · ${c.brand_name}` : ""}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Price price={c.selling_price ?? c.mrp} mrp={c.mrp} size="sm" />
            {c.stock_status === "low_stock" ? <span className="text-[11px] font-semibold text-saffron-700">Only {c.stock_qty} left</span> : null}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
        {line.candidates.length > 1 ? (
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-ink-3">
            <span className="shrink-0">Alternative</span>
            <select value={choice.candidate} onChange={(e) => { const idx = Number(e.target.value); onChange({ candidate: idx, packs: line.candidates[idx]?.suggested_packs ?? 1 }); }} className="h-8 min-w-0 flex-1 rounded-sm border border-line-2 bg-card px-2 text-xs text-ink focus:border-brand-500 focus:outline-none" aria-label={`Alternative products for ${line.item.query}`}>
              {line.candidates.map((alt, i) => <option key={alt.inventory_id ?? alt.id} value={i}>{alt.name} · {alt.pack_label ?? ""} · ₹{Number(alt.selling_price ?? alt.mrp ?? 0)}</option>)}
            </select>
          </label>
        ) : <span className="flex-1 text-xs text-ink-4">Only match in stock</span>}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-3">Packs</span>
          <QuantityStepper value={choice.packs} min={1} max={max} size="sm" onChange={(v) => onChange({ ...choice, packs: v })} className="bg-ink text-white" />
          <AddToCart inventoryId={c.inventory_id} maxQty={c.max_order_qty} stockQty={c.stock_qty} size="sm" signedIn={signedIn} />
        </div>
      </div>
    </li>
  );
}
