"use client";
import * as React from "react";
import Image from "next/image";
import { LayoutGrid, Package } from "lucide-react";
import type { CategoryTab } from "@/lib/data/catalog";
import { cn } from "@/lib/utils";

/**
 * The home's category tabs and everything they switch.
 *
 * The tabs are a band across the top of the home: a picture over a name for each of the shop's lines, the
 * chosen one filled brand green and standing on the band's bottom line. "All" comes first and is the
 * default, then the lines in the catalogue's `sort_order` with the picture and tint set in Admin →
 * Categories — there is no slug list in here, so adding or reordering a line is still an admin change.
 *
 * Under "All" the home leads with the banner and the Deal Zone (`lead`), then every row. Picking a line
 * hides the lead and the rows that belong to the others; "All" brings them back. On a phone the tabs share
 * the width when they fit and the band scrolls sideways when a longer catalogue does not.
 *
 * The lead and the sections are rendered on the server and handed in as nodes, so switching costs no
 * fetch and no re-render of the product grids: what is not chosen is `hidden`, still in the document, still
 * indexable, and instantly back when the customer taps All. A line with nothing listed yet says so
 * rather than showing an empty screen.
 */
export type BrowseItem = { key: string; node: React.ReactNode };

const ALL = "__all__";

export function HomeBrowse({ tabs, items, lead }: {
  tabs: CategoryTab[];
  items: BrowseItem[];
  /** Banner and offers: shown under "All" only. */
  lead?: React.ReactNode;
}) {
  const [active, setActive] = React.useState<string>(ALL);
  const railRef = React.useRef<HTMLDivElement>(null);

  const options = React.useMemo(() => [{ slug: ALL, name: "All", image: null as string | null }, ...tabs.map((t) => ({ slug: t.slug, name: t.name, image: t.image }))], [tabs]);

  // A line the customer picked but that has no row of its own (nothing listed yet) still gets an answer.
  const shown = active === ALL ? items : items.filter((i) => i.key === active);
  const activeTab = tabs.find((t) => t.slug === active);

  /** Choose a tab and keep its pill in view: on a phone the track scrolls, and the choice must not sit off-screen. */
  const select = (slug: string, focus = false) => {
    setActive(slug);
    const el = railRef.current?.querySelector<HTMLButtonElement>(`[data-slug="${CSS.escape(slug)}"]`);
    if (focus) el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  };

  /** Left/Right/Home/End move between tabs the way a tablist is expected to, and the new tab takes focus. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.slug === active);
    const next = e.key === "ArrowRight" ? (i + 1) % options.length
      : e.key === "ArrowLeft" ? (i - 1 + options.length) % options.length
      : e.key === "Home" ? 0 : options.length - 1;
    select(options[next].slug, true);
  };

  return (
    <>
      {/* The band runs edge to edge on a phone and sits flush under the header; from sm up it is a rounded strip. */}
      <section aria-labelledby="cats-title" className="max-sm:-mt-2.5! border-b-2 border-brand-600 bg-gradient-to-b from-brand-100 via-brand-50 to-brand-50/60 pt-2 sm:rounded-t-2xl sm:pt-3">
        <h2 id="cats-title" className="sr-only">Shop by category</h2>
        <div
          ref={railRef}
          role="tablist"
          aria-label="Shop by category"
          onKeyDown={onKeyDown}
          className="no-scrollbar flex items-end overflow-x-auto px-1 sm:justify-center sm:gap-2 sm:px-4"
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
                onClick={() => select(o.slug)}
                className={cn(
                  "flex min-h-[78px] flex-col items-center gap-1 rounded-t-2xl px-0.5 pb-1.5 pt-2 text-center transition-colors motion-reduce:transition-none sm:max-w-[150px] sm:flex-1 sm:px-2",
                  // "All" is one short word, so it gives its width to the lines whose names run to two.
                  o.slug === ALL ? "w-[58px] shrink-0" : "min-w-[80px] flex-1",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700",
                  selected ? "bg-brand-600 text-white shadow-[0_-4px_14px_rgba(21,128,61,0.25)]" : "text-ink hover:bg-white/60",
                )}
              >
                <span className={cn("relative flex h-10 w-12 items-center justify-center transition-transform duration-200 motion-reduce:transform-none", selected && "scale-110")}>
                  {o.image ? <Image src={o.image} alt="" fill sizes="56px" className="object-contain drop-shadow-sm" />
                    : o.slug === ALL ? <LayoutGrid className="h-7 w-7" strokeWidth={1.8} aria-hidden />
                    : <Package className="h-7 w-7" strokeWidth={1.8} aria-hidden />}
                </span>
                <span className="line-clamp-2 text-[11px] font-semibold leading-[1.15] sm:text-xs">{o.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {lead ? <div hidden={active !== ALL} className={cn("space-y-5 sm:space-y-8", active !== ALL && "hidden")}>{lead}</div> : null}

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
