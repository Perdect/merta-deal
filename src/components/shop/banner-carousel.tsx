"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { Banner } from "@/types/app";
import { cn } from "@/lib/utils";

/**
 * The home's promotional banner: every word, colour, link and picture comes from a row the owner wrote
 * in Admin → Promotions → Banners. Nothing is composed here — no discount, no delivery time, no "limited
 * offer" that the admin did not type — so the shop can never promise something the settings do not back.
 *
 * A banner with its own artwork shows it edge to edge. One without is a light card in a wash of the
 * banner's colour: the title (the part after a comma picked out in that colour), the admin's line, a
 * button in the colour, and on the right the picture of the line the banner links to (`art`, keyed by
 * banner id — the category's own image, never a stock photo). More than one banner turns the card into
 * a swipeable rail with dots.
 */
export function BannerCarousel({ banners, art, className }: { banners: Banner[]; /** Picture for a banner without artwork, by banner id. */ art?: Record<string, string | null | undefined>; className?: string }) {
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
          const width = count > 1 ? "w-[88%] sm:w-[60%] lg:w-[48%]" : "w-full";
          const frame = "group relative isolate block shrink-0 snap-start overflow-hidden rounded-[22px] transition duration-200 active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700";
          const label = b.cta_label ? `${b.title} — ${b.cta_label}` : b.title;
          if (b.image_url) {
            return (
              <Link key={b.id} href={b.link_url || "/categories"} aria-label={label} className={cn(frame, width, "shadow-[0_8px_26px_rgba(16,60,36,0.10)] hover:shadow-[0_12px_32px_rgba(16,60,36,0.16)]")} style={{ backgroundColor: bg, color: fg }}>
                <Image src={b.image_url} alt="" fill sizes="(max-width: 640px) 90vw, 560px" priority={i === 0} className="object-cover opacity-95" />
                <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
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
          }
          // No artwork: a light card in the banner's own colour.
          const picture = art?.[b.id] ?? null;
          const cut = b.title.indexOf(",");
          const [lead, rest] = cut > 0 ? [b.title.slice(0, cut + 1), b.title.slice(cut + 1).trim()] : ["", b.title];
          const accent = `color-mix(in srgb, ${bg} 88%, #000)`;
          return (
            <Link key={b.id} href={b.link_url || "/categories"} aria-label={label}
              className={cn(frame, width, "border shadow-card hover:shadow-float")}
              style={{ background: `linear-gradient(115deg, #fff 30%, color-mix(in srgb, ${bg} 16%, #fff) 100%)`, borderColor: `color-mix(in srgb, ${bg} 18%, #fff)` }}>
              {picture ? (
                <>
                  <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-[120%] w-[46%] rounded-[45%_55%_50%_50%] sm:w-[38%]" style={{ backgroundColor: `color-mix(in srgb, ${bg} 22%, #fff)` }} />
                  <span className="pointer-events-none absolute bottom-2 right-2 top-3 w-[42%] sm:right-6 sm:w-[32%]">
                    <Image src={picture} alt="" fill sizes="(max-width: 640px) 45vw, 260px" priority={i === 0} className="object-contain object-bottom drop-shadow-md transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none" />
                  </span>
                </>
              ) : (
                <span aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${bg} 14%, #fff)` }} />
              )}
              <div className={cn("relative z-10 flex min-h-[164px] flex-col justify-center gap-1.5 p-4 sm:min-h-[200px] sm:p-8", picture ? "max-w-[60%] sm:max-w-[62%]" : "max-w-[88%]")}>
                <h2 className="font-display text-[22px] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-[32px]">
                  {lead ? <>{lead}<br /></> : null}<span style={{ color: accent }}>{rest}</span>
                </h2>
                {b.subtitle ? <p className="text-xs leading-snug text-ink-2 sm:text-sm">{b.subtitle}</p> : null}
                {b.cta_label ? (
                  <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-extrabold uppercase tracking-wide shadow-[0_6px_14px_rgba(0,0,0,0.16)] transition group-hover:gap-2.5 sm:text-sm" style={{ backgroundColor: bg, color: fg }}>
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
