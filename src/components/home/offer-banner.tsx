import Image from "next/image";
import Link from "next/link";
import { MapPin, Wallet, ShoppingBasket } from "lucide-react";
import type { WelcomeOffer } from "@/lib/data/home";
import { formatINR } from "@/lib/utils";
import { site } from "@/config/site";

/** Real product cutouts (cake, mithai, dry fruits, tea, ghee) arranged like a full shopping bag; positions are percentages of the visual box. */
const CLUSTER = [
  { src: "/products/chocolate-cake-sample-500-g.1f73fc08.webp", cls: "left-[4%] top-[14%] w-[46%] rotate-[-6deg]" },
  { src: "/products/tata-tea-gold-500-g.6efe127b.webp", cls: "left-[60%] top-[6%] w-[30%] rotate-[8deg]" },
  { src: "/products/motichoor-laddoo-sample-500-g.f341e814.webp", cls: "left-[40%] top-[34%] w-[38%]" },
  { src: "/products/merta-dairy-desi-ghee-bilona-500-g.3dc89824.webp", cls: "left-[6%] top-[54%] w-[34%] rotate-[-8deg]" },
  { src: "/products/happilo-premium-almonds-250-g.3d72c57f.webp", cls: "left-[56%] top-[52%] w-[40%] rotate-[10deg]" },
  { src: "/products/cashew-w320-250-g.8ef99478.webp", cls: "left-[30%] top-[66%] w-[32%] rotate-[4deg]" },
];

/**
 * Home hero in the app style: deep-green card, a pill, a big headline with one lime word, a short line,
 * an orange Shop Now, and the groceries on the right (our own product cutouts, no stock photo) with two
 * floating fact cards. On phones the copy stacks above the visual. The short line is the best live coupon
 * (value, code, minimum from the coupons table) or the delivery target; the cards state only the delivery
 * target and the payment ways the settings allow.
 */
export function OfferBanner({ offers, etaLabel, payLine }: { offers: WelcomeOffer[]; etaLabel: string; payLine: string }) {
  // The data layer puts the welcome coupon first; the hero never advertises a destination-only code.
  const best = offers[0];
  const line = best
    ? `${best.isPercent ? `Up to ${best.discount}% off` : `${formatINR(best.discount)} off`} with code ${best.code}${best.minOrder > 0 ? ` on orders above ${formatINR(best.minOrder)}` : ""}.`
    : `Grocery, sweets, cakes and dry fruits delivered across ${site.city} with a ${etaLabel} delivery target.`;
  const payRaw = payLine.replace(/\.$/, "").replace(/^Pay (online )?by /i, "").replace(/ available$/i, "");
  const pay = payRaw ? payRaw.charAt(0).toUpperCase() + payRaw.slice(1) : "";
  return (
    <section aria-label="Shop grocery online in Merta City" className="mx-4 sm:mx-0">
      <div className="relative isolate overflow-hidden rounded-[22px] bg-[#245c3f] text-white shadow-[0_10px_30px_rgba(20,70,45,0.22)] sm:rounded-[28px]">
        <span aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 right-[30%] h-64 w-64 rounded-full bg-[#9fd68a]/10 blur-2xl" />
        <div className="relative z-10 grid gap-4 px-5 pb-5 pt-6 sm:min-h-[380px] sm:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] sm:items-center sm:gap-6 sm:px-10 sm:py-10">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/95 ring-1 ring-inset ring-white/15 sm:text-[11px]">
              <ShoppingBasket className="h-3.5 w-3.5 text-[#cdf36b]" aria-hidden />{site.tagline}
            </p>
            <h2 className="mt-4 font-display text-[32px] font-extrabold leading-[1.02] tracking-tight min-[400px]:text-[36px] sm:text-[46px] lg:text-[52px]">
              Make life easy<br />with <span className="relative inline-block text-[#cdf36b]">online<Underline /></span><br />grocery
            </h2>
            <p className="mt-3.5 max-w-[34ch] text-[13.5px] leading-relaxed text-white/80 sm:mt-5 sm:text-[15px]">{line}</p>
            <Link href="/categories" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-[#ff6b35] px-7 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(255,107,53,0.35)] transition hover:bg-[#f25d26] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:mt-7 sm:min-h-[52px] sm:px-8 sm:text-base">Shop Now</Link>
          </div>

          <div className="relative mx-auto mt-2 aspect-[4/3] w-full max-w-[360px] sm:mt-0 sm:aspect-square sm:max-w-[400px]" aria-hidden>
            <span className="absolute inset-x-[8%] bottom-0 top-[10%] rounded-[40%_40%_30%_30%] bg-white/[0.07]" />
            {CLUSTER.map((c) => (
              <span key={c.src} className={`absolute aspect-square ${c.cls}`}>
                <Image src={c.src} alt="" fill sizes="(max-width: 640px) 150px, 180px" className="object-contain drop-shadow-[0_14px_14px_rgba(0,0,0,0.3)]" />
              </span>
            ))}
            <FactCard className="left-0 bottom-2 sm:-left-4 sm:bottom-6" icon={<MapPin className="h-5 w-5 text-[#ff6b35]" aria-hidden />} title="Fast delivery" sub={`${etaLabel} delivery target`} />
            {pay ? <FactCard className="right-0 top-0 sm:-right-2 sm:top-4" icon={<Wallet className="h-5 w-5 text-brand-700" aria-hidden />} title="Easy payment" sub={pay} compact /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Hand-drawn swoosh under the accent word. */
function Underline() {
  return (
    <svg viewBox="0 0 120 12" className="absolute -bottom-2 left-0 h-3 w-full text-[#cdf36b]" preserveAspectRatio="none" aria-hidden>
      <path d="M2 9c30-7 70-8 116-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function FactCard({ className, icon, title, sub, compact }: { className: string; icon: React.ReactNode; title: string; sub: string; compact?: boolean }) {
  return (
    <span className={`absolute z-10 flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 text-ink shadow-[0_10px_30px_rgba(0,0,0,0.18)] ${compact ? "max-w-[172px] sm:max-w-[190px]" : "max-w-[190px] sm:max-w-[220px]"} ${className}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf6ee]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold leading-tight">{title}</span>
        <span className="block truncate text-[11px] leading-tight text-ink-3">{sub}</span>
      </span>
    </span>
  );
}
