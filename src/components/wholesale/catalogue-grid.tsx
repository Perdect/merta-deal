import { ProductImage } from "@/components/shop/product-image";
import { formatINR } from "@/lib/utils";
import type { WholesaleCatalogueItem } from "@/lib/wholesale";

/** Wholesale range as cards: case size, minimum, stock in cases, and the case price when the viewer may see it. */
export function CatalogueGrid({ items, showPrices }: { items: WholesaleCatalogueItem[]; showPrices: boolean }) {
  if (items.length === 0) return <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">The wholesale range is being set up. Register your shop and we will tell you when it is ready.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <li key={p.product_id} className={`flex flex-col rounded-lg border border-line bg-card p-3 shadow-card ${p.is_available ? "" : "opacity-70"}`}>
          <ProductImage image={p.image_url} brand={p.brand_name} productName={p.name} packSize={p.pack_label} className="aspect-square w-full" />
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink">{p.name}</p>
          <p className="text-xs text-ink-3">{p.pack_label ? `${p.pack_label} · ` : ""}case of {p.case_size}</p>
          <p className="mt-1 text-xs text-ink-3">Min {p.moq_cases} case{p.moq_cases === 1 ? "" : "s"}{p.max_cases ? ` · max ${p.max_cases}` : ""}</p>
          <div className="mt-auto pt-2">
            {p.quote_required ? <p className="text-sm font-semibold text-saffron-700">Price on quote</p>
              : showPrices && p.price_per_case != null ? <p className="text-sm font-bold text-ink">{formatINR(p.price_per_case)} <span className="text-xs font-normal text-ink-3">/ case · {formatINR(p.unit_price ?? 0)} per unit</span></p>
              : <p className="text-xs text-ink-3">Wholesale price shown to approved shops</p>}
            <p className={`mt-0.5 text-[11px] ${p.is_available ? "text-ink-3" : "font-semibold text-danger"}`}>{!p.is_available ? "Not available right now" : p.in_stock_cases > 0 ? `${p.in_stock_cases} case${p.in_stock_cases === 1 ? "" : "s"} in stock` : "Out of stock · ask us"}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
