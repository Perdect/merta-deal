"use client";
import * as React from "react";
import { cn, formatINR, formatNumber } from "@/lib/utils";

export type TrendPoint = { label: string; orders: number; sales: number };

/** Width of an element, kept current with a ResizeObserver (null until measured). */
function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [w, setW] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Orders (bars) and sales (line) on one lightweight SVG — no chart library. Sales use their own
 * scale on the right. Drawn at the real width of its box (not scaled), so axis labels stay a
 * readable size on phones and fewer day labels are shown when space is tight. A visually-hidden
 * table carries the same numbers for screen readers.
 */
export function TrendChart({ points, height = 220, className }: { points: TrendPoint[]; height?: number; className?: string }) {
  const [ref, measured] = useWidth<HTMLElement>();
  if (!points.length || points.every((p) => !p.orders && !p.sales)) {
    return <div className={cn("flex items-center justify-center rounded-lg bg-surface text-sm text-ink-3", className)} style={{ height }}>No orders in this period.</div>;
  }
  const W = measured ?? 720; const H = measured && measured < 480 ? Math.min(height, 190) : height; const padL = 34; const padR = 52; const padT = 12; const padB = 26;
  const iw = W - padL - padR; const ih = H - padT - padB;
  const maxO = niceMax(Math.max(...points.map((p) => p.orders)));
  const maxS = niceMax(Math.max(...points.map((p) => p.sales)));
  const step = iw / points.length; const bw = Math.max(3, Math.min(28, step * 0.55));
  const x = (i: number) => padL + step * i + step / 2;
  const yO = (v: number) => padT + ih - (v / maxO) * ih;
  const yS = (v: number) => padT + ih - (v / maxS) * ih;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yS(p.sales).toFixed(1)}`).join(" ");
  // One day label per ~56px so they never collide (10 at most).
  const every = Math.ceil(points.length / Math.max(2, Math.min(10, Math.floor(iw / 56))));
  const ticks = [0, 0.5, 1];
  return (
    <figure ref={ref} className={cn("min-w-0", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Orders and sales by day">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={padT + ih - t * ih} y2={padT + ih - t * ih} stroke="#e6e6e1" strokeDasharray={t ? "3 4" : undefined} />
            <text x={padL - 6} y={padT + ih - t * ih + 4} textAnchor="end" fontSize="11" fill="#7a837e">{formatNumber(Math.round(maxO * t))}</text>
            <text x={W - padR + 6} y={padT + ih - t * ih + 4} fontSize="11" fill="#7a837e">{compactINR(maxS * t)}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.label + i}>
            <rect x={x(i) - bw / 2} y={yO(p.orders)} width={bw} height={Math.max(0, padT + ih - yO(p.orders))} rx={3} fill="#b9dfbb">
              <title>{`${p.label}: ${p.orders} orders, ${formatINR(p.sales)} sales`}</title>
            </rect>
            {i % every === 0 ? <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#7a837e">{p.label}</text> : null}
          </g>
        ))}
        <path d={line} fill="none" stroke="#329537" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={yS(p.sales)} r={points.length > 31 ? 0 : 2.5} fill="#fff" stroke="#329537" strokeWidth={1.5} />)}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#b9dfbb]" aria-hidden />Orders (left axis)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-brand-600" aria-hidden />Sales, ₹ (right axis)</span>
      </figcaption>
      <table className="sr-only">
        <caption>Orders and sales by day</caption>
        <thead><tr><th>Day</th><th>Orders</th><th>Sales</th></tr></thead>
        <tbody>{points.map((p, i) => <tr key={i}><td>{p.label}</td><td>{p.orders}</td><td>{formatINR(p.sales)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Horizontal stacked bar + legend for a categorical breakdown (e.g. order status). */
export function BreakdownBar({ items, total }: { items: { label: string; value: number; color: string; href?: string }[]; total: number }) {
  if (!total) return <p className="py-6 text-center text-sm text-ink-3">No orders in this period.</p>;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {items.filter((i) => i.value).map((i) => <span key={i.label} style={{ width: `${(i.value / total) * 100}%`, background: i.color }} />)}
      </div>
      <ul className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {items.map((i) => {
          const body = <><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.color }} aria-hidden /><span className="min-w-0 flex-1 truncate text-ink-2">{i.label}</span><span className="tabular font-semibold text-ink">{i.value}</span><span className="w-10 text-right text-xs tabular text-ink-4">{Math.round((i.value / total) * 100)}%</span></>;
          return <li key={i.label}>{i.href ? <a href={i.href} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-surface-2 pointer-coarse:min-h-11">{body}</a> : <span className="flex items-center gap-2 px-1 py-0.5 text-sm">{body}</span>}</li>;
        })}
      </ul>
    </div>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function compactINR(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}k`;
  return `₹${Math.round(v)}`;
}
