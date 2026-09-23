import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { cn } from "@/lib/utils";

export type AccountMenuItem = { href: string; label: string; icon: string; hint?: string; badge?: React.ReactNode };

/** Grouped list of navigation rows used on the account hub. */
export function AccountMenu({ items, title, className }: { items: AccountMenuItem[]; title?: string; className?: string }) {
  if (!items.length) return null;
  return (
    <section className={cn("rounded-lg border border-line bg-card shadow-card", className)}>
      {title ? <h2 className="px-4 pt-3.5 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</h2> : null}
      <ul className="divide-y divide-line">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><DynamicIcon name={it.icon} className="h-4.5 w-4.5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{it.label}</span>
                {it.hint ? <span className="block truncate text-xs text-ink-3">{it.hint}</span> : null}
              </span>
              {it.badge}
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-4" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
