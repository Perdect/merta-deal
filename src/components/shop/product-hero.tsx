"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Share2, ChevronRight, Link2 } from "lucide-react";
import { ProductImage } from "./product-image";
import { toast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/overlay";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";
import { cn, formatINR } from "@/lib/utils";

const circle = "tap flex h-10 w-10 items-center justify-center rounded-full bg-card/95 text-ink shadow-card backdrop-blur transition-colors hover:bg-surface-2";

/** Share sheet: WhatsApp first (how Merta shares), then copy link, then the phone's own share menu. */
function useShare(name: string, price?: number) {
  const [open, setOpen] = React.useState(false);
  const [canNative, setCanNative] = React.useState(false);
  const url = () => window.location.href.split("#")[0];
  const text = () => `${name}${price != null ? ` – ${formatINR(price)}` : ""} on Merta Deal`;
  const show = () => { setCanNative(typeof navigator.share === "function"); setOpen(true); };
  const copy = async () => { try { await navigator.clipboard.writeText(url()); toast.success("Link copied"); setOpen(false); } catch { toast.error("Could not copy the link"); } };
  const native = async () => { setOpen(false); try { await navigator.share({ title: name, text: text(), url: url() }); } catch { /* dismissed */ } };
  const row = "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-semibold text-ink transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600";
  const sheet = (
    <Modal open={open} onClose={() => setOpen(false)} title="Share product" size="sm">
      <div className="-mx-2 space-y-1 pb-1">
        <a href={open ? `https://wa.me/?text=${encodeURIComponent(`${text()}\n${url()}`)}` : "#"} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={row}>
          <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white"><WhatsAppIcon className="h-[22px] w-[22px]" /></span>WhatsApp
        </a>
        <button type="button" onClick={copy} className={row}><span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink"><Link2 className="h-5 w-5" strokeWidth={1.75} /></span>Copy link</button>
        {canNative ? <button type="button" onClick={native} className={row}><span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink"><Share2 className="h-5 w-5" strokeWidth={1.75} /></span>More options</button> : null}
      </div>
    </Modal>
  );
  return { show, sheet };
}

/** Share icon for the product info card (desktop); mobile has one over the gallery. */
export function ShareButton({ name, price, className }: { name: string; price?: number; className?: string }) {
  const { show, sheet } = useShare(name, price);
  return <><button type="button" onClick={show} aria-label="Share" className={cn("flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-ink hover:bg-surface-2", className)}><Share2 className="h-5 w-5" /></button>{sheet}</>;
}

/**
 * Edge-to-edge swipeable gallery with floating back / search / share controls on mobile, and a
 * compact bar (thumbnail · name · price) that slides in once the gallery scrolls out of view.
 * On desktop it is a plain framed gallery with thumbnails; the regular header stays.
 */
export function ProductHero({ images, name, brand, packSize, price, mrp, backHref, children }: {
  images: string[]; name: string; brand?: string | null; packSize?: string | null; price: number; mrp: number;
  /** Where "back" goes when the page was opened directly (no history). */
  backHref: string;
  /** Overlay slot (wishlist button). */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const scroller = React.useRef<HTMLDivElement>(null);
  const hero = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);
  const [compact, setCompact] = React.useState(false);
  const list = images.length ? images : [null];

  React.useEffect(() => {
    const el = hero.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const goTo = (i: number) => scroller.current?.scrollTo({ left: i * scroller.current.clientWidth, behavior: "smooth" });
  const back = () => { if (window.history.length > 1) router.back(); else router.push(backHref); };
  const { show: share, sheet } = useShare(name, price);

  return (
    <>
      <div aria-hidden={!compact} className={cn("fixed inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-line bg-card/95 px-3 pb-2 backdrop-blur transition-transform duration-200 md:hidden", compact ? "translate-y-0" : "pointer-events-none -translate-y-full")} style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}>
        <button type="button" onClick={back} aria-label="Back" className={circle}><ArrowLeft className="h-5 w-5" /></button>
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-white"><ProductImage image={list[0]} brand={brand} productName={name} className="h-full w-full" sizes="40px" /></div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="text-sm tabular"><span className="font-bold text-ink">{formatINR(price)}</span>{mrp > price ? <span className="ml-1.5 text-xs text-ink-3 line-through">{formatINR(mrp)}</span> : null}</p>
        </div>
        <Link href="/search" aria-label="Search" className={circle}><Search className="h-5 w-5" /></Link>
        <button type="button" onClick={share} aria-label="Share" className={circle}><Share2 className="h-5 w-5" /></button>
      </div>

      {/* The thumbnail rail only exists with several photos; a lone photo takes the full width. */}
      <div className={cn(list.length > 1 && "md:grid md:grid-cols-[72px_1fr] md:gap-3")}>
        {list.length > 1 ? (
          <div className="hidden gap-2 md:order-1 md:flex md:flex-col">
            {list.map((src, i) => (
              <button key={i} type="button" onClick={() => goTo(i)} aria-label={`Image ${i + 1}`} aria-current={i === active} className={cn("h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white transition-colors", i === active ? "border-ink" : "border-line hover:border-line-2")}>
                <ProductImage image={src} brand={brand} productName={name} className="h-full w-full" sizes="64px" />
              </button>
            ))}
          </div>
        ) : null}
        <div ref={hero} className="relative md:order-2">
          <div ref={scroller} onScroll={onScroll} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden bg-white md:rounded-2xl md:border md:border-line">
            {list.map((src, i) => (
              <div key={i} className="w-full shrink-0 snap-center">
                <ProductImage image={src} brand={brand} productName={name} packSize={packSize} className="aspect-square w-full" rounded="rounded-none" sizes="(max-width: 768px) 100vw, 560px" priority={i === 0} />
              </div>
            ))}
          </div>
          {list.length > 1 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center gap-1.5 md:hidden">
              {list.map((_, i) => <span key={i} className={cn("h-1.5 rounded-full transition-all duration-200", i === active ? "w-4 bg-brand-700" : "w-1.5 bg-ink/25")} />)}
            </div>
          ) : null}
          {list.length > 1 ? <button type="button" onClick={() => goTo((active + 1) % list.length)} aria-label="Next image" className="absolute bottom-4 right-4 hidden h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-ink shadow-card hover:bg-surface-2 md:flex"><ChevronRight className="h-5 w-5" /></button> : null}
          <div className="absolute left-3 top-3 md:hidden"><button type="button" onClick={back} aria-label="Back" className={circle}><ArrowLeft className="h-5 w-5" /></button></div>
          <div className="absolute right-3 top-3 flex gap-2 md:hidden">
            <Link href="/search" aria-label="Search" className={circle}><Search className="h-5 w-5" /></Link>
            <button type="button" onClick={share} aria-label="Share" className={circle}><Share2 className="h-5 w-5" /></button>
          </div>
          {children ? <div className="absolute bottom-9 right-3 md:right-auto md:left-3 md:top-3 md:bottom-auto">{children}</div> : null}
        </div>
      </div>
      {sheet}
    </>
  );
}
