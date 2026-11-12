import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Compact festive banner, app style: one line of headline, one short tap target, the sweets on the
 * right. No discount or delivery claim that the settings do not back.
 */
export function DiwaliBanner() {
  return (
    <section aria-label="Diwali sweets" className="mx-4 sm:mx-0">
      <Link href="/c/sweets" aria-label="Diwali special: shop sweets" className="group relative isolate block overflow-hidden rounded-2xl border border-[#ead9b8] bg-[linear-gradient(110deg,#fff8ea_0%,#ffe9c2_60%,#f3d08f_100%)] shadow-card transition active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-white/40 blur-2xl sm:h-72 sm:w-72" />
        <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_112px] items-center gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_200px] sm:gap-8 sm:px-8 sm:py-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a2691f]">Diwali special</p>
            <h2 className="mt-1 font-display text-[22px] font-extrabold leading-[1.1] tracking-tight text-[#173c2a] sm:text-3xl">Sweets for every <span className="text-[#a75d21]">celebration</span></h2>
            <span className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand-700 px-4 text-sm font-bold text-white shadow-sm transition group-hover:bg-brand-800">
              Shop sweets <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
          <div className="relative aspect-square w-[112px] justify-self-end sm:w-[200px]">
            <span aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_40%_35%,#fffdf8_0%,#f7e6c3_70%,#e8cb93_100%)] shadow-[0_10px_28px_rgba(104,72,32,0.18)]" />
            <Image src="/categories/sweets-collage.webp" alt="" fill sizes="(max-width: 640px) 112px, 200px" className="z-[1] object-contain p-[8%] drop-shadow-[0_8px_8px_rgba(91,54,14,0.18)]" />
          </div>
        </div>
      </Link>
    </section>
  );
}
