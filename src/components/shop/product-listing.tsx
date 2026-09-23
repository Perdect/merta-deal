"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, ArrowUpDown, Check } from "lucide-react";
import type { ProductCard as ProductCardType, SearchResult } from "@/types/app";
import { ProductGrid } from "./product-card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/tabs";
import { Drawer, BottomSheet } from "@/components/ui/overlay";
import { Checkbox } from "@/components/ui/input";
import { EmptyState, ProductGridSkeleton } from "@/components/ui/states";
import { cn } from "@/lib/utils";

const SORTS = [
  { value: "relevance", label: "Relevance" }, { value: "popular", label: "Popularity" }, { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" }, { value: "newest", label: "Newest first" }, { value: "discount", label: "Discount" },
];
const PRICE_BANDS = [{ label: "Under ₹50", min: 0, max: 50 }, { label: "₹50 – ₹100", min: 50, max: 100 }, { label: "₹100 – ₹250", min: 100, max: 250 }, { label: "₹250 – ₹500", min: 250, max: 500 }, { label: "Above ₹500", min: 500, max: undefined as number | undefined }];
const DISCOUNTS = [10, 20, 30];

export type ListingFilters = { brands: { name: string; slug: string }[]; stores?: { name: string; id: string }[]; categories?: { name: string; slug: string }[] };

/** URL-driven filters + sorting + paged grid. Server fetches; this component only manipulates search params and renders. */
export function ProductListing({ result, filters, signedIn, wished, loadMoreHref, hideCategoryChips, emptyTitle = "No products found", emptyHint }: { result: SearchResult; filters: ListingFilters; signedIn: boolean; wished: Set<string>; loadMoreHref?: string; hideCategoryChips?: boolean; emptyTitle?: string; emptyHint?: string }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [sortOpen, setSortOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [items, setItems] = React.useState<ProductCardType[]>(result.items);
  const [page, setPage] = React.useState(result.page);
  const [hasMore, setHasMore] = React.useState(result.has_more);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [seen, setSeen] = React.useState(result);
  if (seen !== result) { setSeen(result); setItems(result.items); setPage(result.page); setHasMore(result.has_more); }

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const toggleList = (key: string, value: string) => {
    const cur = sp.get(key)?.split(",").filter(Boolean) ?? [];
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
    set({ [key]: next.join(",") });
  };
  const sort = sp.get("sort") ?? "relevance";
  const activeBrands = sp.get("brand")?.split(",").filter(Boolean) ?? [];
  const activeCount = [sp.get("brand"), sp.get("minPrice") ?? sp.get("maxPrice"), sp.get("minDiscount"), sp.get("inStock"), sp.get("store"), sp.get("local")].filter(Boolean).length;

  const loadMore = async () => {
    setLoadingMore(true);
    const next = new URLSearchParams(sp.toString()); next.set("page", String(page + 1));
    const r = await fetch(`${loadMoreHref ?? "/api/search"}?${next.toString()}`);
    const d = (await r.json()) as SearchResult;
    setItems((cur) => [...cur, ...d.items]); setPage(d.page); setHasMore(d.has_more); setLoadingMore(false);
  };

  return (
    <div>
      <div className="sticky top-[128px] z-20 -mx-4 mb-3 flex items-center gap-2 bg-surface/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 md:top-[64px]">
        <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)} className={cn(activeCount && "border-brand-600 text-brand-700")}><SlidersHorizontal className="h-4 w-4" /> Filters{activeCount ? ` (${activeCount})` : ""}</Button>
        <Button variant="outline" size="sm" onClick={() => setSortOpen(true)}><ArrowUpDown className="h-4 w-4" /> {SORTS.find((s) => s.value === sort)?.label ?? "Sort"}</Button>
        <div className="scroll-x ml-1 flex-1">
          <Chip active={sp.get("inStock") === "1"} onClick={() => set({ inStock: sp.get("inStock") === "1" ? null : "1" })}>In stock</Chip>
          <Chip active={sp.get("minDiscount") === "10"} onClick={() => set({ minDiscount: sp.get("minDiscount") === "10" ? null : "10" })}>10%+ off</Chip>
          <Chip active={sp.get("local") === "1"} onClick={() => set({ local: sp.get("local") === "1" ? null : "1" })}>Local</Chip>
          {!hideCategoryChips && filters.categories?.slice(0, 8).map((c) => <Chip key={c.slug} active={sp.get("category") === c.slug} onClick={() => set({ category: sp.get("category") === c.slug ? null : c.slug })}>{c.name}</Chip>)}
        </div>
      </div>

      <p className="mb-3 text-xs text-ink-3">{result.total} product{result.total === 1 ? "" : "s"}{pending ? " · updating…" : ""}</p>

      {pending && items.length === 0 ? <ProductGridSkeleton /> : items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyHint ?? "Try removing a filter, or search with a different word — Hindi words like aata, chini and lal mirch work too."} action={activeCount ? <Button variant="outline" onClick={() => startTransition(() => router.replace(pathname))}>Clear filters</Button> : null} />
      ) : (
        <>
          <ProductGrid products={items} signedIn={signedIn} wished={wished} className={cn(pending && "opacity-60")} />
          {hasMore ? <div className="mt-6 flex justify-center"><Button variant="outline" loading={loadingMore} onClick={loadMore}>Load more</Button></div> : null}
        </>
      )}

      <Drawer open={filterOpen} onClose={() => setFilterOpen(false)} title="Filters" footer={
        <div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => { startTransition(() => router.replace(pathname)); setFilterOpen(false); }}>Clear all</Button><Button fullWidth onClick={() => setFilterOpen(false)}>Show {result.total} products</Button></div>
      }>
        <div className="space-y-6 px-4 py-4">
          <FilterGroup title="Availability"><Checkbox label="In stock only" checked={sp.get("inStock") === "1"} onChange={(e) => set({ inStock: e.target.checked ? "1" : null })} /><Checkbox label="Local products of Merta" checked={sp.get("local") === "1"} onChange={(e) => set({ local: e.target.checked ? "1" : null })} /></FilterGroup>
          <FilterGroup title="Price">{PRICE_BANDS.map((b) => { const active = sp.get("minPrice") === String(b.min) && (sp.get("maxPrice") ?? "") === (b.max?.toString() ?? ""); return <Checkbox key={b.label} label={b.label} checked={active} onChange={() => set(active ? { minPrice: null, maxPrice: null } : { minPrice: String(b.min), maxPrice: b.max?.toString() ?? null })} />; })}</FilterGroup>
          <FilterGroup title="Discount">{DISCOUNTS.map((d) => <Checkbox key={d} label={`${d}% or more`} checked={sp.get("minDiscount") === String(d)} onChange={() => set({ minDiscount: sp.get("minDiscount") === String(d) ? null : String(d) })} />)}</FilterGroup>
          {filters.brands.length ? <FilterGroup title="Brand">{filters.brands.map((b) => <Checkbox key={b.slug} label={b.name} checked={activeBrands.includes(b.slug)} onChange={() => toggleList("brand", b.slug)} />)}</FilterGroup> : null}
          {filters.stores?.length ? <FilterGroup title="Store">{filters.stores.map((s) => <Checkbox key={s.id} label={s.name} checked={sp.get("store") === s.id} onChange={() => set({ store: sp.get("store") === s.id ? null : s.id })} />)}</FilterGroup> : null}
          {filters.categories?.length ? <FilterGroup title="Category">{filters.categories.map((c) => <Checkbox key={c.slug} label={c.name} checked={sp.get("category") === c.slug} onChange={() => set({ category: sp.get("category") === c.slug ? null : c.slug })} />)}</FilterGroup> : null}
        </div>
      </Drawer>

      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <ul className="divide-y divide-line">
          {SORTS.map((s) => <li key={s.value}><button type="button" onClick={() => { set({ sort: s.value === "relevance" ? null : s.value }); setSortOpen(false); }} className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-ink">{s.label}{sort === s.value ? <Check className="h-4 w-4 text-brand-600" /> : null}</button></li>)}
        </ul>
      </BottomSheet>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">{title}</legend><div className="grid gap-2.5">{children}</div></fieldset>;
}
