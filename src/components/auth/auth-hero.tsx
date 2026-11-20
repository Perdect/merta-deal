"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Height ÷ width. Under about 0.44 the picture's own crop (it is anchored to the ground band) cuts the rider's helmet off. */
const MIN_ART_RATIO = 0.46;
/** With the keyboard away the picture never goes below this, even if the app-download box then needs a scroll. */
const COMFORT_ART_RATIO = 0.56;
/** A visible area this much shorter than the tallest one seen means the keyboard is up. */
const KEYBOARD_MIN_PX = 120;

/**
 * The picture block of the sign-in screen. From `sm` up it is just the left panel and does nothing.
 * On a phone it is the block across the top, and it gives way to the form: its height is whatever is left
 * of the *visible* screen after the form's main part (`[data-auth-primary]`: heading, field, button, terms),
 * so with the keyboard open the number and Continue stay above the keys without scrolling. When even the
 * smallest uncropped picture would not fit, the picture goes and only the bar with the logo stays.
 * Heights are set straight on the element (no re-render on every keyboard frame).
 */
export function AuthHero({ bar, children, className }: { bar: React.ReactNode; children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const barRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const phone = window.matchMedia("(max-width: 639.98px)");
    const vv = window.visualViewport;
    let tallest = 0;
    let width = 0;

    const fit = (fromViewport: boolean) => {
      const sheet = document.querySelector<HTMLElement>("[data-auth-sheet]");
      const primary = document.querySelector<HTMLElement>("[data-auth-primary]");
      if (!phone.matches || !sheet || !primary) { el.style.height = ""; delete el.dataset.collapsed; return; }
      const visible = Math.round(vv?.height ?? window.innerHeight);
      if (window.innerWidth !== width) { width = window.innerWidth; tallest = 0; } // rotated: start again
      tallest = Math.max(tallest, visible);
      const keyboard = tallest - visible > KEYBOARD_MIN_PX;
      const pad = getComputedStyle(sheet);
      const footer = document.querySelector<HTMLElement>("[data-auth-footer]");
      const need = parseFloat(pad.paddingTop) + primary.offsetHeight
        + (keyboard ? 12 : (footer?.offsetHeight ?? 0) + parseFloat(pad.paddingBottom));
      const room = visible - need;
      const collapsed = keyboard && room < Math.round(width * MIN_ART_RATIO);
      const floor = Math.round(width * (keyboard ? MIN_ART_RATIO : COMFORT_ART_RATIO));
      const height = collapsed ? (barRef.current?.offsetHeight ?? 64) : Math.max(floor, Math.min(room, Math.round(tallest * 0.33), 290));
      el.style.height = `${height}px`;
      el.dataset.collapsed = String(collapsed);
      // The browser may have pushed the page up to show the field; with the picture out of the way it is not needed.
      if (keyboard && fromViewport) requestAnimationFrame(() => window.scrollTo(0, 0));
    };

    const onViewport = () => fit(true);
    const onContent = () => fit(false);
    fit(false);
    vv?.addEventListener("resize", onViewport);
    window.addEventListener("resize", onViewport);
    phone.addEventListener("change", onContent);
    const watch = new ResizeObserver(onContent);
    for (const sel of ["[data-auth-primary]", "[data-auth-footer]"]) { const n = document.querySelector(sel); if (n) watch.observe(n); }
    return () => {
      vv?.removeEventListener("resize", onViewport);
      window.removeEventListener("resize", onViewport);
      phone.removeEventListener("change", onContent);
      watch.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className={cn("group relative h-[min(33svh,290px)] shrink-0 overflow-hidden rounded-b-[28px] bg-gradient-to-b from-brand-100 to-brand-50 transition-[height] duration-200 motion-reduce:transition-none sm:flex sm:h-auto sm:min-h-[540px] sm:flex-col sm:overflow-visible sm:rounded-none sm:bg-none", className)}>
      <div ref={barRef} className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top,0px)+10px)] sm:static sm:block sm:px-5 sm:pb-0 sm:pt-6">{bar}</div>
      <div className="absolute inset-0 transition-opacity duration-200 group-data-[collapsed=true]:opacity-0 motion-reduce:transition-none sm:relative sm:inset-auto sm:mt-4 sm:flex-1">{children}</div>
    </div>
  );
}
