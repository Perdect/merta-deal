"use client";
import * as React from "react";
import { Share, Check, MoreVertical } from "lucide-react";
import { BottomSheet } from "@/components/ui/overlay";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

/** Platform marks (drawn inline; lucide ships no brand icons). */
function PlayMark({ className }: { className?: string }) {
  // Google Play four-colour triangle — only shown when the Play Store listing is live.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M4 2.5v19L13 12z" fill="#00B4FF" />
      <path d="M4 2.5 13 12l3.6-3.5z" fill="#00D467" />
      <path d="M4 21.5l12.6-6L13 12z" fill="#FF3A44" />
      <path d="M16.6 8.5 21 11a1.2 1.2 0 0 1 0 2l-4.4 2.5L13 12z" fill="#FFC700" />
    </svg>
  );
}
function AndroidMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#3DDC84" d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22a11.4 11.4 0 0 0-9.84 0L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
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

/** Black two-line app badge (store-badge look). */
function Badge({ onClick, mark, top, name }: { onClick: () => void; mark: React.ReactNode; top: string; name: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${top} ${name}`}
      className="flex h-12 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-[#a6a6a6] bg-black px-2.5 text-left text-white transition-opacity hover:opacity-85 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:h-14 sm:gap-2.5 sm:px-3">
      {mark}
      <span className="min-w-0 leading-none">
        <span className="block whitespace-nowrap text-[9px] font-medium uppercase tracking-wide sm:text-[10px]">{top}</span>
        <span className="mt-0.5 block whitespace-nowrap text-[15px] font-semibold tracking-tight min-[380px]:text-base sm:text-lg">{name}</span>
      </span>
    </button>
  );
}

/**
 * "Get the app" badges. Merta Deal ships as an installable web app, so these do the real thing:
 * Android → Google Play once NEXT_PUBLIC_PLAY_STORE_URL is set (badge then reads "Get it on Google
 * Play"), otherwise the browser's install prompt; iPhone → the Add to Home Screen steps. There is
 * no App Store listing, so the iPhone badge never claims one.
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

  return (
    <div className={cn("space-y-3", className)}>
      {installed ? (
        <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-50 px-4 py-3 text-sm font-semibold text-brand-800"><Check className="h-4 w-4" /> Installed on this device</p>
      ) : (
        <>
          {env.playStoreUrl
            ? <Badge onClick={android} mark={<PlayMark className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />} top="Get it on" name="Google Play" />
            : <Badge onClick={android} mark={<AndroidMark className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />} top="Install on" name="Android" />}
          <Badge onClick={() => setHelp("ios")} mark={<AppleMark className="h-6 w-6 shrink-0 text-white sm:h-7 sm:w-7" />} top="Install on" name="iPhone" />
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
