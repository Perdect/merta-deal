"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Pagination } from "@/components/ui/misc";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

export type FilterDef = { key: string; label: string; options: { value: string; label: string }[]; placeholder?: string };

/** Pushes a partial search-param update to the URL (resets `page` unless told otherwise). */
export function useListParams() {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const set = React.useCallback((patch: Record<string, string | null | undefined>, opts: { keepPage?: boolean } = {}) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    if (!opts.keepPage) next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, sp]);
  return { sp, set };
}

/**
 * Search box + select filters + optional date range, all mirrored into URL search params so
 * server components can paginate/filter. Debounced search.
 */
export function ListToolbar({ searchKey = "q", searchPlaceholder = "Search…", filters = [], dateRange, className, children }: { searchKey?: string | null; searchPlaceholder?: string; filters?: FilterDef[]; dateRange?: boolean; className?: string; children?: React.ReactNode }) {
  const { sp, set } = useListParams();
  const initial = searchKey ? sp.get(searchKey) ?? "" : "";
  const [text, setText] = React.useState(initial);
  const [prevInitial, setPrevInitial] = React.useState(initial);
  if (initial !== prevInitial) { setPrevInitial(initial); setText(initial); }
  const debounced = useDebouncedValue(text, 350);
  React.useEffect(() => { if (searchKey && debounced !== (sp.get(searchKey) ?? "")) set({ [searchKey]: debounced }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = [...filters.map((f) => f.key), "from", "to", searchKey ?? ""].filter((k) => k && sp.get(k));
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      {searchKey ? (
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={searchPlaceholder} aria-label="Search" className="h-10 w-full rounded-sm border border-line-2 bg-card pl-9 pr-8 text-sm text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
          {text ? <button type="button" onClick={() => setText("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink"><X className="h-4 w-4" /></button> : null}
        </div>
      ) : null}
      {filters.map((f) => (
        <select key={f.key} aria-label={f.label} value={sp.get(f.key) ?? ""} onChange={(e) => set({ [f.key]: e.target.value })} className="h-10 rounded-sm border border-line-2 bg-card px-3 pr-8 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100">
          <option value="">{f.placeholder ?? `All ${f.label.toLowerCase()}`}</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {dateRange ? (
        <div className="flex items-center gap-1.5 text-xs text-ink-3">
          <input type="date" aria-label="From date" value={sp.get("from") ?? ""} onChange={(e) => set({ from: e.target.value })} className="h-10 rounded-sm border border-line-2 bg-card px-2 text-sm text-ink" />
          <span>to</span>
          <input type="date" aria-label="To date" value={sp.get("to") ?? ""} onChange={(e) => set({ to: e.target.value })} className="h-10 rounded-sm border border-line-2 bg-card px-2 text-sm text-ink" />
        </div>
      ) : null}
      {active.length ? <button type="button" onClick={() => { setText(""); set(Object.fromEntries(active.map((k) => [k, null]))); }} className="h-10 rounded-sm px-3 text-xs font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink">Clear filters</button> : null}
      {children ? <div className="sm:ml-auto">{children}</div> : null}
    </div>
  );
}

/** Pagination wired to the `page` search param. */
export function ListPagination({ page, pageSize, total, className }: { page: number; pageSize: number; total: number; className?: string }) {
  const { set } = useListParams();
  return <Pagination page={page} pageSize={pageSize} total={total} onChange={(p) => set({ page: String(p) }, { keepPage: true })} className={cn("mt-4", className)} />;
}

/** Underline tabs that write a search param (server components read it). */
export function ParamTabs({ param, items, defaultValue, className }: { param: string; items: { value: string; label: string; count?: number }[]; defaultValue?: string; className?: string }) {
  const { sp, set } = useListParams();
  const value = sp.get(param) ?? defaultValue ?? items[0]?.value;
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-line no-scrollbar", className)}>
      {items.map((t) => { const active = t.value === value; return (
        <button key={t.value} type="button" role="tab" aria-selected={active} onClick={() => set({ [param]: t.value === defaultValue ? null : t.value })} className={cn("-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors", active ? "border-brand-600 text-brand-700" : "border-transparent text-ink-3 hover:text-ink")}>
          {t.label}{typeof t.count === "number" ? <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular", active ? "bg-brand-100 text-brand-700" : "bg-surface-2 text-ink-3")}>{t.count}</span> : null}
        </button>
      ); })}
    </div>
  );
}
