"use client";
import * as React from "react";
import { Download, Share, Smartphone, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/rider-i18n";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * "Install the rider app" card for the profile tab. Reports the real state of this browser: already
 * installed; installable with one tap (Chrome / Edge on Android and desktop, once the browser has fired
 * `beforeinstallprompt`); iPhone or iPad in Safari (manual Share → Add to Home Screen, which is also what
 * makes notifications possible there); iPhone in another browser (go to Safari); opened inside another
 * app's built-in browser (cannot install from there); a desktop browser with no install; or an Android
 * browser with no install, with the way to get one. Nothing is faked: there is no Install button unless
 * the browser offered one.
 */
export function InstallCard() {
  const { t } = useT();
  const [env, setEnv] = React.useState<{ standalone: boolean; ios: boolean; iosSafari: boolean; inApp: boolean; mobile: boolean } | null>(null);
  const [bip, setBip] = React.useState<BIPEvent | null>(null);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    const tm = setTimeout(() => {
      const nav = navigator as Navigator & { standalone?: boolean };
      const ua = nav.userAgent;
      // iPadOS calls itself a Mac; touch points tell them apart.
      const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && nav.maxTouchPoints > 1);
      const inApp = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|; wv\)/i.test(ua);
      setEnv({
        standalone: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
        ios, iosSafari: ios && !inApp && !/crios|fxios|edgios|opios/i.test(ua), inApp,
        mobile: ios || /android/i.test(ua),
      });
    }, 0);
    const onBip = (e: Event) => { e.preventDefault(); setBip(e as BIPEvent); };
    const onInstalled = () => { setDone(true); setBip(null); };
    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setEnv((cur) => (cur ? { ...cur, standalone: mq.matches || cur.standalone } : cur));
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    mq.addEventListener("change", onMode);
    return () => { clearTimeout(tm); window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled); mq.removeEventListener("change", onMode); };
  }, []);

  const install = async () => {
    if (!bip) return;
    await bip.prompt();
    const { outcome } = await bip.userChoice;
    if (outcome === "accepted") setDone(true);
    setBip(null);
  };

  const installed = Boolean(env?.standalone) || done;
  return (
    <section className="rounded-[20px] border border-white/70 bg-white/80 p-4 shadow-card backdrop-blur-md" aria-labelledby="install-head">
      <h2 id="install-head" className="flex items-center gap-2 font-display text-[16px] font-extrabold text-ink"><Smartphone className="h-4 w-4 text-brand-700" aria-hidden />{t("install.title")}</h2>
      {installed ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-ink-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />{t("install.installed")}</p>
      ) : bip ? (
        <>
          <p className="mt-2 text-sm text-ink-2">{t("install.oneTap")}</p>
          <Button className="mt-3 h-12 rounded-xl" onClick={install}><Download className="h-4 w-4" aria-hidden /> {t("install.button")}</Button>
        </>
      ) : !env ? (
        <p className="mt-2 text-sm text-ink-3">{t("common.checking")}</p>
      ) : env.inApp ? (
        <p className="mt-2 text-sm text-ink-2">{t("install.inApp")}</p>
      ) : env.iosSafari ? (
        <>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-2">
            <li>{t("install.iosStep1")} <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /></li>
            <li>{t("install.iosStep2")}</li>
          </ol>
          <p className="mt-2 rounded-xl bg-warning-50 px-3 py-2 text-xs text-ink">{t("install.iosPush")}</p>
        </>
      ) : env.ios ? (
        <>
          <p className="mt-2 text-sm text-ink-2">{t("install.iosOtherBrowser")}</p>
          <p className="mt-2 rounded-xl bg-warning-50 px-3 py-2 text-xs text-ink">{t("install.iosPush")}</p>
        </>
      ) : !env.mobile ? (
        <p className="mt-2 text-sm text-ink-2">{t("install.desktop")}</p>
      ) : (
        <p className="mt-2 text-sm text-ink-2">{t("install.noPrompt")}</p>
      )}
      <details className="group mt-3">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600">{t("install.learnMore")}<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden /></summary>
        <p className="mt-1.5 text-xs text-ink-3">{t("install.note")}</p>
      </details>
    </section>
  );
}
