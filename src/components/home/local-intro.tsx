import Link from "next/link";
import { Cake, ChevronRight } from "lucide-react";
import { site } from "@/config/site";

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
