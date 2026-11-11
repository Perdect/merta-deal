import Link from "next/link";
import type { ProductVariant } from "@/types/app";
import { cn, formatINR } from "@/lib/utils";
import { weightLabel } from "@/lib/cake";

/** "Select unit" on the product page: every size of the product as a chip; the current one is highlighted. */
export function PackChips({ current, options, className }: { current: string; options: ProductVariant[]; className?: string }) {
  const sizes = options.filter((v) => v.inventory_id);
  if (sizes.length < 2) return null;
  // Cakes and loose packs are sized by weight (lb / kg / g): say so; mixed units keep the generic label.
  const byWeight = sizes.every((v) => ["lb", "kg", "g"].includes(v.weight_unit));
  return (
    <div className={className}>
      <p className="text-sm font-bold text-ink">{byWeight ? "Weight" : "Select unit"}</p>
      <ul className="mt-2 flex flex-wrap gap-2" aria-label="Pack sizes">
        {sizes.map((v) => {
          const on = v.id === current; const price = Number(v.selling_price ?? 0); const mrp = Number(v.mrp ?? price);
          const out = v.stock_status === "out_of_stock" || (v.stock_qty ?? 0) <= 0;
          return (
            <li key={v.id}>
              <Link href={`/p/${v.slug}`} aria-current={on ? "page" : undefined} scroll={false}
                className={cn("tap flex min-w-[88px] flex-col rounded-xl border px-3 py-2 text-left leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600", on ? "border-brand-600 bg-brand-50" : "border-line bg-card hover:border-line-2", out && "opacity-60")}>
                <span className="text-sm font-bold text-ink">{v.pack_label ?? weightLabel(v.weight_value, v.weight_unit)}</span>
                <span className="mt-0.5 tabular text-xs text-ink-2"><span className="font-bold text-ink">{formatINR(price)}</span>{mrp > price ? <span className="ml-1 text-ink-3 line-through">{formatINR(mrp)}</span> : null}</span>
                {out ? <span className="text-[10px] font-semibold text-ink-3">Out of stock</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
