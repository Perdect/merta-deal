import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Compact festive banner, app style: one line of headline, one short tap target, the sweets on the
 * right. No discount or delivery claim that the settings do not back.
 */
export function DiwaliBanner() {
  return (
    <section aria-label="Diwali sweets" className="mx-4 sm:mx-0">
      <Link href="/c/sweets" aria-label="Diwali special: shop sweets" className="group relative isolate block overflow-hidden rounded-[22px] border border-[#ead9b8] bg-[linear-gradient(112deg,#fffaf0_0%,#fff0d7_58%,#f5d99f_100%)] shadow-[0_8px_26px_rgba(95,67,25,0.09)] transition duration-200 hover:shadow-[0_12px_32px_rgba(95,67,25,0.14)] active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-[#ba883e]/15" />
        <span aria-hidden className="pointer-events-none absolute right-10 top-4 h-36 w-36 rounded-full bg-white/50 blur-2xl sm:right-24 sm:h-48 sm:w-48" />
        <div className="relative z-10 grid min-h-[166px] grid-cols-[minmax(0,1fr)_94px] items-center gap-2 px-4 py-4 min-[420px]:grid-cols-[minmax(0,1fr)_116px] sm:min-h-[190px] sm:grid-cols-[minmax(0,1fr)_150px] sm:gap-5 sm:px-7 sm:py-5">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9b651e] sm:text-[11px]"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Diwali special</p>
            <h2 className="mt-1.5 font-display text-[20px] font-extrabold leading-[1.08] tracking-tight text-[#173c2a] min-[420px]:text-[22px] sm:text-[30px]">
              <span className="block">Sweeten every</span>
              <span className="block text-[#a75d21]">celebration</span>
            </h2>
            <span className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-brand-700 px-4 text-[13px] font-bold text-white shadow-[0_4px_10px_rgba(20,100,51,0.2)] transition group-hover:bg-brand-800 sm:mt-4 sm:min-h-11 sm:px-5 sm:text-sm">
              Shop sweets <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
          <div className="relative aspect-square w-[94px] justify-self-end min-[420px]:w-[116px] sm:w-[150px]">
            <span aria-hidden className="absolute inset-[2%] rounded-full bg-[radial-gradient(circle_at_40%_34%,#fffdf8_0%,#faeacb_68%,#e9c985_100%)] shadow-[0_12px_28px_rgba(104,72,32,0.13)]" />
            <span aria-hidden className="absolute inset-[9%] rounded-full border border-white/80" />
            <Image src="/categories/motichoor-bowl.webp" alt="" fill sizes="(max-width: 420px) 94px, (max-width: 640px) 116px, 150px" className="z-[1] object-contain p-[6%] drop-shadow-[0_8px_8px_rgba(91,54,14,0.2)] transition-transform duration-300 group-hover:scale-[1.04]" />
          </div>
        </div>
      </Link>
    </section>
  );
}
