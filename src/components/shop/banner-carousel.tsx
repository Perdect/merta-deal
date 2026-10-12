"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Banner } from "@/types/app";
import { cn } from "@/lib/utils";

export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [idx, setIdx] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const child = el.children[idx] as HTMLElement | undefined;
    if (child) el.scrollTo({ left: child.offsetLeft - 16, behavior: "smooth" });
  }, [idx]);
  if (!banners.length) return null;
  return (
    <div className="relative">
      <div ref={ref} className="scroll-x px-4 sm:px-0" onScroll={(e) => { const el = e.currentTarget; const w = (el.children[0] as HTMLElement)?.offsetWidth ?? 1; const i = Math.round(el.scrollLeft / (w + 12)); if (i !== idx && i >= 0 && i < banners.length) setIdx(i); }}>
        {banners.map((b, i) => (
          <Link key={b.id} href={b.link_url ?? "/categories"} className="relative block w-[88%] overflow-hidden rounded-xl sm:w-[60%] lg:w-[48%]" style={{ backgroundColor: b.bg_color ?? "#329537", color: b.text_color ?? "#fff" }}>
            {b.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" loading={i === 0 ? "eager" : "lazy"} />
            ) : (
              <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" aria-hidden />
            )}
            <div className="relative flex min-h-[150px] flex-col justify-between p-5 sm:min-h-[180px] sm:p-6">
              <div>
                <h2 className="max-w-[80%] font-display text-xl font-extrabold leading-tight sm:text-2xl">{b.title}</h2>
                {b.subtitle ? <p className="mt-1.5 max-w-[85%] text-sm opacity-90">{b.subtitle}</p> : null}
              </div>
              {b.cta_label ? <span className="mt-4 inline-flex w-fit items-center gap-1 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-bold text-ink">{b.cta_label} <ArrowRight className="h-3.5 w-3.5" /></span> : null}
            </div>
          </Link>
        ))}
      </div>
      {banners.length > 1 ? (
        <div className="mt-2.5 flex justify-center gap-1.5" aria-hidden>
          {banners.map((_, i) => <span key={i} className={cn("h-1.5 rounded-full transition-all", i === idx ? "w-5 bg-brand-600" : "w-1.5 bg-line-2")} />)}
        </div>
      ) : null}
    </div>
  );
}
