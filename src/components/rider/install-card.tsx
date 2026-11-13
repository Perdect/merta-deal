"use client";
import * as React from "react";
import { Download, Share, Smartphone, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/rider-i18n";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * "Install the rider app" card for the profile tab. Reports the real state of this browser: already
 * installed, installable with one tap (Chrome / Edge on Android and desktop), iOS Safari (manual Share →
 * Add to Home Screen), or a browser that offers no install, with the way to get one. Nothing is faked:
 * the Install button appears only once the browser has fired `beforeinstallprompt`.
 */
export function InstallCard() {
  const { t } = useT();
  const [standalone, setStandalone] = React.useState(false);
  const [bip, setBip] = React.useState<BIPEvent | null>(null);
  const [ios, setIos] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    const tm = setTimeout(() => {
      const nav = navigator as Navigator & { standalone?: boolean };
      setStandalone(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));
    }, 0);
    const onBip = (e: Event) => { e.preventDefault(); setBip(e as BIPEvent); };
    const onInstalled = () => { setDone(true); setBip(null); };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => { clearTimeout(tm); window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled); };
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
    <section className="rounded-[20px] border border-line bg-card p-4 shadow-card" aria-labelledby="install-head">
      <h2 id="install-head" className="flex items-center gap-2 font-display text-[16px] font-extrabold text-ink"><Smartphone className="h-4 w-4 text-brand-700" aria-hidden />{t("install.title")}</h2>
      {installed ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-ink-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />{t("install.installed")}</p>
      ) : bip ? (
        <>
          <p className="mt-2 text-sm text-ink-2">{t("install.oneTap")}</p>
          <Button className="mt-3 h-12 rounded-xl" onClick={install}><Download className="h-4 w-4" aria-hidden /> {t("install.button")}</Button>
        </>
      ) : ios ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>{t("install.iosStep1")} <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /></li>
          <li>{t("install.iosStep2")}</li>
        </ol>
      ) : (
        <p className="mt-2 text-sm text-ink-2">{t("install.noPrompt")}</p>
      )}
      <p className="mt-3 text-xs text-ink-3">{t("install.note")}</p>
    </section>
  );
}
