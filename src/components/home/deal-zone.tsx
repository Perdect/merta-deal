"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Boxes, Check, Copy } from "lucide-react";
import type { DealGroup, WelcomeOffer } from "@/lib/data/home";
import { toast } from "@/components/ui/toast";
import { cn, formatINR } from "@/lib/utils";

/**
 * "Deal Zone": the offers that are real right now, as picture tiles — one tall, the rest beside and under it.
 *
 *  - price cuts: products selling below MRP today, for the whole shop and per line (`DealGroup`, built by
 *    the home feed from the same cards the grid shows; "up to N%" is the biggest one in that group and the
 *    pictures are those products);
 *  - the live coupon from the coupons table, in the admin's own words, with its code and minimum;
 *  - bulk orders, only while the wholesale flow is switched on.
 *
 * Nothing here is typed in by hand: a tile whose data is missing is left out, and with fewer than two
 * tiles the whole section is.
 */
export function DealZone({ deals, coupon, bulk }: { deals: DealGroup[]; coupon: WelcomeOffer | null; bulk: boolean }) {
  const all = deals.find((d) => d.key === "all") ?? null;
  const lines = deals.filter((d) => d.key !== "all").sort((a, b) => b.pct - a.pct).slice(0, 4);
  const tiles: React.ReactNode[] = [];
  if (all) tiles.push(<DiscountTile key="all" deal={all} tall />);
  if (coupon) tiles.push(<CouponTile key="coupon" coupon={coupon} />);
  if (bulk) tiles.push(<BulkTile key="bulk" />);
  for (const d of lines) tiles.push(<DiscountTile key={d.key} deal={d} />);
  if (tiles.length < 2) return null;

  // The tall tile takes two cells; a lone tile on the last row is stretched across it instead of leaving a hole.
  const tall = Boolean(all) && tiles.length >= 3;
  const cells = tiles.length + (tall ? 1 : 0);
  return (
    <section aria-labelledby="deal-zone-title" className="px-4 sm:px-0">
      <div className="mb-3 text-center">
        <h2 id="deal-zone-title" className="flex items-center justify-center gap-3 font-display text-lg font-extrabold text-ink">
          <span aria-hidden className="h-px w-10 bg-line-2" />Deal Zone<span aria-hidden className="h-px w-10 bg-line-2" />
        </h2>
        <p className="mt-0.5 text-xs text-ink-3">Today&apos;s prices and offers, straight from the shop</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t, i) => (
          <div key={i} className={cn("min-w-0", i === 0 && tall && "row-span-2", i === tiles.length - 1 && cells % 2 === 1 && "col-span-2 sm:col-span-1")}>{t}</div>
        ))}
      </div>
    </section>
  );
}

const tileBase = "tap group relative flex h-full min-h-[148px] w-full flex-col overflow-hidden rounded-2xl border border-black/[0.04] p-3.5 text-left shadow-card transition duration-200 hover:shadow-float active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

/** Product pictures on white chips, so a photo with a white background and a cut-out look the same on a tinted tile. */
function Shots({ images, big }: { images: string[]; big?: boolean }) {
  if (!images.length) return null;
  return (
    <div className={cn("mt-auto flex items-end gap-1.5 pt-3", big && "flex-wrap")}>
      {images.map((src, i) => (
        <span key={src} className={cn("relative block overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5", big ? (i === 0 ? "h-28 w-full" : "h-16 flex-1") : "h-12 w-12")}>
          <Image src={src} alt="" fill sizes={big && i === 0 ? "200px" : "96px"} className="object-contain p-1.5 transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none" />
        </span>
      ))}
    </div>
  );
}

function DiscountTile({ deal, tall }: { deal: DealGroup; tall?: boolean }) {
  const everything = deal.key === "all";
  return (
    <Link href={deal.href} aria-label={`${deal.name}: up to ${deal.pct}% off, ${deal.count} ${deal.count === 1 ? "product" : "products"}`}
      className={cn(tileBase, tall && "min-h-[308px]")} style={{ backgroundColor: everything ? "#FFF1F3" : (deal.color ?? "#EEF6F0") }}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-2">{everything ? "Top deals today" : deal.name}</span>
      <span className={cn("mt-1 font-display font-extrabold leading-[1.05] tracking-tight text-ink", tall ? "text-2xl" : "text-xl")}>
        <span className={everything ? "text-[#D6336C]" : "text-brand-700"}>Up to</span> {deal.pct}% off
      </span>
      <span className="mt-1 text-xs text-ink-2">{deal.count} featured {deal.count === 1 ? "product" : "products"} below MRP</span>
      <Shots images={tall ? deal.images : deal.images.slice(0, 2)} big={tall} />
    </Link>
  );
}

/** Tap copies the code; the cart checks it again when it is applied, so nothing is promised here that the server will not honour. */
function CouponTile({ coupon }: { coupon: WelcomeOffer }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(coupon.code); setCopied(true); toast.success("Code copied", "Apply it in your cart."); setTimeout(() => setCopied(false), 2500); }
    catch { toast.info(`Your code is ${coupon.code}`, "Type it in your cart."); }
  };
  const saving = coupon.isPercent
    ? `${coupon.discount}% off${coupon.maxDiscount ? ` up to ${formatINR(coupon.maxDiscount)}` : ""}`
    : `${formatINR(coupon.discount)} off`;
  return (
    <button type="button" onClick={copy} aria-label={`${coupon.title}. Copy code ${coupon.code}`} className={tileBase} style={{ backgroundColor: "#FFF4DC" }}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-2">Coupon</span>
      <span className="mt-1 font-display text-xl font-extrabold leading-[1.05] tracking-tight text-ink">{saving}</span>
      <span className="mt-1 line-clamp-2 text-xs text-ink-2">{coupon.title}</span>
      {coupon.minOrder > 0 ? <span className="text-xs font-semibold text-ink-2">On orders above {formatINR(coupon.minOrder)}</span> : null}
      <span className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-saffron-700/50 bg-white px-2.5 py-1.5 text-xs font-bold tracking-wide text-ink">
        {coupon.code}{copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5 text-ink-3" aria-hidden />}
      </span>
    </button>
  );
}

function BulkTile() {
  return (
    <Link href="/wholesale" className={tileBase} style={{ backgroundColor: "#E6F1FB" }}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-2">Bulk orders</span>
      <span className="mt-1 font-display text-xl font-extrabold leading-[1.05] tracking-tight text-ink">Bada pack, <span className="text-[#1C5FA8]">full cases</span></span>
      <span className="mt-1 text-xs text-ink-2">For shops, hotels and functions. Price confirmed or on quote.</span>
      <span className="mt-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[#1C5FA8] shadow-sm ring-1 ring-black/5"><Boxes className="h-6 w-6" aria-hidden /></span>
    </Link>
  );
}
