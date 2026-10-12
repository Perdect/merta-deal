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
      <dl className="mt-4 grid grid-cols-[112px_1fr] gap-x-4 gap-y-4 text-[15px] leading-snug sm:grid-cols-[168px_1fr]">
        {shown.map((r) => (
          <React.Fragment key={r.label}>
            <dt className="text-ink-3">{r.label}</dt>
            <dd className="min-w-0 break-words text-ink">{r.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {rows.length > initial ? (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-bold text-brand-700 hover:bg-brand-100">
            {open ? "View Less" : "View More"}<ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      ) : null}
    </section>
  );
}
