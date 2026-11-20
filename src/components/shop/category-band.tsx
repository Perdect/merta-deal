"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import type { CategoryTab } from "@/lib/data/catalog";
import { cn } from "@/lib/utils";

/**
 * The shop's lines as a compact band: a picture over a name for each one, the current line filled brand
 * green and standing on the band's bottom rule. It is the home's category tabs at listing size, so a
 * customer inside one line is always one tap from the others.
 *
 * Everything comes from the catalogue (`getCategoryTabs()`): the running order is `sort_order`, the
 * picture is the one set in Admin → Categories. There is no slug list here, so a new line appears by
 * itself. The lines share the width when they fit and the band scrolls sideways when a longer
 * catalogue does not.
 *
 * `bandClass`, `bandRailClass`, `bandItemClass` and `BandPicture` are exported for the Categories screen,
 * whose tabs look the same but switch in place instead of navigating.
 */
export type BandLine = Pick<CategoryTab, "slug" | "name" | "image">;

export const bandClass = "border-b-2 border-brand-600 bg-gradient-to-b from-brand-100 via-brand-50 to-brand-50 pt-1.5 sm:rounded-t-2xl sm:pt-2";
export const bandRailClass = "no-scrollbar flex items-end overflow-x-auto px-1 sm:justify-center sm:gap-2 sm:px-4";
export const bandSlotClass = "min-w-[76px] flex-1 sm:max-w-[150px]";

export function bandItemClass(on: boolean) {
  return cn(
    "flex min-h-[66px] w-full flex-col items-center gap-0.5 rounded-t-2xl px-0.5 pb-1 pt-1.5 text-center transition-colors duration-200 motion-reduce:transition-none sm:px-2",
    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700",
    on ? "bg-brand-600 text-white shadow-[0_-4px_14px_rgba(21,128,61,0.25)]" : "text-ink hover:bg-white/60 active:bg-white/80",
  );
}

/** The line's own picture, or a plain box when Admin → Categories has none for it. */
export function BandPicture({ image, on }: { image: string | null; on: boolean }) {
  return (
    <span className={cn("relative flex h-8 w-11 items-center justify-center transition-transform duration-200 motion-reduce:transform-none motion-reduce:transition-none", on && "scale-110")}>
      {image ? <Image src={image} alt="" fill sizes="56px" className="object-contain drop-shadow-sm" /> : <Package className="h-6 w-6" strokeWidth={1.8} aria-hidden />}
    </span>
  );
}

/** Two lines are always reserved, so a one-line name ("Snacks & Drinks") keeps its picture level with the rest. */
export function BandName({ children }: { children: React.ReactNode }) {
  return <span className="flex min-h-[2.3em] items-center text-[11px] font-semibold leading-[1.15] sm:text-xs"><span className="line-clamp-2">{children}</span></span>;
}

export function CategoryBand({ lines, active, label = "Shop by category", className }: {
  lines: BandLine[];
  /** Slug of the line being shown, if any. */
  active?: string;
  label?: string;
  className?: string;
}) {
  const rail = React.useRef<HTMLUListElement>(null);
  // A long catalogue scrolls: bring the current line into the middle of the band. Only the band moves,
  // never the page (scrollIntoView would also pull the page up to the band after a Back navigation).
  React.useEffect(() => {
    const el = rail.current; const cur = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !cur || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = cur.offsetLeft - (el.clientWidth - cur.offsetWidth) / 2;
  }, [active]);

  // One line is not a choice.
  if (lines.length < 2) return null;
  return (
    <nav aria-label={label} className={cn(bandClass, className)}>
      <ul ref={rail} className={bandRailClass}>
        {lines.map((l) => {
          const on = l.slug === active;
          return (
            <li key={l.slug} className={bandSlotClass}>
              <Link href={`/c/${l.slug}`} aria-current={on ? "page" : undefined} className={bandItemClass(on)}>
                <BandPicture image={l.image} on={on} />
                <BandName>{l.name}</BandName>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
