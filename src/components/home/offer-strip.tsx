"use client";
import * as React from "react";
import { Tag, Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { WelcomeOffer } from "@/lib/data/home";
import { applyCouponAction, getCartSummary } from "@/lib/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/components/ui/toast";
import { cn, formatDate, formatINR } from "@/lib/utils";

/**
 * Live site-wide coupons as a swipeable row (scroll-snap: native touch swipe, no carousel library).
 * One card fills the row on phones with the next one peeking; desktop shows several at once with
 * arrow buttons. Each card applies its code through the normal coupon flow (server validates it).
 */
export function OfferCarousel({ offers }: { offers: WelcomeOffer[] }) {
  const ref = React.useRef<HTMLUListElement>(null);
  const [index, setIndex] = React.useState(0);
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    setIndex(card ? Math.round(el.scrollLeft / (card.offsetWidth + 12)) : 0);
  };
  const go = (dir: 1 | -1) => {
    const el = ref.current; const card = el?.firstElementChild as HTMLElement | null;
    if (el && card) el.scrollBy({ left: dir * (card.offsetWidth + 12), behavior: "smooth" });
  };
  const single = offers.length === 1;
  return (
    <section aria-label="Offers" className="relative">
      <ul ref={ref} onScroll={onScroll} className={cn("flex gap-3 overflow-x-auto px-4 no-scrollbar sm:px-0", !single && "snap-x snap-mandatory scroll-px-4 sm:scroll-px-0")}>
        {offers.map((o, i) => (
          <li key={o.code} className={cn("shrink-0 snap-start", single ? "w-full" : "w-[86%] sm:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)]")} aria-roledescription="offer" aria-label={`${i + 1} of ${offers.length}`}>
            <OfferCard offer={o} />
          </li>
        ))}
      </ul>
      {!single ? (
        <>
          <div className="mt-2 flex justify-center gap-1.5 lg:hidden" aria-hidden>
            {offers.map((o, i) => <span key={o.code} className={cn("h-1.5 rounded-full transition-all duration-200", i === index ? "w-4 bg-saffron-600" : "w-1.5 bg-ink/20")} />)}
          </div>
          <button type="button" onClick={() => go(-1)} aria-label="Previous offer" className="absolute -left-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-card text-ink shadow-card hover:bg-surface-2 lg:flex"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => go(1)} aria-label="Next offer" className="absolute -right-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-card text-ink shadow-card hover:bg-surface-2 lg:flex"><ChevronRight className="h-5 w-5" /></button>
        </>
      ) : null}
    </section>
  );
}

function OfferCard({ offer }: { offer: WelcomeOffer }) {
  const count = useCartStore((s) => s.totalCount());
  const setSummary = useCartStore((s) => s.setSummary);
  const openDrawer = useCartStore((s) => s.openDrawer);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [wiggle, setWiggle] = React.useState(0);

  const use = async () => {
    setWiggle((n) => n + 1);
    if (busy) return;
    try { await navigator.clipboard?.writeText(offer.code); } catch { /* clipboard blocked; the code is on screen */ }
    if (count === 0) {
      toast.info(`Code ${offer.code} copied`, offer.minOrder ? `Add items worth ${formatINR(offer.minOrder)} or more, then apply it in your cart.` : "Add items, then apply it in your cart.");
      return;
    }
    setBusy(true);
    const r = await applyCouponAction(offer.code);
    if (r.ok) {
      setSummary(await getCartSummary()); setDone(true);
      toast.success(`${offer.code} applied`, `You save ${formatINR(r.data.discount)}.`);
      openDrawer("cart");
    } else toast.error(r.error);
    setBusy(false);
  };

  return (
    <div className="flex h-full items-center gap-3 rounded-xl border border-dashed border-saffron-400 bg-saffron-50 px-3 py-2.5">
      <Tag key={wiggle} aria-hidden className={cn("h-5 w-5 shrink-0 text-saffron-700", wiggle > 0 && "motion-safe:animate-tag")} strokeWidth={2} />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="line-clamp-2 text-[13px] font-bold leading-tight text-ink sm:text-sm">{offer.title}</p>
        <p className="mt-0.5 text-[11.5px] text-ink-2 sm:text-xs">
          Code <b className="tracking-wide text-ink">{offer.code}</b>{offer.minOrder ? <> · above {formatINR(offer.minOrder)}</> : null}
          {offer.expiresAt ? <span className="text-ink-3"> · till {formatDate(offer.expiresAt, { day: "numeric", month: "short" })}</span> : null}
        </p>
      </div>
      <button type="button" onClick={use} disabled={busy} className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-white px-3.5 text-xs font-bold text-saffron-800 ring-1 ring-saffron-300 transition-transform duration-150 hover:bg-saffron-100 active:scale-95 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron-600">
        {done ? <><Check className="h-3.5 w-3.5" aria-hidden /> Applied</> : busy ? "Applying…" : count ? "Apply" : "Use code"}
      </button>
    </div>
  );
}
