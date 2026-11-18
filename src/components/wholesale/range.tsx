"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, FileQuestion, PackageSearch, X } from "lucide-react";
import { ProductImage } from "@/components/shop/product-image";
import { QuantityStepper } from "@/components/ui/misc";
import { Button, IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCartStore } from "@/stores/cart-store";
import { saveWholesaleDraft, type WholesaleCatalogueItem } from "@/lib/wholesale";
import { formatINR, cn } from "@/lib/utils";

type Line = { product_id: string; cases: number };

/** "500 g" is worth showing; a bare "1" next to "case of 10" only confuses, so it is dropped. */
const packLabel = (l: string | null) => (l && /[^\d\s.]/.test(l) ? l : null);

/**
 * The wholesale range: one card per product with everything a buyer needs to decide — the pack, the case
 * size, the minimum, what is in stock, and whether the price is settled or still has to be quoted.
 *
 * Every figure is the row the owner saved in Admin → Wholesale; a product with no wholesale price shows
 * none and is marked as needing a quote instead of being given one here. Picking cases builds the same
 * draft the builder on `/wholesale/order` reads, so the order carries over — through sign-in too — and
 * there is one place where an order is reviewed and sent, not two.
 */
export function WholesaleRange({ items, minOrder }: { items: WholesaleCatalogueItem[]; minOrder: number }) {
  const router = useRouter();
  const [lines, setLines] = React.useState<Line[]>([]);
  // The retail cart bar owns the space above the bottom nav on phones; this bar stacks above it rather
  // than covering it, so an ordinary shopping cart is never hidden by a wholesale selection.
  const retailBar = useCartStore((s) => s.totalCount()) > 0;
  const byId = React.useMemo(() => Object.fromEntries(items.map((i) => [i.product_id, i])), [items]);
  const casesOf = (id: string) => lines.find((l) => l.product_id === id)?.cases ?? 0;

  const set = (p: WholesaleCatalogueItem, v: number) => {
    // Below the minimum there is nothing to order, so stepping down past it empties the line.
    const cur = casesOf(p.product_id);
    const next = v <= 0 || (v < p.moq_cases && v < cur) ? 0 : Math.max(v, p.moq_cases);
    setLines((ls) => next === 0 ? ls.filter((l) => l.product_id !== p.product_id)
      : ls.some((l) => l.product_id === p.product_id) ? ls.map((l) => (l.product_id === p.product_id ? { ...l, cases: next } : l))
      : [...ls, { product_id: p.product_id, cases: next }]);
  };

  const confirmed = lines.filter((l) => byId[l.product_id]?.price_per_case != null);
  const toQuote = lines.filter((l) => byId[l.product_id]?.price_per_case == null);
  const subtotal = confirmed.reduce((a, l) => a + (byId[l.product_id]!.price_per_case ?? 0) * l.cases, 0);
  const totalCases = lines.reduce((a, l) => a + l.cases, 0);

  const review = () => {
    saveWholesaleDraft({ lines });
    router.push("/wholesale/order");
  };

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
        No products are listed for wholesale yet. Write in what you need every month and we will price it.
      </p>
    );
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => {
          const cases = casesOf(p.product_id);
          const quote = p.price_per_case == null;
          const canOrder = p.is_available;
          // Stock is what the shop holds today; the day's stock is confirmed again before packing, so the
          // ceiling is the owner's max per order, never a number we invented.
          const ceiling = Math.min(p.max_cases ?? 99, Math.max(p.in_stock_cases, p.moq_cases));
          return (
            <li key={p.product_id} className={cn("flex gap-3 rounded-xl border bg-card p-3 shadow-card transition", cases > 0 ? "border-brand-600 ring-1 ring-brand-600" : "border-line", !canOrder && "opacity-75")}>
              <ProductImage image={p.image_url} brand={p.brand_name} productName={p.name} packSize={p.pack_label} className="h-[84px] w-[84px] shrink-0" rounded="rounded-lg" sizes="84px" />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{p.name}</p>
                <p className="mt-0.5 text-xs text-ink-3">
                  {p.brand_name ? `${p.brand_name} · ` : ""}{packLabel(p.pack_label) ? `${packLabel(p.pack_label)} · ` : ""}case of {p.case_size}
                </p>

                <div className="mt-1.5">
                  {quote ? (
                    <>
                      <Badge tone="saffron" className="gap-1"><FileQuestion className="h-3 w-3" aria-hidden />Price on quote</Badge>
                      <p className="mt-1 text-xs text-ink-3">We send the case price for your approval before anything is packed.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[15px] font-extrabold leading-none text-ink">
                        {formatINR(p.price_per_case ?? 0)} <span className="text-xs font-semibold text-ink-3">/ case</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-3">
                        {p.unit_price != null ? <span className="font-semibold text-ink-2">{formatINR(p.unit_price)} per {packLabel(p.pack_label) ?? "unit"}</span> : null}
                        {p.retail_price != null ? <span>retail {formatINR(p.retail_price)} each</span> : null}
                        <Badge tone="success" size="xs" className="gap-1"><BadgeCheck className="h-3 w-3" aria-hidden />Price confirmed</Badge>
                      </p>
                    </>
                  )}
                </div>

                <p className="mt-1.5 text-xs text-ink-3">
                  Min {p.moq_cases} case{p.moq_cases === 1 ? "" : "s"}{p.max_cases ? ` · max ${p.max_cases}` : ""}
                  {" · "}
                  <span className={cn(!canOrder && "font-semibold text-danger")}>
                    {!canOrder ? "not available right now" : p.in_stock_cases > 0 ? `${p.in_stock_cases} case${p.in_stock_cases === 1 ? "" : "s"} in stock` : "none in stock today"}
                  </span>
                </p>

                <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                  <span className="text-xs text-ink-3" aria-live="polite">
                    {cases > 0 ? `${cases * p.case_size} units${quote ? "" : ` · ${formatINR((p.price_per_case ?? 0) * cases)}`}` : ""}
                  </span>
                  {canOrder ? (
                    cases > 0
                      ? <QuantityStepper value={cases} onChange={(v) => set(p, v)} min={0} max={ceiling} size="sm" maxLabel={`Most we take in one order: ${ceiling} case${ceiling === 1 ? "" : "s"}`} />
                      : <Button size="sm" variant="outline" className="rounded-lg" onClick={() => set(p, p.moq_cases)} aria-label={`Add ${p.moq_cases} case${p.moq_cases === 1 ? "" : "s"} of ${p.name} to your order`}>
                          Add {p.moq_cases} case{p.moq_cases === 1 ? "" : "s"}
                        </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {lines.length > 0 ? (
        <>
          {/* Takes the bar's height in the flow so the last card is never hidden behind it. */}
          <div aria-hidden className="h-20 md:h-24" />
          <section role="region" aria-label="Your wholesale order"
            className={cn(
              "fixed inset-x-0 z-30 border border-line bg-card/95 px-4 py-3 shadow-[0_-6px_24px_rgba(16,60,36,0.14)] backdrop-blur md:inset-x-0 md:bottom-0 md:rounded-none md:border-x-0 md:border-b-0",
              "mx-2 rounded-2xl md:mx-0",
              retailBar
                ? "bottom-[calc(var(--bottom-nav-h)_+_var(--safe-bottom)_+_var(--cart-bar-h)_+_14px)]"
                : "bottom-[calc(var(--bottom-nav-h)_+_var(--safe-bottom)_+_8px)]",
            )}>
            <div className="mx-auto flex max-w-6xl items-center gap-2 sm:gap-3">
              <div className="min-w-0 flex-1" aria-live="polite">
                <p className="truncate text-sm font-bold text-ink">
                  {totalCases} case{totalCases === 1 ? "" : "s"}{subtotal > 0 ? ` · ${formatINR(subtotal)}` : ""}
                </p>
                <p className="truncate text-xs text-ink-3">
                  {lines.length} product{lines.length === 1 ? "" : "s"}
                  {toQuote.length > 0 ? ` · ${toQuote.length} on quote` : ""}
                  {minOrder > 0 && toQuote.length === 0 && subtotal < minOrder ? ` · ${formatINR(minOrder)} min` : ""}
                </p>
              </div>
              <IconButton label="Clear this selection" onClick={() => setLines([])}><X className="h-4 w-4" aria-hidden /></IconButton>
              <Button size="lg" className="shrink-0 rounded-xl" onClick={review}>Review order <ArrowRight className="h-4 w-4" aria-hidden /></Button>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

/** The one-line legend above the range, so the two kinds of price card are readable at a glance. */
export function RangeLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-3">
      <span className="inline-flex items-center gap-1"><Badge tone="success" size="xs" className="gap-1"><BadgeCheck className="h-3 w-3" aria-hidden />Price confirmed</Badge> order it at that price</span>
      <span className="inline-flex items-center gap-1"><Badge tone="saffron" size="xs" className="gap-1"><FileQuestion className="h-3 w-3" aria-hidden />On quote</Badge> we price it, then you approve</span>
      <span className="inline-flex items-center gap-1"><PackageSearch className="h-3.5 w-3.5" aria-hidden /> add both to one order</span>
    </p>
  );
}
