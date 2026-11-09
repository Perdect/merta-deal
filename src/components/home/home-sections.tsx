import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import type { HomeCategory, HomeSection } from "@/lib/data/home";
import type { CategoryTab, CategoryTile } from "@/lib/data/catalog";
import { ProductGrid } from "@/components/shop/product-card";
import { ProductImage } from "@/components/shop/product-image";
import { cn } from "@/lib/utils";

const TILE_BG: Record<string, string> = { grocery: "bg-[#FFF4E2]", "dry-fruits": "bg-[#F3EDE0]", sweets: "bg-[#FFF1E6]", "bakery-cakes": "bg-[#FBE9EF]", fruits: "bg-[#FDEFF0]", vegetables: "bg-[#EAF6EC]" };

/**
 * Compact category row (quick-commerce style): one tile per top-level category with a product
 * photo — Fruits, Vegetables, All grocery — each linking to its listing. Only categories with
 * something to buy appear; the "See all" link opens the full categories screen.
 */
export function CategoryGrid({ tabs, fallback }: { tabs: CategoryTab[]; fallback: HomeCategory[] }) {
  const order = ["grocery", "dry-fruits", "sweets", "bakery-cakes", "fruits", "vegetables"];
  const rank = (slug: string) => { const i = order.indexOf(slug); return i === -1 ? order.length : i; };
  const tiles: (CategoryTile & { bg?: string })[] = [...tabs].sort((a, b) => rank(a.slug) - rank(b.slug))
    .map((t) => ({ key: t.slug, label: t.tiles.length ? `All ${t.name.toLowerCase()}` : t.name, href: `/c/${t.slug}`, image: t.image, count: t.count, bg: TILE_BG[t.slug] }));
  if (!tiles.length) return fallback.length ? <CategoryTiles categories={fallback} /> : null;
  const cols = Math.min(4, Math.max(tiles.length, 3));
  return (
    <section aria-labelledby="cats-title" className="px-4 sm:px-0">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="cats-title" className="font-display text-[15px] font-bold text-ink sm:text-lg">Shop by category</h2>
        <Link href="/categories" className="tap inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">See all<ChevronRight className="h-4 w-4" aria-hidden /></Link>
      </div>
      <ul className="grid gap-x-2.5 gap-y-3 sm:flex sm:gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tiles.map((t) => (
          <li key={t.key} className="min-w-0 sm:w-[140px]">
            <Link href={t.href} className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600" aria-label={t.count ? `${t.label}, ${t.count} product${t.count === 1 ? "" : "s"}` : `${t.label}, coming soon`}>
              <span aria-hidden className={cn("block aspect-square overflow-hidden rounded-2xl p-2 transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-[0.97] motion-reduce:transform-none", t.bg ?? "bg-surface-2")}>
                <ProductImage image={t.image} productName={t.label} className="h-full w-full" rounded="rounded-xl" sizes="(max-width: 640px) 30vw, 140px" />
              </span>
              <span className="mt-1.5 block text-center text-[13px] font-semibold leading-tight text-ink sm:text-sm">{t.label}</span>
              {t.count === 0 ? <span className="mt-0.5 block text-center text-[11px] font-medium text-saffron-700">Coming soon</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Image-led top-level tiles: used only when the category data for the grid is unavailable. */
export function CategoryTiles({ categories }: { categories: HomeCategory[] }) {
  return (
    <section aria-labelledby="cats-title" className="px-4 sm:px-0">
      <h2 id="cats-title" className="sr-only">Shop by category</h2>
      <ul className="grid grid-cols-3 gap-2.5 sm:flex sm:gap-4">
        {categories.map((c) => (
          <li key={c.id} className="sm:w-[156px]">
            <Link href={`/c/${c.slug}`} className="group block rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
              <span aria-hidden className={cn("relative flex h-[92px] items-end justify-center overflow-hidden rounded-[14px] px-1 pb-1 transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-[0.97] sm:h-[120px]", TILE_BG[c.slug] ?? "bg-surface-2")}>
                {c.cover ? (
                  <span className="relative block h-[86%] w-[92%]">
                    <Image src={c.images[0]} alt="" fill sizes="(max-width: 640px) 30vw, 150px" className="object-contain object-bottom" priority />
                  </span>
                ) : c.images.map((src, i) => (
                  <span key={src} className={cn("relative block", i === 0 ? "z-10 h-[80%] w-[58%]" : "-ml-[18%] h-[64%] w-[46%]")}>
                    <Image src={src} alt="" fill sizes="(max-width: 640px) 28vw, 100px" className="object-contain object-bottom" priority />
                  </span>
                ))}
              </span>
              <span className="mt-1.5 block text-center text-[13px] font-semibold text-ink sm:text-sm">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One titled product section; "See all" only where there is a category listing behind it. */
export function ProductSection({ section, signedIn, first }: { section: HomeSection; signedIn: boolean; first?: boolean }) {
  return (
    <section id={section.key} aria-labelledby={`${section.key}-title`} className="scroll-mt-32">
      <div className="mb-2.5 flex items-end justify-between px-4 sm:px-0">
        <h2 id={`${section.key}-title`} className="font-display text-lg font-bold text-ink">{section.title}</h2>
        {section.href ? (
          <Link href={section.href} className="tap inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">
            See all<ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          </Link>
        ) : null}
      </div>
      <ProductGrid products={section.products} signedIn={signedIn} priorityCount={first ? 2 : 0} className="px-4 sm:px-0" />
    </section>
  );
}

/* Service strip icons: custom outline SVGs (24px grid, 1.8 stroke) whose small parts move.
   motion-safe only; the global reduced-motion rule stops them for users who ask. */
const svgProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "h-6 w-6 overflow-visible" };
const box = "[transform-box:fill-box] [transform-origin:center]";

function DeliveryIcon() {
  return (
    <svg {...svgProps}>
      {/* speed lines streaming behind the truck */}
      <g strokeWidth={1.6} strokeDasharray="3 5" className="motion-safe:animate-[svc-road_0.9s_linear_infinite]">
        <path d="M-3 9h4" /><path d="M-4 12.5h5" /><path d="M-2 16h3" />
      </g>
      <g className={`${box} motion-safe:animate-[svc-bob_1.2s_ease-in-out_infinite]`}>
        <path d="M3 6.5h10.5v9H3z" />
        <path d="M13.5 9.5h3.6l2.9 3.2v2.8h-6.5" />
        <circle cx="7" cy="17.5" r="1.9" />
        <circle cx="16.5" cy="17.5" r="1.9" />
      </g>
    </svg>
  );
}

function PaymentIcon() {
  return (
    <svg {...svgProps}>
      <rect x="2.5" y="6" width="14" height="10" rx="2" />
      <circle cx="9.5" cy="11" r="1.8" />
      <path d="M5 8.5v0M14 13.5v0" strokeWidth={2.2} />
      {/* ₹ coin that flips every few seconds */}
      <g className={`${box} motion-safe:animate-[svc-flip_3.2s_ease-in-out_infinite]`}>
        <circle cx="17.5" cy="15.5" r="4.6" fill="var(--color-card)" />
        <path d="M15.6 13.4h3.8M15.6 15h3.8M16.2 13.4c2.6 0 2.6 3.2 0 3.2h-.6l2.6 2.4" strokeWidth={1.4} />
      </g>
    </svg>
  );
}

function OtpIcon() {
  return (
    <svg {...svgProps}>
      {/* soft ring pulse behind the shield */}
      <path d="M12 2.8 19 5.6v5.6c0 4.4-3 8-7 9.8-4-1.8-7-5.4-7-9.8V5.6z" strokeWidth={1.2} opacity={0} className={`${box} motion-safe:animate-[svc-ring_3.6s_ease-out_infinite]`} />
      <path d="M12 2.8 19 5.6v5.6c0 4.4-3 8-7 9.8-4-1.8-7-5.4-7-9.8V5.6z" />
      {/* tick draws itself, then rests */}
      <path d="m8.6 11.9 2.4 2.4 4.4-4.6" strokeDasharray="14" className="motion-safe:animate-[svc-check_3.6s_ease-out_infinite]" />
    </svg>
  );
}

/** Small service strip: what actually happens on every order. */
export function ServiceStrip({ etaLabel }: { etaLabel: string }) {
  const items = [
    { Icon: DeliveryIcon, t: <><span className="whitespace-nowrap">{etaLabel}</span> delivery target</>, key: "delivery", s: null as string | null, tile: "bg-fresh-50 text-fresh" },
    { Icon: PaymentIcon, t: "Cash or UPI", key: "pay", s: "Pay on delivery", tile: "bg-saffron-50 text-saffron-700" },
    { Icon: OtpIcon, t: "OTP handover", key: "otp", s: "Safe delivery", tile: "bg-[#e7f3f4] text-[#0f6f78]" },
  ];
  return (
    <section aria-label="How delivery works" className="mx-4 grid grid-cols-3 divide-x divide-line rounded-[14px] border border-line bg-card py-3 sm:mx-0">
      {items.map(({ Icon, t, key, s, tile }) => (
        <div key={key} className="group flex flex-col items-center gap-1.5 px-1.5 text-center sm:flex-row sm:justify-center sm:gap-3 sm:text-left">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transform-none ${tile}`}><Icon /></span>
          <span><span className="block text-xs font-bold text-ink sm:text-sm">{t}</span>{s ? <span className="block text-[10.5px] text-ink-3 sm:text-xs">{s}</span> : null}</span>
        </div>
      ))}
    </section>
  );
}
