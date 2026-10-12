"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, Mic, ArrowUpRight, Tag, LayoutGrid, Store } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounce";
import type { SearchSuggest } from "@/types/app";
import { cn, formatINR } from "@/lib/utils";
import { ProductImage } from "./product-image";

/** Zepto-style rotating hint: Search "Groceries" → "Fruits" → "Vegetables" (CSS only, no timers). */
const HINTS = ["Groceries", "Fruits", "Vegetables"];

export function SearchBar({ className, autoFocus, initial = "", compact }: { className?: string; autoFocus?: boolean; initial?: string; compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlQ = pathname === "/search" ? sp.get("q") ?? "" : "";
  const [q, setQ] = React.useState(initial || urlQ);
  // Keep the box in step with the results page (Back/Forward, new searches from elsewhere).
  const [prevUrlQ, setPrevUrlQ] = React.useState(urlQ);
  if (urlQ !== prevUrlQ) { setPrevUrlQ(urlQ); setQ(urlQ); }
  const inputRef = React.useRef<HTMLInputElement>(null);
  // The Search tab opens /search with nothing typed: put the cursor in the visible search box.
  React.useEffect(() => {
    if (pathname === "/search" && !urlQ && inputRef.current?.offsetParent) inputRef.current.focus({ preventScroll: true });
  }, [pathname, urlQ]);
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<SearchSuggest | null>(null);
  const [loading, setLoading] = React.useState(false);
  const debounced = useDebouncedValue(q, 220);
  const ref = React.useRef<HTMLDivElement>(null);

  const active = debounced.trim().length >= 2;
  React.useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    const run = async () => {
      setLoading(true);
      try { const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(debounced.trim())}`, { signal: ctrl.signal }); setData(await r.json()); } catch {}
      setLoading(false);
    };
    void run();
    return () => ctrl.abort();
  }, [debounced, active]);
  React.useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const submit = (term = q) => { const t = term.trim(); if (!t) return; setOpen(false); router.push(`/search?q=${encodeURIComponent(t)}`); };
  const shown = active ? data : null;
  const hasResults = shown && (shown.products.length || shown.brands.length || shown.categories.length || shown.stores.length);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <form role="search" onSubmit={(e) => { e.preventDefault(); submit(); }} className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
        <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} autoFocus={autoFocus} type="search" enterKeyHint="search" autoComplete="off"
          placeholder="" aria-label="Search groceries, fruits and vegetables"
          className={cn("w-full rounded-md border border-line-2 bg-card pl-11 pr-20 text-[15px] text-ink shadow-card placeholder:text-ink-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 [&::-webkit-search-cancel-button]:hidden", compact ? "h-11" : "h-12")} />
        {!q ? (
          <span aria-hidden className={cn("pointer-events-none absolute left-11 right-20 top-1/2 flex -translate-y-1/2 items-center overflow-hidden whitespace-nowrap text-[15px] leading-6 text-ink-3", compact ? "h-6" : "h-6")}>
            Search&nbsp;
            <span className="relative inline-block h-6 overflow-hidden align-top">
              <span className="flex flex-col motion-safe:animate-[search-hint_7.5s_cubic-bezier(0.65,0,0.35,1)_infinite]">
                {[...HINTS, HINTS[0]].map((h, i) => <span key={i} className="h-6 font-medium text-ink-2">&ldquo;{h}&rdquo;</span>)}
              </span>
            </span>
          </span>
        ) : null}
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {q ? <button type="button" aria-label="Clear search" onClick={() => { setQ(""); setData(null); }} className="tap flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2"><X className="h-4 w-4" /></button> : null}
          <Link href="/assistant?mode=voice" aria-label="Voice order" className="tap flex h-8 w-8 items-center justify-center rounded-full text-brand-600 hover:bg-brand-50"><Mic className="h-4.5 w-4.5" /></Link>
        </div>
      </form>

      {open && q.trim().length >= 2 ? (
        <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-line bg-card shadow-float animate-pop">
          {loading && !shown ? <p className="px-4 py-3 text-sm text-ink-3">Searching…</p> : null}
          {shown && !hasResults && !loading ? <p className="px-4 py-3 text-sm text-ink-3">No matches yet. Try a different spelling — we understand Hindi words like aata, chini, lal mirch.</p> : null}
          {shown?.products.length ? (
            <ul className="divide-y divide-line">
              {shown.products.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link href={`/p/${p.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-surface">
                    <ProductImage image={p.image_url} brand={p.brand_name} productName={p.name} packSize={p.pack_label} className="h-10 w-10 shrink-0 rounded-sm" sizes="40px" />
                    <span className="min-w-0 flex-1"><span className="line-clamp-1 text-sm font-medium text-ink">{p.name}</span><span className="text-xs text-ink-3">{p.brand_name ? `${p.brand_name} · ` : ""}{p.pack_label}</span></span>
                    {p.selling_price != null ? <span className="text-sm font-bold text-ink tabular">{formatINR(p.selling_price)}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {(shown?.categories.length || shown?.brands.length || shown?.stores.length) ? (
            <div className="flex flex-wrap gap-2 border-t border-line bg-surface px-3 py-2.5">
              {shown.categories.map((c) => <Link key={c.id} href={`/c/${c.slug}`} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 rounded-full border border-line-2 bg-card px-2.5 py-1 text-xs font-medium text-ink"><LayoutGrid className="h-3 w-3 text-brand-600" />{c.name}</Link>)}
              {shown.brands.map((b) => <Link key={b.id} href={`/search?brand=${b.slug}`} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 rounded-full border border-line-2 bg-card px-2.5 py-1 text-xs font-medium text-ink"><Tag className="h-3 w-3 text-saffron-600" />{b.name}</Link>)}
              {shown.stores.map((s) => <Link key={s.id} href={`/s/${s.slug}`} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 rounded-full border border-line-2 bg-card px-2.5 py-1 text-xs font-medium text-ink"><Store className="h-3 w-3 text-info" />{s.name}</Link>)}
            </div>
          ) : null}
          <button type="button" onClick={() => submit()} className="flex w-full items-center justify-between border-t border-line px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">See all results for “{q.trim()}” <ArrowUpRight className="h-4 w-4" /></button>
        </div>
      ) : null}
    </div>
  );
}
