"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type FaqItem = { id: string; q: string; a: string };

/** Accessible single-open accordion for the help centre. */
export function FaqAccordion({ items, className }: { items: FaqItem[]; className?: string }) {
  const [open, setOpen] = React.useState<string | null>(items[0]?.id ?? null);
  return (
    <div className={cn("divide-y divide-line rounded-lg border border-line bg-card shadow-card", className)}>
      {items.map((it) => {
        const active = open === it.id;
        return (
          <div key={it.id}>
            <button type="button" aria-expanded={active} aria-controls={`faq-${it.id}`} onClick={() => setOpen(active ? null : it.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold text-ink hover:bg-surface">
              {it.q}
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-4 transition-transform", active && "rotate-180")} />
            </button>
            <div id={`faq-${it.id}`} hidden={!active} className="px-4 pb-4 text-sm leading-relaxed text-ink-2">{it.a}</div>
          </div>
        );
      })}
    </div>
  );
}
