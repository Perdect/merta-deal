import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { BackLink } from "./client";

/* ================================================================================================
 * Admin design system — server-safe pieces (no hooks). Interactive parts live in ./client.tsx.
 * Visual language: pale grey canvas, white 14px cards with hairline borders and a barely-there
 * shadow, compact tables, green accent (brand-*), status always carries text as well as colour.
 * ============================================================================================== */

/** Transaction amounts: always two decimals (₹155.78, ₹200.00), so columns line up. */
export const rupees = (v: number | string | null | undefined) => formatINR(v, { precise: true });
/** Aggregates and KPIs: whole rupees. */
export const rupeesRounded = (v: number | string | null | undefined) => formatINR(Math.round(Number(v ?? 0)));

export const card = "rounded-[14px] border border-line bg-card shadow-[0_1px_2px_rgb(23_32_28/0.04)]";

/** The single page heading. Actions sit on the right and wrap under the title on phones. */
export function AdminPageHeader({ title, description, actions, back, meta, className }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode;
  /** Fallback list URL; the link returns to the exact list position when history allows. */
  back?: string; meta?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-2">
        {back ? <BackLink fallback={back} /> : null}
        <div className="min-w-0">
          <h1 className="text-balance break-words font-display text-[22px] font-bold leading-tight text-ink">{title}</h1>
          {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** White card section with an optional header row. */
export function Panel({ title, description, actions, children, className, bodyClassName, flush, footer, id }: {
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode;
  className?: string; bodyClassName?: string; /** No body padding (tables, lists). */ flush?: boolean; footer?: React.ReactNode; id?: string;
}) {
  return (
    <section id={id} className={cn(card, "min-w-0", className)}>
      {title || actions ? (
        <header className={cn("flex items-start justify-between gap-3 px-4 pt-4 sm:px-5", flush ? "pb-3" : "pb-1")}>
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold text-ink">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-ink-3">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(flush ? "" : "px-4 pb-4 pt-3 sm:px-5", !title && !actions && !flush && "pt-4", bodyClassName)}>{children}</div>
      {footer ? <footer className="border-t border-line px-4 py-3 sm:px-5">{footer}</footer> : null}
    </section>
  );
}

/** Period-labelled KPI. `change` is only passed when a previous period exists to compare with. */
export function MetricCard({ label, period, value, hint, icon: Icon, href, change, tone = "default" }: {
  label: string; period?: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; href?: string;
  change?: { pct: number; label: string; goodWhenUp?: boolean } | null; tone?: "default" | "attention";
}) {
  const up = change ? change.pct >= 0 : false;
  const good = change ? (change.goodWhenUp === false ? !up : up) : false;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink-2">{label}</p>
          {period ? <p className="text-[11px] text-ink-4">{period}</p> : null}
        </div>
        {Icon ? <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone === "attention" ? "bg-warning-50 text-[#8a6300]" : "bg-brand-50 text-brand-700")}><Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden /></span> : null}
      </div>
      <p className="mt-2 break-words font-display text-[22px] font-bold leading-none tabular text-ink sm:text-[26px]">{value}</p>
      <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        {change ? (
          <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold", good ? "bg-success-50 text-success" : "bg-danger-50 text-danger")}>
            {up ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
            <span>{up ? "Up" : "Down"} {Math.abs(change.pct)}%</span>
          </span>
        ) : null}
        {change ? <span>{change.label}</span> : null}
        {hint ? <span>{hint}</span> : null}
      </div>
    </>
  );
  const cls = cn(card, "block p-4 transition-shadow duration-200", href && "hover:shadow-card focus-visible:outline-2 focus-visible:outline-brand-600", tone === "attention" && "border-warning/40");
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "violet";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 ring-line-2",
  green: "bg-success-50 text-[#26782a] ring-success/25",
  amber: "bg-warning-50 text-[#7a5600] ring-warning/35",
  red: "bg-danger-50 text-[#b4231b] ring-danger/25",
  blue: "bg-info-50 text-[#1d4ed8] ring-info/25",
  violet: "bg-[#f3efff] text-[#5b3cc4] ring-[#5b3cc4]/20",
};
const DOT: Record<Tone, string> = { neutral: "bg-ink-4", green: "bg-success", amber: "bg-warning", red: "bg-danger", blue: "bg-info", violet: "bg-[#5b3cc4]" };

/** Status pill: a coloured dot plus the status in words (never colour alone). */
export function StatusPill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Maps the app's older BadgeTone names onto pill tones. */
export function toneOf(t: string | undefined): Tone {
  switch (t) {
    case "success": case "brand": return "green";
    case "warning": case "saffron": return "amber";
    case "danger": return "red";
    case "info": return "blue";
    case "dark": return "violet";
    default: return "neutral";
  }
}

export type Column<T> = {
  key: string; header: React.ReactNode; render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center"; className?: string;
  /** Hide on narrow screens; essential columns omit this. */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  width?: string;
  /** Label shown beside the value on phone cards when `header` isn't plain text. */
  label?: string;
};
/* Column visibility follows the table's own width (container queries), not the window: the
   sidebar takes 240px, so window breakpoints would overflow the table on laptops. Thresholds:
   sm 512px · md 672px · lg 896px · xl 1152px of table width. */
const HIDE = { sm: "hidden @lg:table-cell", md: "hidden @2xl:table-cell", lg: "hidden @4xl:table-cell", xl: "hidden @6xl:table-cell" };

/* Below 512px of table width (phones, narrow panels) each row becomes a card: the first column is
   the title, every other essential column a "label · value" line (label from data-label), and the
   actions column sits at the bottom. Columns with `hideBelow` are already hidden at that width. */
const CARD_ROW = "@max-lg:flex @max-lg:flex-col @max-lg:gap-1.5 @max-lg:border-b @max-lg:border-line @max-lg:px-4 @max-lg:py-3 @max-lg:last:border-b-0";
const CARD_TITLE = "@max-lg:block @max-lg:border-0 @max-lg:p-0 @max-lg:first:pl-0 @max-lg:text-left";
const CARD_CELL = "@max-lg:flex @max-lg:min-h-6 @max-lg:items-center @max-lg:justify-between @max-lg:gap-3 @max-lg:border-0 @max-lg:p-0 @max-lg:first:pl-0 @max-lg:last:pr-0 @max-lg:text-right @max-lg:before:shrink-0 @max-lg:before:text-left @max-lg:before:text-xs @max-lg:before:text-ink-3 @max-lg:before:content-[attr(data-label)]";
const CARD_ACTIONS = "@max-lg:flex @max-lg:flex-wrap @max-lg:items-center @max-lg:justify-end @max-lg:gap-2 @max-lg:border-0 @max-lg:p-0 @max-lg:pt-1 @max-lg:last:pr-0";

const headerText = (c: { header: React.ReactNode; label?: string }) => c.label ?? (typeof c.header === "string" || typeof c.header === "number" ? String(c.header) : "");

/**
 * Compact data table with a sticky header (the table scrolls inside its card so the header stays
 * visible). On phones it turns into a list of cards. Server-safe: render functions run where the
 * table is rendered.
 */
export function DataTable<T>({ columns, rows, rowKey, empty, caption, className, maxHeight = "calc(100dvh - 260px)", selectedKey }: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: React.ReactNode; caption?: string; className?: string;
  maxHeight?: string | null; selectedKey?: string | null;
}) {
  const lastKey = columns[columns.length - 1]?.key;
  const cellCard = (c: Column<T>, i: number) => c.hideBelow ? "" : i === 0 ? CARD_TITLE : c.key === lastKey && !headerText(c) ? CARD_ACTIONS : CARD_CELL;
  return (
    <div className={cn(card, "@container overflow-hidden", className)}>
      {/* The inner scroll box (which keeps the header sticky) only applies from tablet width up;
          on phones the page itself scrolls, avoiding a scroll area nested inside another. */}
      <div className={cn("overflow-x-auto", maxHeight && "md:max-h-[var(--tbl-max)] md:overflow-y-auto")} style={maxHeight ? ({ "--tbl-max": maxHeight } as React.CSSProperties) : undefined}>
        <table className="w-full border-separate border-spacing-0 text-sm @max-lg:block">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="@max-lg:sr-only">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined}
                  className={cn("sticky top-0 z-10 whitespace-nowrap border-b border-line bg-[#fafbfa] px-2.5 py-2.5 @4xl:px-3 text-xs font-semibold text-ink-3 first:pl-4 last:pr-4",
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left", c.hideBelow && HIDE[c.hideBelow])}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="@max-lg:block">
            {rows.length === 0 ? (
              <tr className="@max-lg:block"><td colSpan={columns.length} className="px-4 py-2 @max-lg:block">{empty ?? <p className="py-10 text-center text-sm text-ink-3">Nothing here yet.</p>}</td></tr>
            ) : rows.map((r) => {
              const k = rowKey(r);
              return (
                <tr key={k} className={cn("transition-colors duration-150 hover:bg-[#f8faf8]", CARD_ROW, selectedKey === k && "bg-brand-50/60 hover:bg-brand-50/60")}>
                  {columns.map((c, i) => (
                    <td key={c.key} data-label={i === 0 ? undefined : headerText(c)} className={cn("border-b border-line px-2.5 py-2.5 align-middle @4xl:px-3 first:pl-4 last:pr-4 [tr:last-child>&]:border-b-0",
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left", c.hideBelow && HIDE[c.hideBelow], c.className, cellCard(c, i))}>{i === 0 ? c.render(r) : <div className="min-w-0 @max-lg:flex @max-lg:flex-wrap @max-lg:items-center @max-lg:justify-end @max-lg:gap-x-2 @max-lg:gap-y-1">{c.render(r)}</div>}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Two-line cell: bold primary text over muted secondary text. */
export function CellStack({ primary, secondary, href, className, scroll }: { primary: React.ReactNode; secondary?: React.ReactNode; href?: string; className?: string; scroll?: boolean }) {
  const p = <span className="block truncate font-medium text-ink">{primary}</span>;
  return (
    <span className={cn("block min-w-0 max-w-[220px] @5xl:max-w-[280px] @max-lg:max-w-full", className)}>
      {href ? <Link href={href} scroll={scroll} className="block truncate font-medium text-ink hover:text-brand-700 hover:underline pointer-coarse:-my-3 pointer-coarse:py-3">{primary}</Link> : p}
      {secondary ? <span className="block truncate text-xs text-ink-3">{secondary}</span> : null}
    </span>
  );
}

/** Label / value rows for detail panels. */
export function DetailList({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode; strong?: boolean }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line text-sm", className)}>
      {items.map((i, n) => (
        <div key={n} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="shrink-0 text-ink-3">{i.label}</dt>
          <dd className={cn("min-w-0 text-right tabular", i.strong ? "font-semibold text-ink" : "text-ink-2")}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Long forms are grouped into labelled sections. */
export function FormSection({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn(card, "p-4 sm:p-5", className)}>
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-ink-3">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Link row used in "Needs attention" style lists. */
export function ActionRow({ href, icon: Icon, title, detail, tone = "amber", count }: { href: string; icon: LucideIcon; title: string; detail?: string; tone?: Tone; count?: number }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone === "red" ? "bg-danger-50 text-danger" : tone === "blue" ? "bg-info-50 text-info" : tone === "green" ? "bg-success-50 text-success" : "bg-warning-50 text-[#8a6300]")}><Icon className="h-4 w-4" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {detail ? <span className="block truncate text-xs text-ink-3">{detail}</span> : null}
      </span>
      {count != null ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold tabular text-ink-2">{count}</span> : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden />
    </Link>
  );
}

/** Small "View" style button-link used in table rows. */
export function RowLink({ href, children = "View", label, scroll }: { href: string; children?: React.ReactNode; label?: string; scroll?: boolean }) {
  return <Link href={href} scroll={scroll} aria-label={label} className="inline-flex h-8 items-center rounded-lg border border-line-2 bg-card px-2.5 text-xs font-semibold text-ink-2 pointer-coarse:h-11 pointer-coarse:px-3.5 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600">{children}</Link>;
}

/** Inline empty / no-results block for inside panels and tables. */
export function EmptyBlock({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {Icon ? <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-3"><Icon className="h-5 w-5" aria-hidden /></span> : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Failed request block with a Retry that re-runs the server render. */
export function ErrorBlock({ title = "Couldn't load this", description, retryHref }: { title?: string; description?: React.ReactNode; retryHref: string }) {
  return (
    <div role="alert" className={cn(card, "flex flex-col items-center px-4 py-10 text-center")}>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-3">{description}</p> : null}
      <a href={retryHref} className="mt-4 inline-flex h-9 items-center pointer-coarse:h-11 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">Retry</a>
    </div>
  );
}
