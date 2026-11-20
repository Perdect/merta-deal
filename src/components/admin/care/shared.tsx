import * as React from "react";
import { Star } from "lucide-react";
import type { SP } from "@/lib/data/admin";
import { cn, formatDate } from "@/lib/utils";

/* Server-safe helpers shared by the marketing, finance, care and system admin pages. */

/** Kit-style buttons (h-9, rounded-lg; 44 px tall on touch screens) for places that need a plain <button>/<a>. */
export const btn = {
  primary: "inline-flex h-9 pointer-coarse:h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:pointer-events-none disabled:opacity-50",
  secondary: "inline-flex h-9 pointer-coarse:h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line-2 bg-card px-3.5 text-sm font-semibold text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:pointer-events-none disabled:opacity-50",
  danger: "inline-flex h-9 pointer-coarse:h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-danger px-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#c02c24] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:pointer-events-none disabled:opacity-50",
  dangerOutline: "inline-flex h-9 pointer-coarse:h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-danger/30 bg-card px-3.5 text-sm font-semibold text-danger transition-colors duration-150 hover:bg-danger-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:pointer-events-none disabled:opacity-50",
  small: "h-8 pointer-coarse:h-11 px-2.5 text-xs",
};

/** Rebuilds the current list URL (all string params) with a patch; null removes a key. */
export function hrefWith(path: string, sp: SP, patch: Record<string, string | null> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "" && !(k in patch)) q.set(k, v);
  for (const [k, v] of Object.entries(patch)) if (v != null && v !== "") q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** "1 Sep – 30 Sep" (adds the year when the range crosses years or isn't this year). */
export function rangeLabel(start: string, end: string, thisYear: number) {
  const s = new Date(`${start}T00:00:00+05:30`); const e = new Date(`${end}T00:00:00+05:30`);
  const withYear = start.slice(0, 4) !== end.slice(0, 4) || Number(end.slice(0, 4)) !== thisYear;
  const o: Intl.DateTimeFormatOptions = withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" };
  return start === end ? formatDate(s, o) : `${formatDate(s, o)} – ${formatDate(e, o)}`;
}

/** Rating as stars plus words ("4 out of 5"), never colour alone. */
export function Stars({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="inline-flex" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => <Star key={i} className={cn("h-3.5 w-3.5", i < v ? "fill-saffron-500 text-saffron-500" : "text-line-2")} strokeWidth={1.9} />)}
      </span>
      <span className="text-xs font-semibold tabular text-ink-2">{v}/5<span className="sr-only"> stars</span></span>
    </span>
  );
}

/** Inline notice in the kit's visual language. */
export function Notice({ tone = "amber", title, children, className }: { tone?: "amber" | "red" | "blue"; title: string; children?: React.ReactNode; className?: string }) {
  const tones = { amber: "border-warning/35 bg-warning-50 text-warning", red: "border-danger/25 bg-danger-50 text-[#8a1f18]", blue: "border-info/25 bg-info-50 text-[#1e3a8a]" };
  return (
    <div role={tone === "red" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-0.5 text-[13px] opacity-90">{children}</div> : null}
    </div>
  );
}

/** Field label + control + inline error/hint, for forms not built from `@/components/ui` inputs. */
export function Field({ label, htmlFor, error, hint, required, children, className }: { label: string; htmlFor: string; error?: string | null; hint?: React.ReactNode; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-2">{label}{required ? <span className="text-danger"> *</span> : null}</label>
      {children}
      {error ? <p id={`${htmlFor}-error`} className="text-xs font-medium text-danger" role="alert">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}
