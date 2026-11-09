import Link from "next/link";
import { Cake, ChevronRight, Zap } from "lucide-react";
import { site } from "@/config/site";
import { URGENT_HIGHLIGHT } from "@/lib/service-pages";

/**
 * The fast-delivery banner: the exact highlight line (question as the headline, promise as the
 * sub-line), the honest conditions, a rider illustration and one button. It links to the page
 * that explains the service and its limits. Saffron on the brand's own tokens, no stock imagery.
 */
export function UrgentHighlight({ etaLabel }: { etaLabel: string }) {
  const [question, rest] = splitHighlight(URGENT_HIGHLIGHT);
  return (
    <Link href="/urgent-delivery-merta-city" className="group relative mx-4 block overflow-clip rounded-2xl bg-gradient-to-br from-saffron-400 via-saffron-500 to-saffron-600 text-ink shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:mx-0" aria-label={`${URGENT_HIGHLIGHT} ${etaLabel} target on eligible orders.`}>
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/25" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 right-24 h-36 w-36 rounded-full bg-white/15" />
      <span className="relative grid grid-cols-[minmax(0,1fr)_96px] items-center gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_150px] sm:gap-6 sm:px-6 sm:py-5">
        <span className="min-w-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-ink/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-saffron-200"><Zap className="h-3 w-3" aria-hidden />Urgent delivery</span>
          <span className="mt-2 block font-display text-[17px] font-extrabold leading-tight text-ink sm:text-2xl">{question}</span>
          <span className="mt-1 block text-[13px] font-medium leading-snug text-ink/85 sm:text-[15px]">{rest}</span>
          <span className="mt-1.5 block text-[11px] leading-snug text-ink/70 sm:text-xs">{etaLabel} target on eligible orders. It depends on preparation, stock, distance and delivery partners.</span>
          <span className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-full bg-ink px-4 text-sm font-bold text-white transition-transform group-hover:-translate-y-0.5 group-active:scale-[0.98] motion-reduce:transform-none">Request now <ChevronRight className="h-4 w-4" aria-hidden /></span>
        </span>
        <RiderArt className="h-24 w-24 justify-self-end sm:h-[150px] sm:w-[150px]" />
      </span>
    </Link>
  );
}

/** "Need … urgently?" becomes the headline; what follows is the sub-line. The text itself is unchanged. */
function splitHighlight(text: string): [string, string] {
  const q = text.indexOf("?");
  return q === -1 ? [text, ""] : [text.slice(0, q + 1), text.slice(q + 1).trim()];
}

/** Rider on a scooter with a parcel, drawn in the banner's ink; speed lines move, the scooter bobs (motion-safe only). */
function RiderArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`${className ?? ""} overflow-visible text-ink`}>
      <g strokeWidth={2} strokeDasharray="4 6" opacity={0.7} className="motion-safe:animate-[svc-road_0.9s_linear_infinite]"><path d="M2 30h10" /><path d="M-2 37h12" /><path d="M4 44h7" /></g>
      <path d="M10 52h44" strokeWidth={2} opacity={0.5} />
      <g className="[transform-box:fill-box] [transform-origin:center] motion-safe:animate-[svc-bob_1.1s_ease-in-out_infinite]">
        <rect x="14" y="30" width="11" height="9" rx="1.5" fill="#fff" />
        <path d="M25 44l5-12h8l5 7h5" />
        <circle cx="22" cy="46" r="5" fill="#fff" />
        <circle cx="46" cy="46" r="5" fill="#fff" />
        <path d="M33 32l3-7h6" />
        <circle cx="40" cy="18" r="4" fill="#fff" />
        <path d="M36 25l4-2 4 5" strokeWidth={2} />
      </g>
    </svg>
  );
}

/** Cakes aren't in the shop yet, so this leads to the request page rather than a product list. */
export function CakeRequest() {
  return (
    <Link href="/cake-delivery-merta-city" className="mx-4 flex items-center gap-3 rounded-[14px] border border-line bg-card px-4 py-3 hover:border-brand-300 sm:mx-0">
      <Cake className="h-5 w-5 shrink-0 text-brand-700" aria-hidden />
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold text-ink">Need a cake?</span>
        <span className="block text-xs text-ink-2">Tell us the size, flavour and date. We confirm the price and time first.</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
    </Link>
  );
}

/** Compact local context under the shopping sections: what we deliver, where, with links to the main categories. */
export function LocalIntro({ etaLabel, produce = true }: { etaLabel: string; /** False while the fruit and vegetable categories are switched off. */ produce?: boolean }) {
  const link = "font-semibold text-brand-700 hover:underline";
  return (
    <section aria-labelledby="local-intro" className="mx-4 rounded-[14px] border border-line bg-card px-4 py-3.5 text-sm leading-relaxed text-ink-2 sm:mx-0">
      <h2 id="local-intro" className="font-display text-[15px] font-bold text-ink">{produce ? `Grocery, fruit and vegetable delivery in ${site.city}` : `Grocery and kirana delivery in ${site.city}`}</h2>
      <p className="mt-1">
        {site.seoName} delivers <Link href="/c/grocery" className={link}>grocery and kirana</Link>{produce ? <>, <Link href="/c/vegetables" className={link}>fresh vegetables</Link> and <Link href="/c/fruits" className={link}>fruits</Link></> : " and daily essentials"} to homes across {site.city}, Rajasthan, with a delivery target of {etaLabel} on eligible orders.
      </p>
      <p lang="hi" className="mt-1 text-ink-3">{produce ? "मेड़ता सिटी में किराना, फल और सब्ज़ी की होम डिलीवरी।" : "मेड़ता सिटी में किराना सामान की होम डिलीवरी।"}</p>
    </section>
  );
}
