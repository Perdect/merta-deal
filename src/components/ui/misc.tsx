import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { cn, formatINR, initials } from "@/lib/utils";

export function Avatar({ name, src, size = 40, className }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name ?? ""} width={size} height={size} className={cn("rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cn("inline-flex items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700", className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>
  );
}

export function StarRating({ value, count, size = 14, className, showValue = true }: { value: number | null | undefined; count?: number | null; size?: number; className?: string; showValue?: boolean }) {
  const v = Number(value ?? 0);
  if (!v) return count === 0 || count == null ? <span className={cn("text-xs text-ink-3", className)}>New</span> : null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold text-ink-2", className)}>
      <Star style={{ width: size, height: size }} className="fill-saffron-500 text-saffron-500" />
      {showValue ? v.toFixed(1) : null}
      {typeof count === "number" && count > 0 ? <span className="font-normal text-ink-3">({count})</span> : null}
    </span>
  );
}

export function StarPicker({ value, onChange, size = 28 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star`} onClick={() => onChange(n)} className="transition-transform active:scale-90">
          <Star style={{ width: size, height: size }} className={cn(n <= value ? "fill-saffron-500 text-saffron-500" : "text-line-2")} />
        </button>
      ))}
    </div>
  );
}

export function Price({ price, mrp, size = "md", className }: { price: number | string | null | undefined; mrp?: number | string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const p = Number(price ?? 0); const m = Number(mrp ?? 0);
  const sizes = { sm: "text-sm", md: "text-base", lg: "text-2xl" };
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 tabular", className)}>
      <span className={cn("font-bold text-ink", sizes[size])}>{formatINR(p)}</span>
      {m > p ? <span className={cn("text-ink-3 line-through", size === "lg" ? "text-base" : "text-xs")}>{formatINR(m)}</span> : null}
    </span>
  );
}

/**
 * − qty + control. Buttons stay usable while a change is saving (`loading` only pulses the number):
 * callers queue taps (see setLineQuantity). At `max` the + is disabled and `maxLabel` explains why.
 */
export function QuantityStepper({ value, onChange, min = 0, max = 99, size = "md", disabled, className, loading, maxLabel }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: "sm" | "md"; disabled?: boolean; className?: string; loading?: boolean; maxLabel?: string }) {
  const h = size === "sm" ? "h-8" : "h-9";
  const atMax = value >= max;
  return (
    <div className={cn("inline-flex items-center rounded-sm bg-brand-600 text-white shadow-[0_1px_0_rgb(0_0_0/0.05)]", h, disabled && "opacity-60", className)}>
      <button type="button" aria-label={value <= 1 && min === 0 ? "Remove" : "Decrease"} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))} className={cn("tap flex items-center justify-center rounded-l-[inherit] transition-colors hover:bg-brand-700 disabled:opacity-50", size === "sm" ? "w-8" : "w-9", h)}><Minus className="h-4 w-4" /></button>
      <span className={cn("min-w-7 text-center text-sm font-bold tabular", loading && "animate-pulse-soft")} aria-live="polite">{value}</span>
      <button type="button" aria-label={atMax && maxLabel ? `Increase — ${maxLabel}` : "Increase"} title={atMax ? maxLabel : undefined} disabled={disabled || atMax} onClick={() => onChange(Math.min(max, value + 1))} className={cn("tap flex items-center justify-center rounded-r-[inherit] transition-colors hover:bg-brand-700 disabled:opacity-50", size === "sm" ? "w-8" : "w-9", h)}><Plus className="h-4 w-4" /></button>
    </div>
  );
}

export function Logo({ className, size = "md", light }: { className?: string; size?: "sm" | "md" | "lg"; light?: boolean }) {
  const heights = { sm: 25, md: 32, lg: 42 };
  return (
    <Link href="/" className={cn("tap inline-flex items-center gap-2", className)} aria-label="Merta Deal home">
      {light ? (
        <><LogoMark size={heights[size]} /><span className="font-display text-lg font-extrabold tracking-tight text-white">Merta<span className="text-saffron-300">Deal</span></span></>
      ) : (
        <Image src="/brand/merta-deal-wordmark.webp" alt="Merta Deal" width={870} height={205} className="h-auto w-auto" style={{ height: heights[size], maxWidth: "none" }} />
      )}
    </Link>
  );
}

/** Brand mark: green tile, white cart, saffron bolt (fast local delivery). Keep in sync with src/app/icon.svg. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#329537" />
      <g transform="translate(0 -2.5)">
        <path d="M12 18h6l5 22h22l5-16H21" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="26" cy="48" r="3.5" fill="#fff" />
        <circle cx="42" cy="48" r="3.5" fill="#fff" />
        <path d="M37 25l-6.5 9h5.5l-3 7.5 7.5-9.5h-5.5z" fill="#F2A93B" />
      </g>
    </svg>
  );
}

export function Pagination({ page, pageSize, total, onChange, className }: { page: number; pageSize: number; total: number; onChange: (p: number) => void; className?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className={cn("flex items-center justify-between gap-3 text-sm text-ink-3", className)}>
      <span>Page {page} of {pages} · {total} items</span>
      <div className="flex gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-line-2 bg-card text-ink disabled:bg-surface-2 disabled:text-ink-4 pointer-coarse:h-11 pointer-coarse:w-11 focus-visible:outline-2 focus-visible:outline-brand-600" aria-label="Previous page"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
        <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-line-2 bg-card text-ink disabled:bg-surface-2 disabled:text-ink-4 pointer-coarse:h-11 pointer-coarse:w-11 focus-visible:outline-2 focus-visible:outline-brand-600" aria-label="Next page"><ChevronRight className="h-4 w-4" aria-hidden /></button>
      </div>
    </div>
  );
}

export function KeyValue({ items, className }: { items: { label: string; value: React.ReactNode; strong?: boolean }[]; className?: string }) {
  return (
    <dl className={cn("space-y-2 text-sm", className)}>
      {items.map((it) => (
        <div key={it.label} className={cn("flex justify-between gap-4", it.strong && "border-t border-line pt-2 text-base font-bold")}>
          <dt className={cn("text-ink-3", it.strong && "text-ink")}>{it.label}</dt>
          <dd className={cn("text-right tabular text-ink", it.strong && "font-bold")}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PageHeader({ title, subtitle, back, action, className }: { title: string; subtitle?: React.ReactNode; back?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3 sm:px-0", className)}>
      {back ? <Link href={back} aria-label="Back" className="tap -ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"><ChevronLeft className="h-6 w-6" /></Link> : null}
      <div className="min-w-0 flex-1">
        <h1 className="text-balance break-words text-xl font-bold leading-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle ? <p className="text-sm text-ink-3">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Table({ columns, rows, keyField = "id", empty, className, onRowClick }: { columns: { key: string; header: React.ReactNode; className?: string; render?: (row: Record<string, unknown>) => React.ReactNode }[]; rows: Record<string, unknown>[]; keyField?: string; empty?: React.ReactNode; className?: string; onRowClick?: (row: Record<string, unknown>) => void }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-line bg-card", className)}>
      <table className="min-w-full text-sm">
        <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-3">
          <tr>{columns.map((c) => <th key={c.key} className={cn("px-4 py-3 font-semibold", c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 ? <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-ink-3">{empty ?? "Nothing here yet."}</td></tr> : rows.map((r) => (
            <tr key={String(r[keyField])} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn(onRowClick && "cursor-pointer hover:bg-surface")}>
              {columns.map((c) => <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>{c.render ? c.render(r) : (r[c.key] as React.ReactNode)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
