"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export type TabItem = { value: string; label: React.ReactNode; count?: number; disabled?: boolean };

export function Tabs({ items, value, onChange, className, variant = "underline", size = "md" }: { items: TabItem[]; value: string; onChange: (v: string) => void; className?: string; variant?: "underline" | "pill"; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto no-scrollbar", variant === "underline" ? "border-b border-line" : "rounded-full bg-surface-2 p-1", className)}>
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button key={t.value} type="button" role="tab" aria-selected={active} disabled={t.disabled} onClick={() => onChange(t.value)}
            className={cn("tap relative shrink-0 whitespace-nowrap font-semibold transition-colors disabled:opacity-40",
              size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm",
              variant === "underline" ? cn("-mb-px border-b-2", active ? "border-brand-600 text-brand-700" : "border-transparent text-ink-3 hover:text-ink") : cn("rounded-full", active ? "bg-card text-ink shadow-card" : "text-ink-3 hover:text-ink"))}>
            {t.label}
            {typeof t.count === "number" ? <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular", active ? "bg-brand-100 text-brand-700" : "bg-surface-2 text-ink-3")}>{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, children, onClick, className, icon }: { active?: boolean; children: React.ReactNode; onClick?: () => void; className?: string; icon?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("tap inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors", active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-2 bg-card text-ink-2 hover:bg-surface-2", className)}>
      {icon}{children}
    </button>
  );
}
