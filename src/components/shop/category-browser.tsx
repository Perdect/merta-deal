"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ProductImage } from "./product-image";
import { ProductGrid } from "./product-card";
import type { CategoryTab } from "@/lib/data/catalog";
import type { ProductCard as ProductCardType } from "@/types/app";
import { cn } from "@/lib/utils";

/**
 * Categories screen: one compact tab per top-level category; the selected tab shows its sub-category
 * tiles (3 columns on phones, wider on larger screens) or, when it has none, its products directly.
 * The tab lives in the URL (?tab=), so direct links, refresh and Back from a product all land on it.
 * Tabs follow the WAI-ARIA pattern (arrow keys, Home/End) and switch without reloading.
 */
const RETURN_KEY = "categories-return";

export function CategoryBrowser({ tabs, initial, products, signedIn }: { tabs: CategoryTab[]; initial: string; products: Record<string, { items: ProductCardType[]; total: number }>; signedIn: boolean }) {
  const valid = (slug: string | null | undefined) => (slug && tabs.some((t) => t.slug === slug) ? slug : null);
  // Back/forward restores this page from the router cache with its first render's props; the address
  // (kept current with replaceState) is the source of truth for which tab was open.
  const urlTab = useSearchParams().get("tab");
  const [active, setActive] = React.useState(valid(urlTab) ?? valid(initial) ?? tabs[0]?.slug);
  const [seenUrlTab, setSeenUrlTab] = React.useState(urlTab);
  if (seenUrlTab !== urlTab) { setSeenUrlTab(urlTab); const v = valid(urlTab); if (v && v !== active) setActive(v); }

  // Coming back from a tile or product: return to the same spot (saved when the link was followed).
  React.useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null") as { url: string; y: number; at: number } | null;
      if (saved && saved.url === window.location.pathname + window.location.search && Date.now() - saved.at < 30 * 60_000) {
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: saved.y, behavior: "instant" as ScrollBehavior })));
      }
      sessionStorage.removeItem(RETURN_KEY);
    } catch { /* storage unavailable */ }
  }, []);
  const remember = (e: React.MouseEvent) => {
    if (!(e.target as Element).closest("a[href]")) return;
    try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ url: window.location.pathname + window.location.search, y: window.scrollY, at: Date.now() })); } catch { /* ignore */ }
  };
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const select = (slug: string, focus = false) => {
    setActive(slug);
    const url = new URL(window.location.href); url.searchParams.set("tab", slug);
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
    if (focus) refs.current[slug]?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = tabs.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault(); select(tabs[to].slug, true);
  };

  if (!tabs.length) return <p className="py-10 text-center text-sm text-ink-3">No categories to show right now.</p>;

  return (
    <div onClickCapture={remember}>
      <div role="tablist" aria-label="Categories" className="grid gap-1.5 rounded-2xl bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t, i) => {
          const on = t.slug === active;
          return (
            <button key={t.slug} ref={(el) => { refs.current[t.slug] = el; }} type="button" role="tab" id={`tab-${t.slug}`} aria-selected={on} aria-controls={`panel-${t.slug}`} tabIndex={on ? 0 : -1}
              onClick={() => select(t.slug)} onKeyDown={(e) => onKey(e, i)}
              className={cn("flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                on ? "bg-brand-600 text-white" : "text-ink-2 hover:bg-card")}>
              <span className="truncate">{t.name}</span>
            </button>
          );
        })}
      </div>

      {tabs.map((t) => {
        const listed = products[t.slug];
        return (
          <section key={t.slug} role="tabpanel" id={`panel-${t.slug}`} aria-labelledby={`tab-${t.slug}`} hidden={t.slug !== active} className="pt-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-bold text-ink">{t.tiles.length ? `Shop ${t.name.toLowerCase()} by type` : t.name}</h2>
              <Link href={`/c/${t.slug}`} className="inline-flex min-h-11 shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600">See all {t.count}<ChevronRight className="h-4 w-4" aria-hidden /></Link>
            </div>
            {t.tiles.length ? (
              <ul className="grid grid-cols-3 gap-x-2.5 gap-y-3.5 min-[430px]:gap-x-3.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {t.tiles.map((tile) => (
                  <li key={tile.key} className="min-w-0">
                    <Link href={tile.href} className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600" aria-label={`${tile.label}, ${tile.count} product${tile.count === 1 ? "" : "s"}`}>
                      <span className="block aspect-square overflow-hidden rounded-2xl border border-line bg-white p-1 transition-colors group-hover:border-brand-300 group-focus-visible:border-brand-600 motion-reduce:transition-none">
                        <ProductImage image={tile.image} productName={tile.label} className="h-full w-full" rounded="rounded-xl" sizes="(max-width: 640px) 30vw, 140px" />
                      </span>
                      <span className="mt-1.5 line-clamp-2 block px-0.5 text-center text-[12.5px] font-semibold leading-tight text-ink">{tile.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : listed && listed.items.length ? (
              <>
                <ProductGrid products={listed.items} signedIn={signedIn} priorityCount={t.slug === active ? 4 : 0} />
                {listed.total > listed.items.length ? (
                  <Link href={`/c/${t.slug}`} className="mt-4 flex min-h-11 items-center justify-center gap-1 rounded-xl border border-line bg-card text-sm font-semibold text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600">See all {listed.total} {t.name.toLowerCase()} <ChevronRight className="h-4 w-4" aria-hidden /></Link>
                ) : (
              <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-ink-2">{t.name} is coming soon. We&rsquo;re adding products here; grocery and kirana essentials are on sale now.</p>
            )}
              </>
            ) : (
              <p className="rounded-xl border border-line bg-card px-4 py-8 text-center text-sm text-ink-3">Nothing in {t.name.toLowerCase()} right now — check back soon.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
