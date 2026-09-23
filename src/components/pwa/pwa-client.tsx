"use client";
import * as React from "react";
import { Share, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/misc";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const DISMISS_KEY = "md_install_dismissed";

/** Registers the service worker (production) and shows a restrained "Add to Home Screen" sheet. */
export function PwaClient() {
  const [bip, setBip] = React.useState<BIPEvent | null>(null);
  const [show, setShow] = React.useState(false);
  const [ios] = React.useState(() => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    let dismissedAt = 0; try { dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0); } catch {}
    if (Date.now() - dismissedAt < 7 * 86400 * 1000) return;
    const isIos = ios;
    const onBip = (e: Event) => { e.preventDefault(); setBip(e as BIPEvent); setTimeout(() => setShow(true), 2600); };
    window.addEventListener("beforeinstallprompt", onBip);
    if (isIos) { const t = setTimeout(() => setShow(true), 4000); return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", onBip); }; }
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [ios]);

  const dismiss = () => { setShow(false); try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {} };
  const install = async () => { if (!bip) return; await bip.prompt(); const { outcome } = await bip.userChoice; if (outcome === "accepted") setShow(false); else dismiss(); };
  if (!show) return null;
  return (
    <div className="fixed inset-x-3 z-50 md:left-auto md:right-6 md:w-96" style={{ bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 12px)" }} role="dialog" aria-label="Install Merta Deal">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-card/95 p-3.5 shadow-float backdrop-blur animate-slide-up">
        <LogoMark size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">Add Merta Deal to your home screen</p>
          {ios ? <p className="mt-0.5 text-xs text-ink-3">Tap <Share className="inline h-3.5 w-3.5" /> Share, then “Add to Home Screen”. No app store needed.</p> : <p className="mt-0.5 text-xs text-ink-3">One tap. Opens like an app, no install from the store.</p>}
          {!ios ? <Button size="xs" className="mt-2" onClick={install}><Download className="h-3.5 w-3.5" /> Install</Button> : null}
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-ink-4 hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
