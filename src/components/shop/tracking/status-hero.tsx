"use client";
import * as React from "react";
import { ChevronLeft, Wifi, WifiOff } from "lucide-react";
import type { OrderStatus } from "@/lib/order-status";
import { CUSTOMER_STEPS } from "@/components/shop/order-status";
import { OrderStatusArt } from "@/components/shop/order-status-art";
import { useSmartBack } from "@/components/shop/app-view";
import { cn, formatTime } from "@/lib/utils";

/** Edge to edge on phones and tablets (the same sum the AppBar uses); an ordinary block on desktop. */
const BLEED = "mx-[calc(50%_-_(100vw_-_var(--sbw,0px))/2)] w-[calc(100vw_-_var(--sbw,0px))] lg:mx-0 lg:w-auto";

/**
 * The top of the tracking screen, as one green band in two pieces. The first is the page's own bar on
 * phones — Back, what is happening, and when it should arrive — and stays at the top while the page
 * scrolls. The second carries the four steps (placed → packing → on the way → delivered, the same ones
 * the timeline spells out with times), the order number and whether this screen is still receiving
 * updates; it scrolls away with the page.
 *
 * "Live" is only ever the Realtime connection's own answer. When it drops the pill says so and the
 * line under it gives the time of the last update we actually received.
 *
 * Both pieces are siblings so the bar can stick for the whole page: render this directly inside the
 * screen's grid. The second piece pulls itself up over the grid's gap and one pixel under the bar, so
 * no seam shows between them (`joinClassName`: the caller's gap plus 1px, negative).
 */
export function StatusHero({ status, eyebrow, title, note, orderNumber, active, connected, offline, syncedAt, back = "/account/orders", joinClassName = "-mt-[13px] lg:-mt-[17px]" }: {
  status: OrderStatus;
  /** The small line over the headline; left out when the headline already says everything. */ eyebrow?: React.ReactNode;
  title: React.ReactNode; note?: React.ReactNode; orderNumber: string;
  /** False once the order is delivered, cancelled or rejected: nothing more will arrive. */ active: boolean;
  connected: boolean; offline: boolean; syncedAt: number | null;
  back?: string; joinClassName?: string;
}) {
  const goBack = useSmartBack(back);
  const bar = React.useRef<HTMLDivElement>(null);
  // This bar is the page's top bar below desktop, so it publishes what the AppBar would: its height
  // (the offline banner sits under it) and the scrollbar's width (the edge-to-edge sum above).
  React.useEffect(() => {
    const el = bar.current; if (!el) return;
    const root = document.documentElement;
    const set = () => {
      if (el.offsetHeight > 0 && !window.matchMedia("(min-width: 1024px)").matches) root.style.setProperty("--header-h", `${el.offsetHeight}px`);
      root.style.setProperty("--sbw", `${Math.max(0, window.innerWidth - root.clientWidth)}px`);
    };
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    window.addEventListener("resize", set);
    return () => { ro.disconnect(); window.removeEventListener("resize", set); };
  }, []);

  const stopped = status === "cancelled" || status === "rejected";
  const tone = stopped ? "bg-ink" : "bg-brand-700";
  const current = CUSTOMER_STEPS.findIndex((s) => s.statuses.includes(status));
  return (
    <>
      <div ref={bar} data-page-bar="" className={cn("sticky top-0 z-30 flex items-center gap-3 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top,0px)_+_10px)] text-white lg:static lg:z-auto lg:rounded-t-xl lg:px-6 lg:pb-4 lg:pt-6", BLEED, tone)}>
        <button type="button" onClick={goBack} aria-label="Back"
          className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors duration-150 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </button>
        {/* Status changes arrive over Realtime; the new headline is announced to screen readers. */}
        <div aria-live="polite" aria-atomic="true" className="min-w-0 flex-1">
          {eyebrow ? <p className="truncate text-[13px] font-semibold leading-tight text-white/85">{eyebrow}</p> : null}
          <h1 className="text-balance font-display text-[22px] font-extrabold leading-[1.15] tracking-tight sm:text-2xl lg:text-[28px]">{title}</h1>
        </div>
        <OrderStatusArt key={status} status={status} className="hidden h-14 w-14 lg:block" />
      </div>

      <div className={cn("rounded-b-[28px] px-4 pb-4 pt-px text-white shadow-card lg:rounded-b-xl lg:px-6 lg:pb-6", BLEED, tone, joinClassName)}>
        {note ? <p className="pl-14 text-sm leading-snug text-white/85">{note}</p> : null}

        {!stopped && current >= 0 ? (
          <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Order progress">
            {CUSTOMER_STEPS.map((s, i) => {
              const done = i < current || (i === current && s.key === "delivered"); const now = i === current && !done;
              return (
                <li key={s.key} aria-current={i === current ? "step" : undefined} className="min-w-0">
                  <span aria-hidden className={cn("block h-1.5 rounded-full", done ? "bg-white" : now ? "bg-white motion-safe:animate-pulse-soft" : "bg-white/25")} />
                  <span className={cn("mt-1.5 block truncate text-[11px] leading-tight", i <= current ? "font-bold text-white" : "font-medium text-white/65")}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        ) : null}

        <div className="mt-3.5 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs font-semibold text-white/80">Order <span className="tabular">{orderNumber}</span></p>
          {active ? (
            <span role="status" aria-live="polite" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">
              {connected
                ? <><span aria-hidden className="h-2 w-2 rounded-full bg-brand-300 motion-safe:animate-pulse-soft" />Live updates</>
                : <>{offline ? <WifiOff className="h-3 w-3" aria-hidden /> : <Wifi className="h-3 w-3 opacity-70" aria-hidden />}{offline ? "No internet" : "Reconnecting…"}</>}
            </span>
          ) : null}
        </div>

        {active && !connected && syncedAt ? <p className="mt-2 text-xs text-white/75">Showing the last update we received, at {formatTime(new Date(syncedAt))}.</p> : null}
      </div>
    </>
  );
}
