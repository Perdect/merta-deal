"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, ArrowUpDown, Check } from "lucide-react";
import type { ProductCard as ProductCardType, SearchResult } from "@/types/app";
import { ProductGrid } from "./product-card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/tabs";
import { Drawer, BottomSheet } from "@/components/ui/overlay";
import { useMedia } from "@/hooks/use-media";
import { Checkbox } from "@/components/ui/input";
import { EmptyState, ErrorState, ProductGridSkeleton } from "@/components/ui/states";
import { cn } from "@/lib/utils";
import { afterOverlayClose } from "@/hooks/use-back-to-close";

const SORTS = [
  { value: "relevance", label: "Relevance" }, { value: "popular", label: "Popularity" }, { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" }, { value: "newest", label: "Newest first" }, { value: "discount", label: "Discount" },
];
const PRICE_BANDS = [{ label: "Under ₹50", min: 0, max: 50 }, { label: "₹50 – ₹100", min: 50, max: 100 }, { label: "₹100 – ₹250", min: 100, max: 250 }, { label: "₹250 – ₹500", min: 250, max: 500 }, { label: "Above ₹500", min: 500, max: undefined as number | undefined }];
const DISCOUNTS = [10, 20, 30];

export type ListingFilters = { brands: { name: string; slug: string }[]; categories?: { name: string; slug: string }[] };

/* ------------------------------------------------------------------------------------------------
 * Memory of what a listing showed, keyed by its URL (+ scope), kept for the life of the tab.
 * Coming back from a product (or any page) restores the pages that were loaded with "Load more"
 * and the scroll position, instead of dropping the shopper at the top of page 1.
 * ---------------------------------------------------------------------------------------------- */
type Snapshot = { items: ProductCardType[]; page: number; hasMore: boolean; firstId: string | undefined; total: number; scrollY: number; at: number };
const snapshots = new Map<string, Snapshot>();
const SNAPSHOT_TTL = 30 * 60_000;
let lastPopAt = 0;
if (typeof window !== "undefined") window.addEventListener("popstate", () => { lastPopAt = Date.now(); });
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

function usableSnapshot(key: string, result: SearchResult) {
  const s = snapshots.get(key);
  // Only when the server sent the same page 1 (same first product, same total): anything else means the set changed.
  if (!s || Date.now() - s.at > SNAPSHOT_TTL || result.page !== 1 || s.firstId !== result.items[0]?.id || s.total !== result.total) return null;
  return s;
}

/** URL-driven filters + sorting + paged grid. Server fetches; this component only manipulates search params and renders. */
/**
 * `scope` holds the params that define this page's result set but are not in the query string (e.g. the
 * category of /c/grocery). They are always sent with "Load more", so page 2 comes from the same set.
 */
export function ProductListing({ result, filters, signedIn, loadMoreHref, scope, hideCategoryChips, emptyTitle = "No products found", emptyHint }: { result: SearchResult; filters: ListingFilters; signedIn: boolean; loadMoreHref?: string; scope?: Record<string, string>; hideCategoryChips?: boolean; emptyTitle?: string; emptyHint?: string }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const key = `${pathname}?${sp.toString()}#${JSON.stringify(scope ?? {})}`;
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [sortOpen, setSortOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  // Restored from memory when this exact listing was open earlier in the tab (Back from a product).
  const [restored] = React.useState(() => usableSnapshot(key, result));
  const [items, setItems] = React.useState<ProductCardType[]>(restored?.items ?? result.items);
  const [page, setPage] = React.useState(restored?.page ?? result.page);
  const [hasMore, setHasMore] = React.useState(restored?.hasMore ?? result.has_more);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [moreError, setMoreError] = React.useState(false);
  const [seen, setSeen] = React.useState(result);
  // A new result set (other category, filter or sort): replace the list; any "Load more" still in flight
  // belongs to the old set and is dropped when it lands.
  const generation = React.useRef(0);
  if (seen !== result) { setSeen(result); setItems(result.items); setPage(result.page); setHasMore(result.has_more); setLoadingMore(false); setMoreError(false); }
  React.useEffect(() => { generation.current += 1; }, [result]);

  // Keep the memory current, and put the shopper back where they were after a Back navigation
  // (the browser restores the position itself when it can; this covers the cases where it cannot).
  const latest = React.useRef({ items, page, hasMore });
  React.useEffect(() => { latest.current = { items, page, hasMore }; }, [items, page, hasMore]);
  // Saved in a layout-effect cleanup: that runs while this listing is being removed, before the router
  // scrolls the next page to the top, so window.scrollY is still the shopper's position. (A passive
  // cleanup would run after that scroll and record 0.)
  const save = React.useCallback(() => { snapshots.set(key, { ...latest.current, firstId: result.items[0]?.id, total: result.total, scrollY: window.scrollY, at: Date.now() }); }, [key, result]);
  useIsomorphicLayoutEffect(() => () => save(), [save]);
  React.useEffect(() => {
    // Back to this listing: the browser restores the position itself when it can; this covers the rest.
    if (restored && Date.now() - lastPopAt < 3000 && restored.scrollY > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => { if (Math.abs(window.scrollY - restored.scrollY) > 40) window.scrollTo({ top: restored.scrollY, behavior: "instant" as ScrollBehavior }); }));
    }
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, result]);

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
  const activeCount = [sp.get("brand"), sp.get("minPrice") ?? sp.get("maxPrice"), sp.get("minDiscount"), sp.get("inStock"), sp.get("local")].filter(Boolean).length;

  // Next page: fetched once the shopper nears the end of the list, so "Load more" applies instantly.
  // Only one page ahead, only when the end is in sight, so data use stays close to what is viewed.
  const nextPage = React.useRef<{ page: number; gen: number; promise: Promise<SearchResult> } | null>(null);
  const fetchPage = React.useCallback((n: number): Promise<SearchResult> => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(scope ?? {})) next.set(k, v);
    next.set("page", String(n));
    return fetch(`${loadMoreHref ?? "/api/search"}?${next.toString()}`).then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return (await r.json()) as SearchResult; });
  }, [sp, scope, loadMoreHref]);
  const sentinel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loadingMore) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      const want = page + 1; const gen = generation.current;
      if (nextPage.current?.page === want && nextPage.current.gen === gen) return;
      const promise = fetchPage(want); promise.catch(() => { if (nextPage.current?.promise === promise) nextPage.current = null; });
      nextPage.current = { page: want, gen, promise };
    }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [page, hasMore, loadingMore, fetchPage]);

  const nextPageHref = (() => { const n = new URLSearchParams(sp.toString()); n.set("page", String(page + 1)); return `${pathname}?${n.toString()}`; })();

  const loadMore = async () => {
    const gen = generation.current;
    setLoadingMore(true); setMoreError(false);
    try {
      const want = page + 1;
      const pre = nextPage.current?.page === want && nextPage.current.gen === gen ? nextPage.current.promise : null;
      const d = await (pre ?? fetchPage(want));
      if (gen !== generation.current) return; // the shopper switched category/filters meanwhile
      setItems((cur) => { const have = new Set(cur.map((x) => x.id)); return [...cur, ...d.items.filter((x) => !have.has(x.id))]; });
      setPage(d.page); setHasMore(d.has_more);
    } catch {
      if (gen === generation.current) setMoreError(true);
    } finally {
      nextPage.current = null;
      if (gen === generation.current) setLoadingMore(false);
    }
  };

  return (
    <div>
      <div className="sticky top-[var(--header-h,114px)] z-20 -mx-4 mb-3 flex items-center gap-2 bg-surface/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0">
        <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)} className={cn(activeCount && "border-brand-600 text-brand-700")}><SlidersHorizontal className="h-4 w-4" /> Filters{activeCount ? ` (${activeCount})` : ""}</Button>
        <Button variant="outline" size="sm" onClick={() => setSortOpen(true)}><ArrowUpDown className="h-4 w-4" /> {SORTS.find((s) => s.value === sort)?.label ?? "Sort"}</Button>
        <div className="scroll-x ml-1 flex-1">
          <Chip active={sp.get("inStock") === "1"} onClick={() => set({ inStock: sp.get("inStock") === "1" ? null : "1" })}>In stock</Chip>
          <Chip active={sp.get("minDiscount") === "10"} onClick={() => set({ minDiscount: sp.get("minDiscount") === "10" ? null : "10" })}>10%+ off</Chip>
          <Chip active={sp.get("local") === "1"} onClick={() => set({ local: sp.get("local") === "1" ? null : "1" })}>Local</Chip>
          {!hideCategoryChips && filters.categories?.slice(0, 8).map((c) => <Chip key={c.slug} active={sp.get("category") === c.slug} onClick={() => set({ category: sp.get("category") === c.slug ? null : c.slug })}>{c.name}</Chip>)}
        </div>
      </div>

      {result.error ? (
        <ErrorState title="Couldn't load products" description="Check your connection and try again. Your filters are kept." onRetry={() => router.refresh()} />
      ) : (
        <>
          <p className="mb-3 text-xs text-ink-3" aria-live="polite">{result.total} product{result.total === 1 ? "" : "s"}{pending ? " · updating…" : ""}</p>

          {pending && items.length === 0 ? <ProductGridSkeleton /> : items.length === 0 ? (
            <EmptyState title={emptyTitle} description={emptyHint ?? "Try removing a filter, or search with a different word — Hindi words like aata, chini and lal mirch work too."} action={activeCount ? <Button variant="outline" onClick={() => startTransition(() => router.replace(pathname))}>Clear filters</Button> : null} />
          ) : (
            <>
              <ProductGrid products={items} signedIn={signedIn} className={cn(pending && "opacity-60")} />
              {hasMore ? <div ref={sentinel} className="mt-6 flex flex-col items-center gap-2">{moreError ? <p role="alert" className="text-sm text-danger">Couldn&apos;t load more products. Check your connection and try again.</p> : null}
                {/* A real link to the next page (crawlers and no-JS get ?page=N), appended in place for shoppers. */}
                <Button variant="outline" href={nextPageHref} loading={loadingMore} onClick={(e) => { e.preventDefault(); void loadMore(); }}>{moreError ? "Try again" : "Load more"}</Button></div> : null}
            </>
          )}
        </>
      )}

      <FilterPanel open={filterOpen} onClose={() => setFilterOpen(false)} footer={
        <div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => { setFilterOpen(false); afterOverlayClose(() => startTransition(() => router.replace(pathname))); }}>Clear all</Button><Button fullWidth onClick={() => setFilterOpen(false)}>Apply · {result.total} products</Button></div>
      }>
        <div className="space-y-6 py-4 md:px-4">
          <FilterGroup title="Availability"><Checkbox label="In stock only" checked={sp.get("inStock") === "1"} onChange={(e) => set({ inStock: e.target.checked ? "1" : null })} /><Checkbox label="Local products of Merta" checked={sp.get("local") === "1"} onChange={(e) => set({ local: e.target.checked ? "1" : null })} /></FilterGroup>
          <FilterGroup title="Price">{PRICE_BANDS.map((b) => { const active = sp.get("minPrice") === String(b.min) && (sp.get("maxPrice") ?? "") === (b.max?.toString() ?? ""); return <Checkbox key={b.label} label={b.label} checked={active} onChange={() => set(active ? { minPrice: null, maxPrice: null } : { minPrice: String(b.min), maxPrice: b.max?.toString() ?? null })} />; })}</FilterGroup>
          <FilterGroup title="Discount">{DISCOUNTS.map((d) => <Checkbox key={d} label={`${d}% or more`} checked={sp.get("minDiscount") === String(d)} onChange={() => set({ minDiscount: sp.get("minDiscount") === String(d) ? null : String(d) })} />)}</FilterGroup>
          {filters.brands.length ? <FilterGroup title="Brand">{filters.brands.map((b) => <Checkbox key={b.slug} label={b.name} checked={activeBrands.includes(b.slug)} onChange={() => toggleList("brand", b.slug)} />)}</FilterGroup> : null}
          {filters.categories?.length ? <FilterGroup title="Category">{filters.categories.map((c) => <Checkbox key={c.slug} label={c.name} checked={sp.get("category") === c.slug} onChange={() => set({ category: sp.get("category") === c.slug ? null : c.slug })} />)}</FilterGroup> : null}
        </div>
      </FilterPanel>

      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <ul className="divide-y divide-line">
          {SORTS.map((s) => <li key={s.value}><button type="button" onClick={() => { setSortOpen(false); afterOverlayClose(() => set({ sort: s.value === "relevance" ? null : s.value })); }} className="flex min-h-12 w-full items-center justify-between py-3 text-left text-sm font-medium text-ink">{s.label}{sort === s.value ? <Check className="h-4 w-4 text-brand-600" /> : null}</button></li>)}
        </ul>
      </BottomSheet>
    </div>
  );
}

/** Bottom sheet on phones (thumb-reachable Apply), side drawer on tablets and desktop. */
function FilterPanel({ open, onClose, footer, children }: { open: boolean; onClose: () => void; footer: React.ReactNode; children: React.ReactNode }) {
  const wide = useMedia("(min-width: 768px)");
  return wide
    ? <Drawer open={open} onClose={onClose} title="Filters" footer={footer}>{children}</Drawer>
    : <BottomSheet open={open} onClose={onClose} title="Filters" footer={footer}>{children}</BottomSheet>;
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">{title}</legend><div className="grid gap-2.5">{children}</div></fieldset>;
}
