import Link from "next/link";
import { site } from "@/config/site";

/** Compact local context under the shopping sections: what we deliver, where, with links to the main categories. */
export function LocalIntro({ etaLabel }: { etaLabel: string }) {
  const link = "font-semibold text-brand-700 hover:underline";
  return (
    <section aria-labelledby="local-intro" className="mx-4 rounded-[14px] border border-line bg-card px-4 py-3.5 text-sm leading-relaxed text-ink-2 sm:mx-0">
      <h2 id="local-intro" className="font-display text-[15px] font-bold text-ink">Grocery, fruit and vegetable delivery in {site.city}</h2>
      <p className="mt-1">
        {site.seoName} delivers <Link href="/c/grocery" className={link}>grocery and kirana</Link>, <Link href="/c/vegetables" className={link}>fresh vegetables</Link> and <Link href="/c/fruits" className={link}>fruits</Link> to homes across {site.city}, Rajasthan — usually in {etaLabel}.
      </p>
      <p lang="hi" className="mt-1 text-ink-3">मेड़ता सिटी में किराना, फल और सब्ज़ी की होम डिलीवरी।</p>
    </section>
  );
}
