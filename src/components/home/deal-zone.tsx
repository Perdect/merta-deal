import Link from "next/link";
import Image from "next/image";
import type { DealGroup } from "@/lib/data/home";
import { cn } from "@/lib/utils";

/**
 * "Deal Zone": one picture tile per line of the shop that has products selling below MRP today
 * (`DealGroup`, built by the home feed from the same cards the grid shows). "Up to N%" is the biggest
 * saving in that line, the pictures are those products, and the tile opens the line sorted by discount.
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
          <div key={d.key} className={cn("min-w-0", i === lines.length - 1 && lines.length % 2 === 1 && "col-span-2 sm:col-span-1")}><DiscountTile deal={d} /></div>
        ))}
      </div>
    </section>
  );
}

const tileBase = "tap group relative flex h-full min-h-[148px] w-full flex-col overflow-hidden rounded-2xl border border-black/[0.04] p-3.5 text-left shadow-card transition duration-200 hover:shadow-float active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

/** Product pictures on white chips, so a photo with a white background and a cut-out look the same on a tinted tile. */
function Shots({ images }: { images: string[] }) {
  if (!images.length) return null;
  return (
    <div className="mt-auto flex items-end gap-1.5 pt-3">
      {images.map((src) => (
        <span key={src} className="relative block h-12 w-12 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          <Image src={src} alt="" fill sizes="96px" className="object-contain p-1.5 transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none" />
        </span>
      ))}
    </div>
  );
}

function DiscountTile({ deal }: { deal: DealGroup }) {
  return (
    <Link href={deal.href} aria-label={`${deal.name}: up to ${deal.pct}% off, ${deal.count} ${deal.count === 1 ? "product" : "products"}`}
      className={tileBase} style={{ backgroundColor: deal.color ?? "#EEF6F0" }}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-2">{deal.name}</span>
      <span className="mt-1 font-display text-xl font-extrabold leading-[1.05] tracking-tight text-ink"><span className="text-brand-700">Up to</span> {deal.pct}% off</span>
      <span className="mt-1 text-xs text-ink-2">{deal.count} featured {deal.count === 1 ? "product" : "products"} below MRP</span>
      <Shots images={deal.images.slice(0, 3)} />
    </Link>
  );
}
