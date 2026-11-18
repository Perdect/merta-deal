"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CategoryTab } from "@/lib/data/catalog";
import { cn } from "@/lib/utils";

/**
 * The home's category selector and the sections it filters.
 *
 * The tabs are the same pills the Categories screen uses (`CategoryBrowser`): a grey track, the chosen
 * pill filled brand green. "All" comes first and is the default, then the shop's own lines in the
 * catalogue's `sort_order` — there is no slug list in here, so adding or reordering a line is still an
 * Admin → Categories change. Picking one hides the rows that belong to the others; "All" brings them back.
 *
 * On a phone five pills do not fit side by side without crushing "Beauty & Personal Care", so the track
 * scrolls sideways with every label on one line; from `sm` up the pills share the width equally.
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

  const options = React.useMemo(() => [{ slug: ALL, name: "All" }, ...tabs.map((t) => ({ slug: t.slug, name: t.name }))], [tabs]);

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
      <section aria-labelledby="cats-title" className="px-4 sm:px-0">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="cats-title" className="font-display text-[15px] font-bold text-ink sm:text-lg">Shop by category</h2>
          <Link href={seeAllHref} className="tap inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">
            See all<ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        {/* The pill track. Phones: one line per label, the track scrolls and nothing is clipped mid-word.
            From sm up: an equal share each, like the Categories screen. p-1 leaves the focus ring room
            inside the scroller, which would otherwise cut it off. */}
        <div
          ref={railRef}
          role="tablist"
          aria-label="Shop by category"
          onKeyDown={onKeyDown}
          className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-2xl bg-surface-2 p-1 sm:grid sm:overflow-visible"
          style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
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
                  "flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl px-4 py-1.5 text-center text-[13px] font-semibold transition-colors motion-reduce:transition-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                  "sm:min-w-0 sm:shrink sm:whitespace-normal sm:px-2 sm:text-sm",
                  selected ? "bg-brand-600 text-white" : "text-ink-2 hover:bg-card",
                )}
              >
                <span className="leading-tight sm:line-clamp-2">{o.name}</span>
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
