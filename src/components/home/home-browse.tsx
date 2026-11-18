"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronRight, LayoutGrid } from "lucide-react";
import type { CategoryTab } from "@/lib/data/catalog";
import { ProductImage } from "@/components/shop/product-image";
import { cn } from "@/lib/utils";

/**
 * The home's category selector and the sections it filters.
 *
 * The rail is the shop's own four lines, in the catalogue's `sort_order`, with each line's own picture
 * and tint from Admin → Categories — there is no slug list in here, so adding or reordering a line is
 * still a data change. Picking one hides the rows that belong to the others; "All" brings them back.
 *
 * The sections themselves are rendered on the server and handed in as nodes, so filtering costs no
 * fetch and no re-render of the product grids: a hidden row is `hidden`, still in the document, still
 * indexable, and instantly back when the customer taps All. A line with nothing listed yet says so
 * rather than showing an empty screen.
 */
export type BrowseItem = { key: string; node: React.ReactNode };

const ALL = "__all__";

export function HomeBrowse({ tabs, items, banner, seeAllHref = "/categories" }: {
  tabs: CategoryTab[];
  items: BrowseItem[];
  banner?: React.ReactNode;
  seeAllHref?: string;
}) {
  const [active, setActive] = React.useState<string>(ALL);
  const railRef = React.useRef<HTMLDivElement>(null);

  const options = React.useMemo(() => [{ slug: ALL, name: "All", image: null as string | null, color: null as string | null, count: -1 }, ...tabs.map((t) => ({ slug: t.slug, name: t.name, image: t.image, color: t.color, count: t.count }))], [tabs]);

  // A line the customer picked but that has no row of its own (nothing listed yet) still gets an answer.
  const shown = active === ALL ? items : items.filter((i) => i.key === active);
  const activeTab = tabs.find((t) => t.slug === active);

  /** Left/Right move between tabs the way a tablist is expected to, and the new tab takes focus. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.slug === active);
    const next = e.key === "ArrowRight" ? (i + 1) % options.length
      : e.key === "ArrowLeft" ? (i - 1 + options.length) % options.length
      : e.key === "Home" ? 0 : options.length - 1;
    setActive(options[next].slug);
    const el = railRef.current?.querySelector<HTMLButtonElement>(`[data-slug="${CSS.escape(options[next].slug)}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  };

  return (
    <>
      <section aria-labelledby="cats-title" className="px-4 sm:px-0">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="cats-title" className="font-display text-[15px] font-bold text-ink sm:text-lg">Shop by category</h2>
          <Link href={seeAllHref} className="tap inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">
            See all<ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        {/* Negative margin + matching padding: the rail scrolls edge to edge without clipping the
            selected ring, and still lines up with the 16px page gutter. `scroll-x` snaps children to
            the scrollport start, so scroll-pl-4 keeps that gutter on the first tile. */}
        <div
          ref={railRef}
          role="tablist"
          aria-label="Shop by category"
          onKeyDown={onKeyDown}
          className="scroll-x -mx-4 gap-2.5 px-4 pb-1 pt-0.5 scroll-pl-4 sm:mx-0 sm:px-0 sm:scroll-pl-0"
        >
          {options.map((o) => {
            const selected = o.slug === active;
            return (
              <button
                key={o.slug}
                type="button"
                role="tab"
                data-slug={o.slug}
                aria-selected={selected}
                aria-controls="home-browse-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(o.slug)}
                className={cn(
                  "group flex w-[76px] shrink-0 flex-col items-center gap-1.5 rounded-xl pb-1 pt-0.5 transition sm:w-[86px]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                )}
              >
                <span
                  aria-hidden
                  style={!selected && o.color ? { backgroundColor: o.color } : undefined}
                  className={cn(
                    "flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-2xl p-1.5 transition duration-200 sm:h-[68px] sm:w-[68px]",
                    "group-active:scale-[0.96] motion-reduce:transform-none",
                    selected ? "bg-brand-600 ring-2 ring-brand-600 ring-offset-2 ring-offset-surface" : !o.color && "bg-surface-2",
                  )}
                >
                  {o.slug === ALL
                    ? <LayoutGrid className={cn("h-6 w-6", selected ? "text-white" : "text-ink-2")} strokeWidth={1.9} />
                    : <ProductImage image={o.image} productName={o.name} className={cn("h-full w-full", selected && "rounded-xl bg-white/95")} rounded="rounded-xl" sizes="68px" />}
                </span>
                <span className={cn("line-clamp-2 text-center text-[11.5px] leading-tight sm:text-xs", selected ? "font-bold text-brand-800" : "font-semibold text-ink-2")}>
                  {o.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {banner}

      {/* Every section stays mounted; the ones outside the chosen line are hidden rather than dropped,
          so switching back is instant and a crawler still sees the whole home. */}
      <div id="home-browse-panel" role="tabpanel" aria-label={activeTab ? activeTab.name : "All categories"} className="contents">
        {items.map((i) => (
          <div key={i.key} hidden={!shown.includes(i)} className={cn(!shown.includes(i) && "hidden")}>
            {i.node}
          </div>
        ))}
      </div>

      {active !== ALL && shown.length === 0 ? (
        <section className="px-4 sm:px-0">
          <div className="rounded-lg border border-line bg-card p-6 text-center shadow-card">
            <p className="font-display text-base font-bold text-ink">{activeTab?.name ?? "This category"} is coming soon</p>
            <p className="mt-1 text-sm text-ink-2">We&rsquo;re still stocking this shelf. Everything else is ready to order now.</p>
            <button type="button" onClick={() => setActive(ALL)} className="tap mt-3 inline-flex min-h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
              Show everything
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
