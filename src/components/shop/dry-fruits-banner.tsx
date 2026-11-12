import Image from "next/image";

/** Wide category artwork using real almond and cashew catalog photos. */
export function DryFruitsBanner() {
  return (
    <section aria-labelledby="dry-fruits-banner-title" className="relative isolate mb-4 h-[180px] overflow-hidden rounded-2xl border border-[#eadcc2] bg-[#fff9ed] sm:h-[230px]">
      <Image
        src="/categories/dry-fruits-banner.webp"
        alt=""
        fill
        sizes="(max-width: 640px) 100vw, 1200px"
        className="hidden object-cover sm:block"
      />
      <Image
        src="/categories/dry-fruits-banner-mobile.webp"
        alt=""
        fill
        sizes="100vw"
        className="object-cover sm:hidden"
      />
      <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#fff9ed] via-[#fff9ed]/95 to-transparent sm:via-[#fff9ed]/90" />
      <div className="relative z-10 flex h-full max-w-[60%] flex-col justify-center px-4 sm:max-w-[52%] sm:px-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700 sm:text-xs">Merta Deal · Dry fruits</p>
        <h2 id="dry-fruits-banner-title" className="mt-1.5 font-display text-[21px] font-extrabold leading-[1.08] tracking-tight text-ink sm:mt-2 sm:text-3xl">
          Goodness for every day
        </h2>
        <p className="mt-1.5 max-w-xs text-[11px] leading-snug text-ink-2 sm:mt-2 sm:text-sm">
          Explore almonds, cashews and more for your pantry.
        </p>
      </div>
    </section>
  );
}
