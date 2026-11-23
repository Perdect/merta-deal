"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * One app frame for every rider screen. On a phone (and in the installed app) it is simply the full screen.
 * From 640 px up the whole app lives in one centred phone-width column on a quiet backdrop, so on a laptop it
 * reads as the phone app in a window and never as a stretched web page.
 *
 * The column is the `<body>` itself: it is given the phone width, the full height and a transform, which makes
 * it the containing block for every `position: fixed` piece. That is what keeps the tab bar, the request strip
 * and everything that portals to `<body>` (bottom sheets, dialogs, toasts, the install prompt) inside the column
 * without touching those components. The body does not scroll; this element does, so the fixed pieces stay put.
 * Selected with `:has()`, so it is right from the server render and leaves every other part of the site alone.
 */
const FRAME_CSS = `
@media (min-width: 640px) {
  html:has(.rider-app) { height: 100%; overflow: hidden; background: #e6eae7; }
  html:has(.rider-app) body { width: 430px; max-width: 100%; height: 100dvh; min-height: 0; margin-inline: auto; padding-inline: 0; overflow: hidden; transform: translateZ(0); background: #fff; box-shadow: 0 0 0 1px rgb(23 32 28 / 0.07), 0 30px 80px -30px rgb(23 32 28 / 0.35); }
  html:has(.rider-app) .rider-app { height: 100dvh; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; }
  html:has(.rider-app) .rider-app::-webkit-scrollbar { display: none; }
}
`;

export function RiderFrame({ children, className, lang, style }: { children: React.ReactNode; className?: string; lang?: string; style?: React.CSSProperties }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // In the column this element is the scroller, so a new screen starts at its top the way a new page does.
  React.useEffect(() => { ref.current?.scrollTo(0, 0); }, [pathname]);
  return (
    <div ref={ref} lang={lang} className={cn("rider-app", className)} style={style}>
      <style href="md-rider-frame" precedence="medium">{FRAME_CSS}</style>
      {children}
    </div>
  );
}
