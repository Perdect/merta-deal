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
    const set = () => { if (el.offsetHeight > 0) document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`); };
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} data-page-bar="" className={cn("sticky top-0 z-30 mx-[calc(50%-50vw)] mb-3 flex min-h-14 w-screen items-center gap-1 bg-card px-2 pb-1.5 shadow-[0_1px_3px_rgb(23_32_28/0.08)] lg:hidden", className)} style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)" }}>
      <button type="button" onClick={goBack} aria-label="Back" className="tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2"><ChevronLeft className="h-6 w-6" /></button>
      {children ?? (
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate font-display text-[17px] font-bold leading-tight text-ink">{title}</p>
          {subtitle ? <p className="truncate text-xs text-ink-3">{subtitle}</p> : null}
        </div>
      )}
      {actions}
      {cart ? <CartButton className="tap h-10 w-10 shrink-0 text-ink" /> : null}
    </div>
  );
}

/** Round Back control with the same smart behaviour (previous screen, else `fallback`). */
export function BackButton({ fallback, className }: { fallback: string; className?: string }) {
  const goBack = useSmartBack(fallback);
  return <button type="button" onClick={goBack} aria-label="Back" className={cn("tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2", className)}><ChevronLeft className="h-6 w-6 md:h-5 md:w-5" /></button>;
}
