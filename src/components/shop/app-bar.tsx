"use client";
import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { CartButton } from "./cart-button";
import { useSmartBack } from "./app-view";
import { cn } from "@/lib/utils";

/**
 * Compact top bar for inner pages on phones and tablets (the shopping header is hidden there):
 * Back, the title (or a search field as children), then actions and the Cart. Hidden on desktop,
 * where the shopping header stays. Publishes its height as --header-h for sticky toolbars below it.
 */
export function AppBar({ title, subtitle, back = "/", actions, cart = false, children, className }: {
  title?: React.ReactNode; subtitle?: React.ReactNode; back?: string; actions?: React.ReactNode; cart?: boolean; children?: React.ReactNode; className?: string;
}) {
  const goBack = useSmartBack(back);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const root = document.documentElement;
    const set = () => {
      if (el.offsetHeight > 0) root.style.setProperty("--header-h", `${el.offsetHeight}px`);
      // 100vw includes a desktop scrollbar; without subtracting it the right-hand Cart was clipped.
      root.style.setProperty("--sbw", `${Math.max(0, window.innerWidth - root.clientWidth)}px`);
    };
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    window.addEventListener("resize", set);
    return () => { ro.disconnect(); window.removeEventListener("resize", set); };
  }, []);
  return (
    <div ref={ref} data-page-bar="" className={cn("sticky top-0 z-30 mx-[calc(50%_-_(100vw_-_var(--sbw,0px))/2)] mb-3 flex min-h-14 w-[calc(100vw_-_var(--sbw,0px))] items-center gap-0.5 border-b border-line bg-card px-1.5 pb-1 lg:hidden", className)} style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)" }}>
      <button type="button" onClick={goBack} aria-label="Back" className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600"><ChevronLeft className="h-6 w-6" aria-hidden /></button>
      {children ?? (
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate font-display text-base font-bold leading-tight text-ink">{title}</p>
          {subtitle ? <p className="truncate text-xs text-ink-3">{subtitle}</p> : null}
        </div>
      )}
      {actions}
      {cart ? <CartButton className="tap h-11 w-11 shrink-0 text-ink focus-visible:outline-2 focus-visible:outline-brand-600" /> : null}
    </div>
  );
}

/** Round Back control with the same smart behaviour (previous screen, else `fallback`). */
export function BackButton({ fallback, className }: { fallback: string; className?: string }) {
  const goBack = useSmartBack(fallback);
  return <button type="button" onClick={goBack} aria-label="Back" className={cn("tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600", className)}><ChevronLeft className="h-6 w-6 md:h-5 md:w-5" aria-hidden /></button>;
}
