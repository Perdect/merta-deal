"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { Banner } from "@/types/app";
import { cn } from "@/lib/utils";

/**
 * The home's promotional banner, and the only promotional surface on the screen: every word, colour,
 * link and picture comes from a row the owner wrote in Admin → Promotions → Banners. Nothing is
 * composed here — no discount, no delivery time, no "limited offer" that the admin did not type — so
 * the shop can never promise something the settings do not back.
 *
 * A banner with artwork shows it; a banner without one gets a wash of its own brand colour rather than
 * an unrelated stock photo. More than one banner turns the card into a swipeable rail with dots.
 */
export function BannerCarousel({ banners, className }: { banners: Banner[]; className?: string }) {
  const [idx, setIdx] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);
  const paused = React.useRef(false);
  const count = banners.length;

  // Auto-advance only with something to advance to, and never while the customer is touching it.
  React.useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => { if (!paused.current) setIdx((i) => (i + 1) % count); }, 6000);
    return () => clearInterval(t);
  }, [count]);

  const scrollTo = React.useCallback((i: number) => {
    const el = ref.current; const child = el?.children[i] as HTMLElement | undefined;
    const first = el?.children[0] as HTMLElement | undefined;
    // Measured against the first slide, not the scroller: `offsetLeft` counts the container's own
    // 16px gutter, so subtracting the scroller's offset would scroll the gutter away on slide one.
    if (el && child && first) el.scrollTo({ left: child.offsetLeft - first.offsetLeft, behavior: "smooth" });
  }, []);
  React.useEffect(() => { scrollTo(idx); }, [idx, scrollTo]);

  if (!count) return null;

  return (
    <section aria-label="Offers" className={cn("relative", className)}>
      <div
        ref={ref}
        /* `scroll-x` already snaps every child to the scrollport start, which would align slide one
           flush to the edge and eat the 16px page gutter; scroll-pl-4 moves the snap line in to match. */
        className="scroll-x px-4 scroll-pl-4 sm:px-0 sm:scroll-pl-0"
        onPointerDown={() => { paused.current = true; }}
        onPointerUp={() => { paused.current = false; }}
        onScroll={(e) => {
          const el = e.currentTarget; const w = (el.children[0] as HTMLElement)?.offsetWidth ?? 1;
          const i = Math.round(el.scrollLeft / (w + 12));
          if (i !== idx && i >= 0 && i < count) setIdx(i);
        }}
      >
        {banners.map((b, i) => {
          const bg = b.bg_color ?? "#176b3a";
          const fg = b.text_color ?? "#FFFFFF";
          return (
            <Link
              key={b.id}
              href={b.link_url || "/categories"}
              aria-label={b.cta_label ? `${b.title} — ${b.cta_label}` : b.title}
              className={cn(
                "group relative isolate block shrink-0 snap-start overflow-hidden rounded-[22px] shadow-[0_8px_26px_rgba(16,60,36,0.10)] transition duration-200",
                "hover:shadow-[0_12px_32px_rgba(16,60,36,0.16)] active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
                count > 1 ? "w-[88%] sm:w-[60%] lg:w-[48%]" : "w-full",
              )}
              style={{ backgroundColor: bg, color: fg }}
            >
              {b.image_url ? (
                <Image src={b.image_url} alt="" fill sizes="(max-width: 640px) 90vw, 560px" priority={i === 0} className="object-cover opacity-95" />
              ) : (
                <>
                  {/* No artwork: the banner's own colour, lifted so the text stays readable. */}
                  <span aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10" />
                  <span aria-hidden className="pointer-events-none absolute -bottom-20 right-[22%] h-52 w-52 rounded-full bg-white/[0.07] blur-2xl" />
                </>
              )}
              {b.image_url ? <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" /> : null}
              <div className="relative z-10 flex min-h-[158px] flex-col justify-center gap-1.5 p-5 sm:min-h-[184px] sm:p-7">
                <h2 className="max-w-[78%] font-display text-[21px] font-extrabold leading-[1.1] tracking-tight sm:text-[27px]">{b.title}</h2>
                {b.subtitle ? <p className="max-w-[82%] text-[13px] leading-snug opacity-90 sm:text-sm">{b.subtitle}</p> : null}
                {b.cta_label ? (
                  <span className="mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-ink shadow-sm transition group-hover:gap-2.5 sm:text-sm">
                    {b.cta_label} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
      {count > 1 ? (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Show offer ${i + 1} of ${count}`}
              aria-current={i === idx}
              onClick={() => setIdx(i)}
              className={cn(
                "h-1.5 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                i === idx ? "w-5 bg-brand-600" : "w-1.5 bg-line-2 hover:bg-ink-4",
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
