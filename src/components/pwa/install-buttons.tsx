"use client";
import * as React from "react";
import { Share, Check, MoreVertical } from "lucide-react";
import { BottomSheet } from "@/components/ui/overlay";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

/** Platform marks (drawn inline; lucide ships no brand icons). */
function AndroidMark({ className }: { className?: string }) {
  // Play-style four-colour triangle.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M4 2.5v19L13 12z" fill="#00B4FF" />
      <path d="M4 2.5 13 12l3.6-3.5z" fill="#00D467" />
      <path d="M4 21.5l12.6-6L13 12z" fill="#FF3A44" />
      <path d="M16.6 8.5 21 11a1.2 1.2 0 0 1 0 2l-4.4 2.5L13 12z" fill="#FFC700" />
    </svg>
  );
}
function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 7.6c-1.2 0-2-.7-3.4-.7C6.3 6.9 4.3 8.8 4.3 12.2c0 4 2.7 8.3 4.8 8.3 1 0 1.6-.6 2.9-.6s1.8.6 2.9.6c1.7 0 3.3-2.7 4-4.4-1.8-.8-2.9-2.5-2.9-4.4 0-1.7.9-3.1 2.2-3.9-.9-1.2-2.3-1.9-3.7-1.9-1.3 0-2.1.7-3.5.7z" />
      <path d="M12.3 6.4c0-1.7 1.2-3.2 3-3.6 0 1.8-1.2 3.3-3 3.6z" />
    </svg>
  );
}

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * "Download app" buttons. Merta Deal ships as an installable web app (no store listings yet), so
 * these do the real thing: Android → the browser's install prompt; iPhone → the Add to Home
 * Screen steps. No store badges, because there is nothing in the stores to link to.
 */
export function InstallButtons({ className }: { className?: string }) {
  const [bip, setBip] = React.useState<BIPEvent | null>(null);
  const [justInstalled, setJustInstalled] = React.useState(false);
  const [help, setHelp] = React.useState<"android" | "ios" | null>(null);
  // Already running as the installed app? Read from the display-mode media query (server: no).
  const standalone = React.useSyncExternalStore(
    (cb) => { const mq = window.matchMedia("(display-mode: standalone)"); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); },
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );
  const installed = standalone || justInstalled;

  React.useEffect(() => {
    const onBip = (e: Event) => { e.preventDefault(); setBip(e as BIPEvent); };
    const onInstalled = () => setJustInstalled(true);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  const android = async () => {
    // Once the Play Store listing is live, Android users get the real app from there.
    if (env.playStoreUrl) { window.location.href = env.playStoreUrl; return; }
    if (bip) { await bip.prompt(); const { outcome } = await bip.userChoice; if (outcome === "accepted") setJustInstalled(true); return; }
    setHelp("android");
  };
  const btn = "flex h-12 w-full min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line-2 bg-white px-2.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink-3 hover:bg-surface active:scale-[0.99] min-[380px]:text-sm sm:h-14 sm:gap-3 sm:px-4 sm:text-[15px]";

  return (
    <div className={cn("space-y-3", className)}>
      {installed ? (
        <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-50 px-4 py-3 text-sm font-semibold text-brand-800"><Check className="h-4 w-4" /> Installed on this device</p>
      ) : (
        <>
          <button type="button" onClick={android} className={btn}><AndroidMark className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" /> Get it on Android</button>
          <button type="button" onClick={() => setHelp("ios")} className={btn}><AppleMark className="h-5 w-5 shrink-0 text-ink sm:h-6 sm:w-6" /> Get it on iPhone</button>
          <p className="text-[11px] text-ink-3">{env.playStoreUrl ? "Android: from Google Play. iPhone: installs from this site." : "Installs from this site — nothing to download from a store."}</p>
        </>
      )}
      <BottomSheet open={help !== null} onClose={() => setHelp(null)} title={help === "ios" ? "Add Merta Deal to your iPhone" : "Install Merta Deal on Android"}>
        <ol className="list-decimal space-y-2 pl-5 pt-2 text-sm text-ink-2">
          {help === "ios" ? (
            <>
              <li>Open <b>mertadeal.com</b> in <b>Safari</b>.</li>
              <li>Tap the <Share className="inline h-4 w-4" /> <b>Share</b> button at the bottom.</li>
              <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            </>
          ) : (
            <>
              <li>Open <b>mertadeal.com</b> in <b>Chrome</b>.</li>
              <li>Tap the <MoreVertical className="inline h-4 w-4" /> menu at the top right.</li>
              <li>Choose <b>Install app</b> (or <b>Add to Home screen</b>).</li>
            </>
          )}
        </ol>
        <p className="mt-4 text-xs text-ink-3">It opens full-screen like an app, works offline for browsing, and gets order updates.</p>
      </BottomSheet>
    </div>
  );
}
