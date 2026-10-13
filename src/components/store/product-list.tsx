"use client";
import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Plus, Box, Pencil, SlidersHorizontal, Check, X, PackagePlus, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, XCircle, EyeOff, Loader2 } from "lucide-react";
import { Input, Select, Switch } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, DiscountBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { BottomSheet } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ProductImage } from "@/components/shop/product-image";
import { toggleInventoryActiveAction } from "@/lib/actions/store";
import { StockSheet, type StockTarget } from "./stock-sheet";
import { afterOverlayClose } from "@/hooks/use-back-to-close";
import type { CategoryGroup, InventorySort, StoreInventoryRow } from "@/lib/data/store";
import { cn, discountPct, formatINR } from "@/lib/utils";
import type { Enums } from "@/types/database";
import { categoryOptions } from "./category-options";

type Status = Enums<"inventory_status"> | "";
const STATUS_FILTERS: { value: Status; label: string }[] = [{ value: "", label: "All" }, { value: "in_stock", label: "In stock" }, { value: "low_stock", label: "Low stock" }, { value: "out_of_stock", label: "Out of stock" }];
const STOCK_META: Record<Enums<"inventory_status">, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  in_stock: { label: "In stock", cls: "bg-success-50 text-[#14532d]", Icon: CheckCircle2 },
  low_stock: { label: "Low stock", cls: "bg-warning-50 text-[#6b4d00]", Icon: AlertTriangle },
  out_of_stock: { label: "Out of stock", cls: "bg-danger-50 text-[#8a1f18]", Icon: XCircle },
};
/** Remembers where the list was scrolled when an Edit was opened, so coming back lands on the same card. */
const SCROLL_KEY = "store-products-return";

export type ProductListFilter = { q: string; status: Status; categoryId: string; sort: InventorySort };

/**
 * Store products: URL-driven search, stock chips (with counts), category + sort in a Filters sheet
 * (inline on desktop), 1/2/3-column cards, labelled Edit / Update stock / "Visible to customers" controls,
 * and pagination. Search, filters, page and scroll position survive a round trip to the edit form.
 */
export function ProductList({ items, total, page, pageSize, filter, categories, sorts, counts, error }: { items: StoreInventoryRow[]; total: number; page: number; pageSize: number; filter: ProductListFilter; categories: CategoryGroup[]; sorts: Record<InventorySort, string>; counts: Record<Status, number> | null; error: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [q, setQ] = React.useState(filter.q);
  const typed = React.useRef(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [stockFor, setStockFor] = React.useState<StockTarget | null>(null);
  const [stockOverride, setStockOverride] = React.useState<Record<string, number>>({});
  const listTop = React.useRef<HTMLDivElement>(null);
  const here = `${pathname}${sp.toString() ? `?${sp.toString()}` : ""}`;

  const go = React.useCallback((patch: Record<string, string | number | undefined>, opts?: { scrollTop?: boolean }) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === "" || (k === "page" && Number(v) <= 1) || (k === "sort" && v === "recent")) next.delete(k); else next.set(k, String(v)); }
    const qs = next.toString();
    startTransition(() => router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false }));
    if (opts?.scrollTop) listTop.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [router, pathname, sp]);

  // Search as you type (debounced), without stealing focus or scroll.
  const [seenQ, setSeenQ] = React.useState(filter.q);
  if (seenQ !== filter.q) { setSeenQ(filter.q); setQ(filter.q); }
  React.useEffect(() => {
    if (!typed.current || q.trim() === filter.q) return;
    const t = setTimeout(() => { typed.current = false; go({ q: q.trim(), page: undefined }); }, 350);
    return () => clearTimeout(t);
  }, [q, filter.q, go]);
  const clearSearch = () => { typed.current = false; setQ(""); };

  // Back from Edit: restore the scroll position saved for this exact list URL.
  React.useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? "null") as { url: string; y: number; at: number } | null;
      if (saved && saved.url === here && Date.now() - saved.at < 30 * 60_000) requestAnimationFrame(() => window.scrollTo({ top: saved.y }));
      sessionStorage.removeItem(SCROLL_KEY);
    } catch { /* storage unavailable */ }
  }, [here]);
  const rememberScroll = () => { try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ url: here, y: window.scrollY, at: Date.now() })); } catch { /* ignore */ } };

  const catOptions = categoryOptions(categories, null);
  const catLabel = catOptions.find((c) => c.value === filter.categoryId)?.label;
  const sortOptions = (Object.entries(sorts) as [InventorySort, string][]).map(([value, label]) => ({ value, label }));
  const sheetCount = (filter.categoryId ? 1 : 0) + (filter.sort !== "recent" ? 1 : 0);
  const anyFilter = Boolean(filter.q || filter.status || filter.categoryId);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1; const to = Math.min(total, page * pageSize);
  const editHref = (id: string) => `/store/products/${id}?back=${encodeURIComponent(here)}`;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold text-ink sm:text-2xl">Products</h1>
          <p className="text-sm text-ink-3" aria-live="polite">{counts ? `${counts[""]} listing${counts[""] === 1 ? "" : "s"}` : `${total} listing${total === 1 ? "" : "s"}`}{anyFilter ? ` · ${total} shown` : ""}</p>
        </div>
        <Button href={`/store/products/new?back=${encodeURIComponent(here)}`} className="shrink-0 max-sm:h-11 max-sm:px-4" aria-label="Add product"><Plus className="h-4 w-4" aria-hidden /> <span className="max-sm:hidden">Add product</span><span className="sm:hidden">Add</span></Button>
      </div>

      <div className="flex gap-2">
        <Input type="search" placeholder="Search your products" value={q} onChange={(e) => { typed.current = true; setQ(e.target.value); }} leftIcon={<Search className="h-4 w-4" aria-hidden />} wrapperClassName="min-w-0 flex-1" aria-label="Search products by name" enterKeyHint="search" />
        <div className="hidden gap-2 lg:flex">
          <Select options={catOptions} placeholder="All categories" value={filter.categoryId} onChange={(e) => go({ category: e.target.value, page: undefined })} aria-label="Category" className="w-56" />
          <Select options={sortOptions} value={filter.sort} onChange={(e) => go({ sort: e.target.value, page: undefined })} aria-label="Sort by" className="w-48" />
        </div>
        <Button variant="outline" onClick={() => setFiltersOpen(true)} className="h-11 shrink-0 lg:hidden" aria-haspopup="dialog" aria-label={sheetCount ? `Filters, ${sheetCount} applied` : "Filters"}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden /><span className="max-[359px]:sr-only">Filters</span>{sheetCount ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white" aria-hidden>{sheetCount}</span> : null}
        </Button>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Stock filter">
        {STATUS_FILTERS.map((s) => {
          const on = filter.status === s.value;
          return (
            <button key={s.value} type="button" aria-pressed={on} onClick={() => go({ status: s.value, page: undefined })}
              className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600", on ? "border-brand-600 bg-brand-600 text-white" : "border-line-2 bg-card text-ink-2 hover:bg-surface-2")}>
              {on ? <Check className="h-4 w-4" aria-hidden /> : null}{s.label}{counts ? <span className={cn("tabular", on ? "text-white/90" : "text-ink-3")}>{counts[s.value]}</span> : null}
            </button>
          );
        })}
      </div>

      {catLabel || filter.sort !== "recent" || filter.q ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {filter.q ? <FilterTag label={`“${filter.q}”`} onClear={() => { clearSearch(); go({ q: undefined, page: undefined }); }} /> : null}
          {catLabel ? <FilterTag label={catLabel} onClear={() => go({ category: undefined, page: undefined })} /> : null}
          {filter.sort !== "recent" ? <FilterTag label={`Sort: ${sorts[filter.sort]}`} onClear={() => go({ sort: undefined, page: undefined })} /> : null}
          <button type="button" onClick={() => { clearSearch(); go({ q: undefined, category: undefined, sort: undefined, status: undefined, page: undefined }); }} className="min-h-11 px-1 font-semibold text-brand-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">Clear all</button>
        </div>
      ) : null}

      <div ref={listTop} className="scroll-mt-20" />
      {error ? (
        <ErrorState title="Products didn't load" description="Check your connection, then try again. Nothing was changed." onRetry={() => startTransition(() => router.refresh())} className="rounded-lg border border-line bg-card" />
      ) : items.length === 0 ? (
        <EmptyState icon={<Box className="h-7 w-7" aria-hidden />} className="rounded-lg border border-line bg-card"
          title={anyFilter ? "No products match" : "No products yet"}
          description={anyFilter ? "Try another search or stock filter, or clear the filters." : "Add your first product or pick from the Merta Deal catalog to start selling."}
          action={anyFilter ? <Button variant="outline" onClick={() => { clearSearch(); go({ q: undefined, category: undefined, status: undefined, page: undefined }); }}>Clear filters</Button> : <Button href="/store/products/new"><Plus className="h-4 w-4" aria-hidden /> Add product</Button>} />
      ) : (
        <div className="relative">
          {pending ? <div className="absolute inset-x-0 -top-1 z-10 flex justify-center" role="status"><span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-semibold text-ink-2 shadow-card"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Updating…</span></div> : null}
          <ul className={cn("grid grid-cols-1 gap-3 md:grid-cols-2 min-[85rem]:grid-cols-3 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
            {items.map((it) => <ProductCard key={it.id} item={it} stock={stockOverride[it.id]} editHref={editHref(it.id)} onEdit={rememberScroll} onStock={() => setStockFor({ id: it.id, name: it.product.name, stock: stockOverride[it.id] ?? it.stock_qty })} />)}
          </ul>
        </div>
      )}

      {!error && pages > 1 ? (
        <nav className="flex flex-wrap items-center justify-between gap-3 pt-1" aria-label="Pages">
          <p className="text-sm text-ink-3">Showing {from}–{to} of {total}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={page <= 1 || pending} onClick={() => go({ page: page - 1 }, { scrollTop: true })} aria-label="Previous page"><ChevronLeft className="h-4 w-4" aria-hidden /> Previous</Button>
            <span className="min-w-16 text-center text-sm font-semibold text-ink tabular" aria-current="page">{page} / {pages}</span>
            <Button variant="outline" disabled={page >= pages || pending} onClick={() => go({ page: page + 1 }, { scrollTop: true })} aria-label="Next page">Next <ChevronRight className="h-4 w-4" aria-hidden /></Button>
          </div>
        </nav>
      ) : null}


      <FiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} categories={catOptions} sorts={sortOptions} value={{ category: filter.categoryId, sort: filter.sort }}
        onApply={(v) => { setFiltersOpen(false); afterOverlayClose(() => go({ category: v.category, sort: v.sort, page: undefined })); }} />
      <StockSheet target={stockFor} onClose={() => setStockFor(null)} onDone={(n) => { if (stockFor) setStockOverride((o) => ({ ...o, [stockFor.id]: n })); setStockFor(null); router.refresh(); }} />
    </div>
  );
}

function FilterTag({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-3 pr-0.5 text-brand-800">
      <span className="truncate">{label}</span>
      <button type="button" onClick={onClear} aria-label={`Remove ${label}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-600"><X className="h-4 w-4" aria-hidden /></button>
    </span>
  );
}

/** Category + sort, applied together (or cleared) — so a phone user changes several things in one go. */
function FiltersSheet({ open, onClose, categories, sorts, value, onApply }: { open: boolean; onClose: () => void; categories: { value: string; label: string }[]; sorts: { value: string; label: string }[]; value: { category: string; sort: InventorySort }; onApply: (v: { category: string; sort: InventorySort }) => void }) {
  const [draft, setDraft] = React.useState(value);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) setDraft(value); }
  return (
    <BottomSheet open={open} onClose={onClose} title="Filters"
      footer={<div className="flex gap-2"><Button variant="outline" size="lg" className="flex-1" onClick={() => onApply({ category: "", sort: "recent" })}>Clear</Button><Button size="lg" className="flex-1" onClick={() => onApply(draft)}>Apply</Button></div>}>
      <div className="space-y-4">
        <Select label="Category" options={categories} placeholder="All categories" value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} />
        <Select label="Sort by" options={sorts} value={draft.sort} onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value as InventorySort }))} />
      </div>
    </BottomSheet>
  );
}

function ProductCard({ item, stock: stockOverride, editHref, onEdit, onStock }: { item: StoreInventoryRow; stock?: number; editHref: string; onEdit: () => void; onStock: () => void }) {
  const router = useRouter();
  const [visible, setVisible] = React.useState(item.is_active);
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState(item.is_active);
  if (seen !== item.is_active) { setSeen(item.is_active); setVisible(item.is_active); }
  const p = item.product;
  const stock = stockOverride ?? item.stock_qty;
  const status: Enums<"inventory_status"> = stockOverride === undefined ? item.status : stock <= 0 ? "out_of_stock" : stock <= item.low_stock_threshold ? "low_stock" : "in_stock";
  const sm = STOCK_META[status];
  const pct = discountPct(Number(item.mrp), Number(item.selling_price));
  const pack = p.pack_label || `${p.weight_value} ${p.weight_unit}`;
  // The store's switch only works when the catalog product itself is live (admins can switch products,
  // or their category, off for every store). Say so instead of claiming the product is visible.
  const blockedBy = p.is_active === false ? "This product is switched off in the Merta Deal catalog" : p.is_approved === false ? "This product is waiting for admin approval" : p.category && p.category.is_active === false ? `The “${p.category.name}” category is switched off` : null;

  const toggle = async (v: boolean) => {
    if (busy) return;
    setVisible(v); setBusy(true);
    const r = await toggleInventoryActiveAction(item.id, v);
    setBusy(false);
    if (!r.ok) { setVisible(!v); toast.error(v ? "Couldn't show this product" : "Couldn't hide this product", `${r.error} It is still ${!v ? "visible" : "hidden"}.`); return; }
    toast.success(v ? "Visible to customers" : "Hidden from customers", p.name);
    router.refresh();
  };

  return (
    <li className="flex min-w-0 flex-col rounded-lg border border-line bg-card p-3 shadow-card sm:p-4">
      <div className="flex min-w-0 gap-3">
        <ProductImage image={p.image_url} productName={p.name} packSize={p.pack_label} className="h-20 w-20 shrink-0 rounded-md" sizes="80px" />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 break-words text-[15px] font-semibold leading-snug text-ink" title={p.name}>{p.name}</h2>
          <p className="mt-0.5 truncate text-sm text-ink-2">{pack}</p>
          <p className="truncate text-xs text-ink-3">{[p.brand?.name, p.category?.name, p.is_local ? "Local" : null].filter(Boolean).join(" · ") || "—"}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-lg font-extrabold text-ink tabular">{formatINR(item.selling_price)}</span>
        {Number(item.mrp) > Number(item.selling_price) ? <span className="text-sm text-ink-3 line-through tabular" aria-label={`MRP ${formatINR(item.mrp)}`}>{formatINR(item.mrp)}</span> : null}
        {pct > 0 ? <DiscountBadge pct={pct} /> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", sm.cls)}><sm.Icon className="h-3.5 w-3.5" aria-hidden />{sm.label} · {stock} unit{stock === 1 ? "" : "s"}</span>
        {!visible ? <Badge tone="neutral" size="sm"><EyeOff className="h-3.5 w-3.5" aria-hidden /> Hidden</Badge> : blockedBy ? <Badge tone="warning" size="sm"><EyeOff className="h-3.5 w-3.5" aria-hidden /> Hidden by admin</Badge> : null}
      </div>

      <div className="mt-2 border-t border-line pt-1">
        <Switch checked={visible} onChange={toggle} disabled={busy} label="Visible to customers" description={busy ? "Saving…" : !visible ? "Hidden from the shop — stock is kept" : blockedBy ? `${blockedBy}, so customers can't see it yet. Contact Merta Deal support.` : "Shown in the shop"} />
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
        <Button variant="outline" href={editHref} onClick={onEdit} className="min-h-11" aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" aria-hidden /> Edit</Button>
        <Button variant="secondary" onClick={onStock} className="min-h-11" aria-label={`Update stock for ${p.name}`}><PackagePlus className="h-4 w-4" aria-hidden /> Update stock</Button>
      </div>
    </li>
  );
}
