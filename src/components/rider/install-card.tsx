"use client";
import * as React from "react";
import { Download, Share, Smartphone, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * "Install the rider app" card for the profile tab. Reports the real state of this browser: already
 * installed, installable with one tap (Chrome / Edge on Android and desktop), iOS Safari (manual Share →
 * Add to Home Screen), or a browser that offers no install, with the way to get one. Nothing is faked:
 * the Install button appears only once the browser has fired `beforeinstallprompt`.
 */
export function InstallCard() {
  const [standalone, setStandalone] = React.useState(false);
  const [bip, setBip] = React.useState<BIPEvent | null>(null);
  const [ios, setIos] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    // Read the browser's state after hydration (the server cannot know it), then listen for install events.
    const t = setTimeout(() => {
      const nav = navigator as Navigator & { standalone?: boolean };
      setStandalone(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));
    }, 0);
    const onBip = (e: Event) => { e.preventDefault(); setBip(e as BIPEvent); };
    const onInstalled = () => { setDone(true); setBip(null); };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  const install = async () => {
    if (!bip) return;
    await bip.prompt();
    const { outcome } = await bip.userChoice;
    if (outcome === "accepted") setDone(true);
    setBip(null);
  };

  const installed = standalone || done;
  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card" aria-labelledby="install-head">
      <h2 id="install-head" className="flex items-center gap-2 text-base font-bold text-ink"><Smartphone className="h-4 w-4 text-brand-700" aria-hidden />Rider app on your phone</h2>
      {installed ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-ink-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />Installed. Open <span className="font-semibold text-ink">MD Rider</span> from your home screen; it opens straight to this app and keeps your sign-in.</p>
      ) : bip ? (
        <>
          <p className="mt-2 text-sm text-ink-2">Install it once and it opens like an app from your home screen, full screen, with your sign-in kept.</p>
          <Button className="mt-3" onClick={install}><Download className="h-4 w-4" aria-hidden /> Install app</Button>
        </>
      ) : ios ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> <span className="font-semibold text-ink">Share</span> at the bottom of Safari.</li>
          <li>Choose <span className="font-semibold text-ink">Add to Home Screen</span>, then <span className="font-semibold text-ink">Add</span>.</li>
        </ol>
      ) : (
        <p className="mt-2 text-sm text-ink-2">This browser does not offer an install button. On Android, open this page in <span className="font-semibold text-ink">Chrome</span>, tap the ⋮ menu and choose <span className="font-semibold text-ink">Add to Home screen</span> (or “Install app”). Everything also works in the browser as it is.</p>
      )}
      <p className="mt-3 text-xs text-ink-3">Requests still ring only while the app is open on screen or the phone shows push notifications. The phone&apos;s GPS is used only after you allow location, and only while you are online or on a delivery.</p>
    </section>
  );
}
