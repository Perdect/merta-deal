import Link from "next/link";
import Image from "next/image";
import type { DealGroup } from "@/lib/data/home";
import { cn } from "@/lib/utils";

/**
 * "Deal Zone": one poster tile per line of the shop that has products selling below MRP today
 * (`DealGroup`, built by the home feed from the same cards the grid shows). "Up to N%" is the biggest
 * saving in that line, the picture is the line's own, and the tile opens the line sorted by discount.
 *
 * Nothing here is typed in by hand: a line with no price cut has no tile, and with fewer than two tiles
 * the whole section is left out. (The shop-wide, coupon and bulk-order tiles were removed at the owner's
 * request on 20 Nov 2026.)
 */
export function DealZone({ deals }: { deals: DealGroup[] }) {
  const lines = [...deals].sort((a, b) => b.pct - a.pct).slice(0, 4);
  if (lines.length < 2) return null;
  return (
    <section aria-labelledby="deal-zone-title" className="px-4 sm:px-0">
      <div className="mb-3 text-center">
        <h2 id="deal-zone-title" className="flex items-center justify-center gap-3 font-display text-lg font-extrabold text-ink">
          <span aria-hidden className="h-px w-10 bg-line-2" />Deal Zone<span aria-hidden className="h-px w-10 bg-line-2" />
        </h2>
        <p className="mt-0.5 text-xs text-ink-3">Today&apos;s prices, straight from the shop</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* A lone tile on the last row is stretched across it instead of leaving a hole. */}
        {lines.map((d, i) => (
          <div key={d.key} className={cn("min-w-0", i === lines.length - 1 && lines.length % 2 === 1 && "col-span-2 sm:col-span-1")}><DiscountTile deal={d} index={i} /></div>
        ))}
      </div>
    </section>
  );
}

const tileBase = "tap group relative isolate flex h-full w-full flex-col overflow-hidden rounded-2xl border border-black/[0.04] px-3 pt-3 text-left shadow-card transition duration-200 hover:shadow-float active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
/** Headline colours, in tile order (presentation only; the tint behind them is the line's own colour). */
const ACCENTS = ["#D6336C", "#1C5FA8", "#C2410C", "#15803D"];
/** Soft rays fanning up from the bottom of the tile, behind the picture. */
const RAYS = "repeating-conic-gradient(from -90deg at 50% 100%, rgba(255,255,255,0.55) 0deg 7deg, transparent 7deg 14deg)";

/**
 * The line's best-priced products on white cards: the fallback for a line with no picture of its own
 * (two side by side on a phone, three from `sm` up).
 */
function Shots({ images }: { images: string[] }) {
  if (!images.length) return null;
  return (
    <div className="mt-auto grid grid-cols-2 gap-2 pb-3 pt-3 sm:grid-cols-3">
      {images.map((src, i) => (
        <span key={src} className={cn("relative block aspect-square overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5", i > 1 && "hidden sm:block")}>
          <Image src={src} alt="" fill sizes="(max-width: 640px) 24vw, 120px" quality={85} className="object-contain p-1" />
        </span>
      ))}
    </div>
  );
}

/**
 * One offer tile, poster style: the line's name, "UP TO N% OFF" in two colours, and the line's own picture
 * (the cut-out set in Admin → Categories) standing large along the bottom over a fan of soft rays.
 */
function DiscountTile({ deal, index }: { deal: DealGroup; index: number }) {
  const accent = ACCENTS[index % ACCENTS.length];
  return (
    <Link href={deal.href} aria-label={`${deal.name}: up to ${deal.pct}% off, ${deal.count} ${deal.count === 1 ? "product" : "products"}`}
      className={tileBase} style={{ backgroundColor: deal.color ?? "#EEF6F0" }}>
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_top,black,transparent_85%)]" style={{ backgroundImage: RAYS }} />
      <span className="text-[10.5px] font-bold uppercase leading-tight tracking-wide text-ink-2">{deal.name}</span>
      <span className="mt-1 font-display text-[23px] font-extrabold uppercase leading-[0.98] tracking-tight text-ink sm:text-[26px]">
        <span style={{ color: accent }}>Up to</span><br />{deal.pct}% off
      </span>
      <span className="mt-1 text-[11px] text-ink-2">{deal.count} featured {deal.count === 1 ? "product" : "products"} below MRP</span>
      {deal.picture ? (
        <span className="relative mt-2 block h-[118px] w-full sm:h-[140px]">
          <Image src={deal.picture} alt="" fill sizes="(max-width: 640px) 46vw, 260px" quality={90} className="object-contain object-bottom drop-shadow-[0_6px_10px_rgba(0,0,0,0.18)] transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transform-none" />
        </span>
      ) : <Shots images={deal.images.slice(0, 3)} />}
    </Link>
  );
}
