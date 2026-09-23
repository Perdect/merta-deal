import { cn, formatDate, formatINR, formatNumber } from "@/lib/utils";

export type BarPoint = { label: string; value: number; secondary?: number };

/**
 * Dependency-free bar chart (divs + CSS). Primary series as bars; optional secondary series as a
 * thin overlay bar. Server-component safe.
 */
export function BarChart({ points, primaryLabel, secondaryLabel, money, secondaryMoney, height = 160, className }: { points: BarPoint[]; primaryLabel: string; secondaryLabel?: string; money?: boolean; secondaryMoney?: boolean; height?: number; className?: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const max2 = Math.max(1, ...points.map((p) => p.secondary ?? 0));
  const fmt = (v: number, m?: boolean) => (m ? formatINR(v) : formatNumber(v));
  if (!points.length) return <div className={cn("flex items-center justify-center rounded-md bg-surface text-sm text-ink-3", className)} style={{ height }}>No data for this period yet.</div>;
  return (
    <div className={className}>
      <div className="flex items-end gap-1 sm:gap-1.5" style={{ height }} role="img" aria-label={`${primaryLabel} by day`}>
        {points.map((p) => (
          <div key={p.label} className="group relative flex h-full flex-1 flex-col justify-end" title={`${p.label}: ${fmt(p.value, money)}${p.secondary != null && secondaryLabel ? ` · ${secondaryLabel} ${fmt(p.secondary, secondaryMoney)}` : ""}`}>
            <div className="relative w-full rounded-t-sm bg-brand-500/85 transition-colors group-hover:bg-brand-600" style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }}>
              {p.secondary != null ? <div className="absolute inset-x-1/4 bottom-0 rounded-t-sm bg-saffron-500" style={{ height: `${Math.max(1, (p.secondary / max2) * 100)}%`, maxHeight: "100%" }} aria-hidden /> : null}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 sm:gap-1.5">
        {points.map((p, i) => <span key={p.label} className={cn("flex-1 truncate text-center text-[10px] tabular text-ink-3", points.length > 10 && i % 2 === 1 && "invisible sm:visible")}>{p.label}</span>)}
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-xs bg-brand-500" /> {primaryLabel}</span>
        {secondaryLabel ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-xs bg-saffron-500" /> {secondaryLabel}</span> : null}
      </div>
    </div>
  );
}

/** Formats an ISO date (YYYY-MM-DD) as a short day label for chart axes. */
export function dayLabel(iso: string) {
  return formatDate(`${iso}T00:00:00+05:30`, { day: "numeric", month: "short" });
}

/** Horizontal ranked bars for "top N" lists. */
export function RankedBars({ rows, money, className }: { rows: { label: string; value: number; hint?: string; href?: string }[]; money?: boolean; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className={cn("py-6 text-center text-sm text-ink-3", className)}>Nothing to rank yet.</p>;
  return (
    <ol className={cn("space-y-2", className)}>
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-medium text-ink">{i + 1}. {r.href ? <a href={r.href} className="hover:underline">{r.label}</a> : r.label}{r.hint ? <span className="ml-1.5 text-xs text-ink-3">{r.hint}</span> : null}</span>
            <span className="shrink-0 tabular font-semibold text-ink">{money ? formatINR(r.value) : formatNumber(r.value)}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ol>
  );
}
