"use client";
import Link from "next/link";
import { SearchX, WifiOff } from "lucide-react";
import type { AssistantLine } from "@/lib/ai/assistant-types";
import { packLimit } from "@/lib/cart-sync";
import { formatINR } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
import { Badge, VegMark } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/input";
import { Price, QuantityStepper } from "@/components/ui/misc";
import { ProductImage } from "@/components/shop/product-image";
import { canBuy } from "./plan-add-all";

/** What the customer has decided for one row: which product, how many packs, and whether it goes in the cart. */
export type LineChoice = { candidate: number; packs: number; selected: boolean };

function asked(line: AssistantLine) {
  const { quantity, unit, query } = line.item;
  return unit ? `${quantity} ${unit} ${query}` : `${quantity} × ${query}`;
}

/**
 * One row of a proposed list: what was asked for, the catalogue product offered for it with today's
 * price, pack and stock, and the customer's choice. A row with no product says so; nothing is invented.
 */
export function MatchRow({ line, choice, onChange, from }: { line: AssistantLine; choice: LineChoice; onChange: (c: LineChoice) => void; from: "request" | "orders" }) {
  const c = line.candidates[choice.candidate] ?? line.candidates[0];
  const inCart = useCartStore((s) => (c?.inventory_id ? s.qtyFor(c.inventory_id) : 0));
  if (!c) {
    return (
      <li className="flex items-center gap-3 rounded-md border border-dashed border-line-2 bg-surface-2/60 px-3 py-2.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-4">{line.lookup_failed ? <WifiOff className="h-5 w-5" /> : <SearchX className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{from === "orders" ? line.item.query : asked(line)}</p>
          {line.item.note && from === "request" ? <p className="text-[11px] text-ink-4">{line.item.note}</p> : null}
          <p className="text-xs text-ink-3">
            {line.lookup_failed ? "We could not check the shop for this just now. " : "Not in our shop right now. "}
            {from === "request" ? <Link href={`/search?q=${encodeURIComponent(line.item.query)}`} className="font-medium text-brand-700 hover:underline">Search the shop</Link> : null}
          </p>
        </div>
      </li>
    );
  }
  const available = canBuy(c);
  const limit = packLimit(c.max_order_qty, c.stock_qty);
  return (
    <li className="rounded-md border border-line bg-card p-2.5 shadow-card sm:p-3">
      <div className="flex gap-3">
        <Checkbox checked={available && choice.selected} disabled={!available} onChange={(e) => onChange({ ...choice, selected: e.target.checked })} aria-label={`Add ${c.name} to the cart`} className="shrink-0 self-start pt-1" />
        <Link href={`/p/${c.slug}`} className="shrink-0" aria-label={c.name}>
          <ProductImage image={c.image_url} brand={c.brand_name} productName={c.name} packSize={c.pack_label} className="h-16 w-16 rounded-md sm:h-20 sm:w-20" sizes="80px" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-ink-3">
            {from === "orders" ? <>You ordered this before{line.item.note ? <span className="text-ink-4"> · {line.item.note}</span> : null}</> : <>You asked: <span className="font-medium text-ink-2">{asked(line)}</span>{line.item.note ? <span className="text-ink-4"> · {line.item.note}</span> : null}</>}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <VegMark veg={c.is_veg} />
            <Link href={`/p/${c.slug}`} className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{c.name}</Link>
          </div>
          <p className="text-xs text-ink-3">{[c.pack_label, c.brand_name].filter(Boolean).join(" · ")}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Price price={c.selling_price ?? c.mrp} mrp={c.mrp} size="sm" />
            {!available ? <Badge tone="danger" size="xs">Out of stock</Badge>
              : c.stock_status === "low_stock" && c.stock_qty != null ? <Badge tone="saffron" size="xs">Only {c.stock_qty} left</Badge>
              : <Badge tone="success" size="xs">In stock</Badge>}
            {inCart > 0 ? <span className="text-[11px] font-semibold text-brand-700">{inCart} in your cart</span> : null}
          </div>
        </div>
      </div>
      {line.candidates.length > 1 || available ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          {line.candidates.length > 1 ? (
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-ink-3">
              <span className="shrink-0">Other options</span>
              <select value={choice.candidate} onChange={(e) => { const idx = Number(e.target.value); const next = line.candidates[idx]; onChange({ candidate: idx, packs: next?.suggested_packs ?? 1, selected: canBuy(next) && choice.selected }); }} className="h-10 min-w-0 flex-1 rounded-sm border border-line-2 bg-card px-2 text-base text-ink focus:border-brand-500 focus:outline-none sm:h-8 sm:text-xs" aria-label={`Other products for ${line.item.query}`}>
                {line.candidates.map((alt, i) => <option key={alt.inventory_id ?? alt.id} value={i}>{[alt.name, alt.pack_label, formatINR(alt.selling_price ?? alt.mrp), canBuy(alt) ? null : "out of stock"].filter(Boolean).join(" · ")}</option>)}
              </select>
            </label>
          ) : <span className="flex-1" />}
          {available ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink-3">Packs</span>
              <QuantityStepper value={Math.min(choice.packs, Math.max(1, limit.max))} min={1} max={Math.max(1, limit.max)} maxLabel={limit.message} size="sm" onChange={(v) => onChange({ ...choice, packs: v })} className="bg-ink text-white" />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
