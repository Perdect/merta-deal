"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Search, SlidersHorizontal, X } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useBackToClose, afterOverlayClose } from "@/hooks/use-back-to-close";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { cn, flattenOptions, isOptionGroup, type GroupedOptions, type Option } from "@/lib/utils";

/* ------------------------------------------------------------------------------------------------
 * URL state: every list keeps search, filters, tab and page in the query string, so the server
 * renders exactly one page of rows and "Back" from a detail returns to the same position.
 * ---------------------------------------------------------------------------------------------- */

export function useQueryState() {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [pending, start] = React.useTransition();
  const set = React.useCallback((patch: Record<string, string | null | undefined>, opts: { keepPage?: boolean; scroll?: boolean; replace?: boolean } = {}) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    if (!opts.keepPage) next.delete("page");
    const qs = next.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    start(() => { if (opts.replace) router.replace(url, { scroll: opts.scroll ?? false }); else router.push(url, { scroll: opts.scroll ?? false }); });
  }, [router, pathname, sp]);
  return { sp, set, pending, pathname };
}

/* The previous in-app admin URL (path + query). document.referrer doesn't change on client-side
   navigation, so the shell records each URL here (AdminTrail) for BackLink. */
const trail: { prev: string | null; cur: string | null } = { prev: null, cur: null };

/** Records admin URLs as they change; rendered once by the shell. */
export function AdminTrail() {
  const pathname = usePathname(); const sp = useSearchParams();
  const url = sp.toString() ? `${pathname}?${sp.toString()}` : pathname;
  React.useEffect(() => { if (url !== trail.cur) { trail.prev = trail.cur; trail.cur = url; } }, [url]);
  return null;
}

/** Returns to the list exactly as it was (filters, page, scroll) when we came from it; else links to `fallback`. */
export function BackLink({ fallback, label = "Back" }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <Link href={fallback} aria-label={label}
      onClick={(e) => {
        const prevPath = trail.prev?.split("?")[0];
        if (prevPath && prevPath === fallback.split("?")[0] && window.history.length > 1) { e.preventDefault(); router.back(); }
      }}
      className="tap group relative -ml-1 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-card hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600">
      <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
    </Link>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Side panel (quick view / quick edit / filters)
 * ---------------------------------------------------------------------------------------------- */

const noopSubscribe = () => () => {};

/**
 * Right-hand panel on tablet/desktop. On phones it fills the screen with a Back arrow (or, with
 * `sheet`, rises from the bottom — used for filters). The phone/browser Back button closes it.
 */
export function SidePanel({ open, onClose, title, description, children, footer, width = "md", headerActions, sheet, historyBack = true }: {
  open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode;
  width?: "sm" | "md" | "lg"; headerActions?: React.ReactNode;
  /** Phones: bottom sheet instead of a full-screen view. */ sheet?: boolean;
  /** Push a history entry so Back closes the panel. Off when the panel is already a URL state (QuickView). */ historyBack?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  // Keep the latest onClose without re-running the open effect (which would steal focus mid-typing).
  const closeRef = React.useRef(onClose);
  React.useEffect(() => { closeRef.current = onClose; });
  useBackToClose(open && historyBack, onClose);
  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only the top-most layer closes: a confirm dialog opened from this panel handles its own Escape.
      const layers = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
      if (layers.length && layers[layers.length - 1] !== rootRef.current) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open]);
  if (!open || !mounted) return null;
  const w = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" }[width];
  const closeBtn = "-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink tap";
  return createPortal(
    <div ref={rootRef} data-admin-layer="" className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <div className="absolute inset-0 bg-ink/30 motion-safe:animate-fade-in" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className={cn("absolute right-0 flex w-full flex-col bg-card shadow-float outline-none sm:inset-y-0 sm:motion-safe:animate-panel-in", w,
        sheet ? "max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[88dvh] max-sm:rounded-t-2xl max-sm:motion-safe:animate-slide-up" : "max-sm:inset-y-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:motion-safe:animate-panel-in")}>
        {sheet ? <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-2 sm:hidden" /> : null}
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          {!sheet ? <button type="button" onClick={onClose} aria-label="Back" className={cn(closeBtn, "-ml-1 mr-0 text-ink-2 sm:hidden")}><ArrowLeft className="h-5 w-5" /></button> : null}
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-semibold text-ink">{title}</h2>
            {description ? <div className="mt-0.5 text-xs text-ink-3">{description}</div> : null}
          </div>
          {headerActions}
          <button type="button" onClick={onClose} aria-label="Close panel" className={cn(closeBtn, !sheet && "max-sm:hidden")}><X className="h-[18px] w-[18px]" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer ? <div className="border-t border-line bg-card px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] sm:px-5">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Quick view opened by a search param (e.g. ?view=<id>). The server renders the contents; closing
 * removes the param without scrolling, so the list underneath stays where it was.
 */
export function QuickView({ param = "view", title, description, fullHref, fullLabel = "Open full page", children, footer }: {
  param?: string; title: React.ReactNode; description?: React.ReactNode; fullHref?: string; fullLabel?: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  const { set } = useQueryState();
  const close = React.useCallback(() => set({ [param]: null }, { keepPage: true, replace: true }), [set, param]);
  return (
    <SidePanel open onClose={close} title={title} description={description} width="lg" footer={footer} historyBack={false}
      headerActions={fullHref ? <Link href={fullHref} aria-label={fullLabel} className="tap inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line-2 px-2.5 text-xs font-semibold text-ink-2 hover:bg-surface-2"><ExternalLink className="h-3.5 w-3.5" aria-hidden /><span className="max-sm:sr-only">{fullLabel}</span></Link> : null}>
      {children}
    </SidePanel>
  );
}

/* ------------------------------------------------------------------------------------------------
 * List toolbar: debounced search + a Filters panel + removable chips for what is applied.
 * ---------------------------------------------------------------------------------------------- */

export type FilterOption = Option;
/** `options` may carry labelled groups (see GroupedOptions); they render as <optgroup>. */
export type FilterDef = { key: string; label: string; options: GroupedOptions; anyLabel?: string };

export function ListToolbar({ searchKey = "q", searchPlaceholder = "Search", filters = [], dateRange, actions, className }: {
  searchKey?: string | null; searchPlaceholder?: string; filters?: FilterDef[]; dateRange?: { label?: string } | boolean; actions?: React.ReactNode; className?: string;
}) {
  const { sp, set, pending } = useQueryState();
  const initial = searchKey ? sp.get(searchKey) ?? "" : "";
  const [text, setText] = React.useState(initial);
  const [prevInitial, setPrevInitial] = React.useState(initial);
  if (initial !== prevInitial) { setPrevInitial(initial); setText(initial); }
  const debounced = useDebouncedValue(text, 350);
  React.useEffect(() => { if (searchKey && debounced.trim() !== (sp.get(searchKey) ?? "")) set({ [searchKey]: debounced.trim() }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const panelKeys = [...filters.map((f) => f.key), ...(dateRange ? ["from", "to"] : [])];
  const applied = panelKeys.filter((k) => sp.get(k));
  const openPanel = () => { setDraft(Object.fromEntries(panelKeys.map((k) => [k, sp.get(k) ?? ""]))); setOpen(true); };
  // Close first, then navigate once the panel's history entry is gone (otherwise its pop undoes the filter).
  const apply = () => { const patch = Object.fromEntries(panelKeys.map((k) => [k, draft[k] || null])); setOpen(false); afterOverlayClose(() => set(patch)); };
  const rangeInvalid = Boolean(draft.from && draft.to && draft.from > draft.to);

  const chipLabel = (k: string) => {
    const v = sp.get(k) ?? "";
    if (k === "from") return `From ${v}`;
    if (k === "to") return `To ${v}`;
    const f = filters.find((x) => x.key === k);
    return `${f?.label ?? k}: ${(f ? flattenOptions(f.options) : []).find((o) => o.value === v)?.label ?? v}`;
  };

  const clearAll = () => { setDraft(Object.fromEntries(panelKeys.map((k) => [k, ""]))); setOpen(false); afterOverlayClose(() => set(Object.fromEntries(panelKeys.map((k) => [k, null])))); };
  return (
    <div className={cn("mb-3 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {searchKey ? (
          <div className="relative min-w-0 flex-1 basis-48 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" aria-hidden />
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
              className="h-9 w-full rounded-lg border border-line-2 bg-card pl-9 pr-9 text-sm pointer-coarse:h-11 text-ink placeholder:text-ink-4 transition-shadow focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 [&::-webkit-search-cancel-button]:hidden" />
            {text ? <button type="button" onClick={() => setText("")} aria-label="Clear search" className="tap absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-4 hover:bg-surface-2 hover:text-ink"><X className="h-3.5 w-3.5" /></button> : null}
          </div>
        ) : null}
        {panelKeys.length ? (
            <button type="button" onClick={openPanel} aria-haspopup="dialog" className={cn("inline-flex h-9 shrink-0 items-center pointer-coarse:h-11 gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600", applied.length ? "border-brand-300 text-brand-800" : "border-line-2 text-ink-2")}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden />Filters{applied.length ? <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-bold leading-[18px] text-white">{applied.length}</span> : null}
            </button>
        ) : null}
        {pending ? <span className="text-xs text-ink-3" role="status">Updating…</span> : null}
        {actions ? <div className="flex flex-wrap items-center gap-2 max-sm:w-full sm:ml-auto">{actions}</div> : null}
      </div>

      {applied.length ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Applied filters">
          {applied.map((k) => (
            <button key={k} type="button" onClick={() => set({ [k]: null })} aria-label={`Remove filter ${chipLabel(k)}`} className="tap inline-flex h-7 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 pl-2.5 pr-1.5 text-xs font-medium text-brand-800 transition-colors hover:bg-brand-100">
              {chipLabel(k)}<X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ))}
          <button type="button" onClick={() => set(Object.fromEntries(applied.map((k) => [k, null])))} className="tap h-7 rounded-full px-2 text-xs font-semibold text-ink-3 hover:text-ink">Clear all</button>
        </div>
      ) : null}

      <SidePanel open={open} onClose={() => setOpen(false)} title="Filters" width="sm" sheet
        footer={<div className="flex gap-2"><button type="button" onClick={clearAll} className="h-11 flex-1 rounded-lg border border-line-2 text-sm font-semibold text-ink-2 hover:bg-surface-2">Clear all</button><button type="button" disabled={rangeInvalid} onClick={apply} className="h-11 flex-1 rounded-lg bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Apply filters</button></div>}>
        <div className="space-y-4">
          {filters.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{f.label}</span>
              <select value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} className="h-11 w-full rounded-lg border border-line-2 bg-card px-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100">
                <option value="">{f.anyLabel ?? "Any"}</option>
                {f.options.map((o) => isOptionGroup(o)
                  ? <optgroup key={o.label} label={o.label}>{o.options.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</optgroup>
                  : <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
          {dateRange ? (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink">{typeof dateRange === "object" && dateRange.label ? dateRange.label : "Date (IST)"}</legend>
              <div className="grid gap-2 min-[360px]:grid-cols-2">
                <label className="text-xs text-ink-3">From<input type="date" value={draft.from ?? ""} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="mt-1 h-11 w-full min-w-0 rounded-lg border border-line-2 bg-card px-2 text-sm text-ink" /></label>
                <label className="text-xs text-ink-3">To<input type="date" value={draft.to ?? ""} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="mt-1 h-11 w-full min-w-0 rounded-lg border border-line-2 bg-card px-2 text-sm text-ink" /></label>
              </div>
              {rangeInvalid ? <p className="mt-1.5 text-xs font-medium text-danger" role="alert">The end date must be on or after the start date.</p> : null}
            </fieldset>
          ) : null}
        </div>
      </SidePanel>
    </div>
  );
}

/** Status tabs with live counts, mirrored to a search param. */
export function StatusTabs({ param = "status", items, defaultValue = "", className }: { param?: string; items: { value: string; label: string; count?: number | null }[]; defaultValue?: string; className?: string }) {
  const { sp, set } = useQueryState();
  const value = sp.get(param) ?? defaultValue;
  return (
    <div role="tablist" aria-label="Filter by status" className={cn("mb-3 flex gap-1 overflow-x-auto border-b border-line no-scrollbar", className)}>
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button key={t.value || "all"} type="button" role="tab" aria-selected={active} onClick={() => set({ [param]: t.value === defaultValue ? null : t.value })}
            className={cn("-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium pointer-coarse:min-h-11 transition-colors duration-150", active ? "border-brand-600 text-brand-800" : "border-transparent text-ink-3 hover:text-ink")}>
            {t.label}
            {typeof t.count === "number" ? <span className={cn("rounded-full px-1.5 text-[11px] font-semibold leading-[18px] tabular", active ? "bg-brand-100 text-brand-800" : "bg-surface-2 text-ink-3")}>{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** "Showing 26–50 of 230" with previous / next and a page jump. */
export function ListPagination({ page, pageSize, total, className }: { page: number; pageSize: number; total: number; className?: string }) {
  const { set } = useQueryState();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1; const to = Math.min(total, page * pageSize);
  const go = (p: number) => set({ page: p > 1 ? String(p) : null }, { keepPage: true, scroll: true });
  const btn = "flex h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-lg border border-line-2 bg-card text-ink-2 transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40";
  return (
    <nav aria-label="Pagination" className={cn("mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-3", className)}>
      <p className="tabular">Showing <span className="font-medium text-ink">{from}–{to}</span> of <span className="font-medium text-ink">{total.toLocaleString("en-IN")}</span></p>
      {pages > 1 ? (
        <div className="flex items-center gap-1.5">
          <button type="button" className={btn} disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
          <label className="flex items-center gap-1.5 text-xs">
            <span className="sr-only">Page</span>
            <select value={page} onChange={(e) => go(Number(e.target.value))} className="h-8 rounded-lg border border-line-2 bg-card px-2 text-sm text-ink tabular pointer-coarse:h-11">
              {Array.from({ length: pages }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
            <span>of {pages}</span>
          </label>
          <button type="button" className={btn} disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
        </div>
      ) : null}
    </nav>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Unsaved changes
 * ---------------------------------------------------------------------------------------------- */

const DISCARD = "You have unsaved changes. Leave without saving?";

/** Warns before closing the tab, reloading, or following an in-app link while `dirty`. */
export function useUnsavedChanges(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      if (!window.confirm(DISCARD)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", onBeforeUnload); document.removeEventListener("click", onClick, true); };
  }, [dirty]);
  return React.useCallback(() => !dirty || window.confirm(DISCARD), [dirty]);
}

/**
 * Sticky Save / Cancel bar for long forms, with a visible unsaved-changes state. While the on-screen
 * keyboard is up the bar stops sticking, so it never sits over the field being edited.
 */
export function FormActions({ dirty, saving, onCancel, submitLabel = "Save changes", cancelLabel = "Cancel", disabled, extra, inline }: { dirty: boolean; saving: boolean; onCancel?: () => void; submitLabel?: string; cancelLabel?: string; disabled?: boolean; extra?: React.ReactNode; /** Inside a side panel footer: no page-width bleed. */ inline?: boolean }) {
  const keyboard = useKeyboardOpen();
  return (
    <div className={inline ? "" : cn("z-20 -mx-3 mt-4 border-t border-line bg-card/95 px-3 py-3 backdrop-blur pb-[calc(0.75rem+var(--safe-bottom))] sm:-mx-5 sm:px-5 lg:-mx-7 lg:px-7", keyboard ? "static" : "sticky bottom-0")}>
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-ink-3" role="status">{saving ? "Saving…" : dirty ? <span className="font-medium text-[#8a6300]">Unsaved changes</span> : "All changes saved"}</p>
        {extra}
        {onCancel ? <button type="button" onClick={onCancel} disabled={saving} className="h-9 rounded-lg border border-line-2 bg-card px-4 text-sm font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-50 pointer-coarse:h-11">{cancelLabel}</button> : null}
        <button type="submit" disabled={saving || disabled} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60 pointer-coarse:h-11">
          {saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden /> : null}{saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

/** Icon-only control with an accessible name and a visible tooltip. */
export function IconAction({ label, onClick, href, children, tone = "default", disabled }: { label: string; onClick?: () => void; href?: string; children: React.ReactNode; tone?: "default" | "danger"; disabled?: boolean }) {
  const cls = cn("group relative inline-flex h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-40", tone === "danger" ? "text-ink-3 hover:bg-danger-50 hover:text-danger" : "text-ink-3 hover:bg-surface-2 hover:text-ink");
  const tip = <span role="tooltip" className="pointer-events-none absolute right-full top-1/2 z-50 mr-1.5 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">{label}</span>;
  if (href) return <Link href={href} aria-label={label} className={cls}>{children}{tip}</Link>;
  return <button type="button" onClick={onClick} aria-label={label} disabled={disabled} className={cls}>{children}{tip}</button>;
}

/** Date-range presets for dashboards and reports (IST days). */
export function RangePicker({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const { set, pending } = useQueryState();
  return (
    <div className="inline-flex max-w-full items-center overflow-x-auto rounded-lg border border-line-2 bg-card p-0.5 no-scrollbar" role="group" aria-label="Date range">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => set({ range: o.value }, { replace: true })}
          className={cn("h-8 shrink-0 rounded-md px-3 text-xs font-semibold transition-colors duration-150 pointer-coarse:h-10 tap", o.value === value ? "bg-brand-600 text-white" : "text-ink-2 hover:bg-surface-2", pending && "cursor-progress")}>{o.label}</button>
      ))}
    </div>
  );
}
