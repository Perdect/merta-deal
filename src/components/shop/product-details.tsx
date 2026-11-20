"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type DetailRow = { label: string; value: React.ReactNode };

/** Label/value block ("Highlights", "Information") that folds after a few rows behind View More. */
export function DetailSection({ title, rows, initial = 4, className }: { title: string; rows: DetailRow[]; initial?: number; className?: string }) {
  const [open, setOpen] = React.useState(false);
  if (!rows.length) return null;
  const shown = open ? rows : rows.slice(0, initial);
  return (
    <section className={cn("rounded-2xl border border-line bg-card p-4", className)}>
      <h2 className="flex items-center gap-3 font-display text-lg font-bold text-ink"><span>{title}</span><span className="h-px flex-1 bg-line" /></h2>
      <dl className="mt-3.5 grid grid-cols-[112px_minmax(0,1fr)] gap-x-4 gap-y-3 text-[15px] leading-snug sm:grid-cols-[168px_minmax(0,1fr)]">
        {shown.map((r) => (
          <React.Fragment key={r.label}>
            <dt className="text-ink-3">{r.label}</dt>
            <dd className="min-w-0 break-words text-ink">{r.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {rows.length > initial ? (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="tap inline-flex min-h-10 items-center gap-1 rounded-full bg-brand-50 px-4 text-sm font-bold text-brand-700 transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-reduce:transition-none">
            {open ? "View Less" : "View More"}<ChevronDown className={cn("h-4 w-4 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
          </button>
        </div>
      ) : null}
    </section>
  );
}
