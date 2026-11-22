"use client";
import * as React from "react";
import { BellRing, Volume2, VolumeX, Smartphone, Play, X, ChevronDown, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Switch } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { useRinger } from "@/lib/alerts/use-ringer";
import { RINGTONES, type RingtoneKey } from "@/lib/alerts/ringtone";
import { usePushSubscription } from "@/hooks/use-notifications";
import { savePushSubscriptionAction } from "@/lib/actions/account";
import { sendMyTestPushAction } from "@/lib/actions/alerts";
import { cn } from "@/lib/utils";

export type PushConfig = { configured: boolean; vapidPublicKey: string };
type Portal = "admin" | "rider";

const BANNER_KEY = "md-alert-banner-dismissed";

/**
 * Every word this block shows, in English with the admin's wording. The rider app passes its own
 * `copy` (English and Hindi from the rider dictionary, keys `alertSetup.<key>`), so there is one
 * component and one set of states for both apps.
 */
export const ALERT_COPY = {
  soundLabel: "Sound",
  pushLabel: "Push",
  checking: "Checking…",
  soundOn: "On",
  soundMuted: "Muted",
  soundOtherTab: "Another tab",
  soundUnsupported: "Not supported",
  soundLocked: "Tap Enable",
  pushOn: "On",
  pushOff: "Off",
  pushBlocked: "Blocked",
  pushUnconfigured: "Not set up",
  pushIosInstall: "Add to Home Screen",
  pushUnsupported: "Not supported",
  pushNotSaved: "Not registered",
  helpOn: "This device gets a notification for a new order even when the dashboard is closed. Use Send test push to check it.",
  helpOff: "Tap Enable and allow notifications when the browser asks. Until then nothing reaches this device while the dashboard is closed.",
  helpBlocked: "Notifications are blocked for this site, so nothing can be shown while the dashboard is closed. Allow them in the browser's site settings (the lock icon beside the address, or the phone's Settings → Apps → your browser → Notifications), then tap Enable again.",
  helpUnconfigured: "Push is not set up on the Merta Deal server yet, so no notification can reach this device while the dashboard is closed. Alerts still ring while this page is open.",
  helpIosInstall: "On iPhone and iPad, notifications only work from the Home Screen app (iOS 16.4 or newer). In Safari tap Share, choose Add to Home Screen, open the app from its new icon and tap Enable there.",
  helpUnsupported: "This browser cannot receive push notifications. Use Chrome on Android, or Chrome, Edge or Firefox on a computer. Alerts still ring while this page is open.",
  helpNotSaved: "This device has a push registration that is not saved to your account, so nothing would arrive. Tap Enable to register it again.",
  enable: "Enable order alerts",
  recheck: "Re-check alerts",
  testRingtone: "Test ringtone",
  testPush: "Send test push",
  ringtone: "Ringtone",
  ringtoneHint: "Plays when the ringtone changes",
  muteOn: "Muted on this device",
  muteOff: "Mute this device",
  muteDescription: "Alerts still show on screen; only the sound stops.",
  whatRingsTitle: "What rings, and when",
  whatRingsOpen: "While this page is open (even in a background tab) the device rings for a new order until it is handled or the ring time runs out.",
  whatRingsClosed: "When the browser is closed or the phone is locked, a push notification arrives instead and sounds once, as your phone's notification settings allow.",
  whatRingsLocked: "Continuous ringing with the phone locked is not possible from a website; that needs the native Android app.",
  toastEnabledTitle: "Order alerts enabled",
  toastPushOn: "Push notifications are on for this device.",
  toastSoundOnly: "Sound is on. Push is not available on this device yet; see the note under Push.",
  toastSoundBlockedTitle: "Sound is still blocked",
  toastSoundBlockedBody: "Your browser did not allow audio. Check the site's sound permission, or try a different browser.",
  toastTestBlockedTitle: "Sound is blocked",
  toastTestBlockedBody: "Tap Enable first.",
  toastTestSentTitle: "Test push sent",
  toastTestSentBody: "The push service accepted it for {n} device(s). It should appear within a few seconds; if it does not, check the phone's notification settings for this app.",
  toastTestFailedTitle: "Test push not sent",
  bannerCannotRing: "This device cannot ring yet.",
  bannerBackgroundOff: "Background alerts are off on this device.",
  bannerTap: "Tap Enable so new orders ring here.",
  bannerSettings: "Settings",
  bannerEnable: "Enable",
  bannerDismiss: "Dismiss for now",
} as const;
export type AlertCopyKey = keyof typeof ALERT_COPY;
export type AlertCopy = Partial<Record<AlertCopyKey, string>>;
export const ALERT_COPY_KEYS = Object.keys(ALERT_COPY) as AlertCopyKey[];

/**
 * What push can really do on this device right now:
 * on · off (can be enabled) · blocked (permission refused) · unconfigured (server has no keys) ·
 * ios_install (iPhone/iPad in a browser tab: needs the Home Screen app first) · unsupported (no Push API) ·
 * not_saved (the browser has a registration the server does not hold for this account) · checking.
 */
export type PushState = "checking" | "on" | "off" | "blocked" | "unconfigured" | "ios_install" | "unsupported" | "not_saved";

const subscribeNoop = () => () => {};
/** "ios:tab", "ios:app", "other:tab", "other:app". iPadOS reports itself as a Mac, so touch points decide. */
function readDevice() {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iphone|ipad|ipod/i.test(nav.userAgent) || (/macintosh/i.test(nav.userAgent) && nav.maxTouchPoints > 1);
  const app = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  return `${ios ? "ios" : "other"}:${app ? "app" : "tab"}`;
}

/**
 * The honest state of sound and push on this device, with the one tap that unlocks both. Browsers
 * refuse to play audio or to ask for notification permission without a user gesture, so nothing here
 * runs on page load: the staff member taps Enable and reads the result.
 */
export function useAlertSetup(push: PushConfig, copy?: AlertCopy, portal: Portal = "admin") {
  const c = React.useCallback((key: AlertCopyKey, vars?: Record<string, string | number>) => {
    let s: string = copy?.[key] ?? ALERT_COPY[key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }, [copy]);
  const ringer = useRinger();
  const sub = usePushSubscription(push);
  const device = React.useSyncExternalStore<string | null>(subscribeNoop, readDevice, () => null);
  const [busy, setBusy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  /** null = not checked yet. A browser subscription only counts once the server holds it for this account. */
  const [saved, setSaved] = React.useState<boolean | null>(null);

  // The subscription may predate this sign-in, or the server may have dropped it: store it again (an upsert)
  // and believe "On" only when that succeeded.
  React.useEffect(() => {
    if (!sub.available || !sub.enabled || sub.permission !== "granted") return;
    let cancelled = false;
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const json = (await reg?.pushManager.getSubscription())?.toJSON();
      if (!json?.endpoint || !json.keys?.p256dh || !json.keys?.auth) { if (!cancelled) setSaved(false); return; }
      const r = await savePushSubscriptionAction({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }, navigator.userAgent);
      if (!cancelled) setSaved(r.ok);
    })().catch(() => { if (!cancelled) setSaved(false); });
    return () => { cancelled = true; };
  }, [sub.available, sub.enabled, sub.permission]);

  const pushState: PushState = sub.permission === "unconfigured" ? "unconfigured"
    : sub.supported === null || device === null ? "checking"
    : sub.supported === false ? (device === "ios:tab" ? "ios_install" : "unsupported")
    : sub.permission === "denied" ? "blocked"
    : sub.permission === null ? "checking"
    : sub.enabled ? (saved === false ? "not_saved" : saved === null ? "checking" : "on")
    : "off";
  const canEnablePush = pushState === "off" || pushState === "not_saved";

  const enable = React.useCallback(async () => {
    setBusy(true);
    try {
      const soundOk = await ringer.unlock();
      let pushMsg: string | null = null; let pushFailed = false;
      if (canEnablePush) {
        if (pushState === "not_saved") {
          // Start from a clean registration: the old one could not be stored for this account.
          try { const reg = await navigator.serviceWorker.getRegistration(); await (await reg?.pushManager.getSubscription())?.unsubscribe(); } catch { /* nothing to remove */ }
        }
        const r = await sub.enable();
        if (r.ok) { setSaved(true); pushMsg = c("toastPushOn"); } else { pushFailed = true; pushMsg = r.error; }
      }
      if (soundOk) toast[pushFailed ? "warning" : "success"](c("toastEnabledTitle"), pushMsg ?? (pushState === "on" ? c("toastPushOn") : c("toastSoundOnly")));
      else toast.error(c("toastSoundBlockedTitle"), [c("toastSoundBlockedBody"), pushMsg].filter(Boolean).join(" "));
    } finally { setBusy(false); }
  }, [ringer, sub, canEnablePush, pushState, c]);

  const test = React.useCallback(async (key?: RingtoneKey) => {
    const ok = await ringer.test(key);
    if (!ok) toast.error(c("toastTestBlockedTitle"), c("toastTestBlockedBody"));
  }, [ringer, c]);

  /** A real push to this account's own devices; the toast repeats what the push service answered. */
  const testPush = React.useCallback(async () => {
    setTesting(true);
    try {
      const r = await sendMyTestPushAction(portal);
      if (r.ok) toast.success(c("toastTestSentTitle"), c("toastTestSentBody", { n: r.data.devices }));
      else toast.error(c("toastTestFailedTitle"), r.error);
    } catch { toast.error(c("toastTestFailedTitle")); }
    finally { setTesting(false); }
  }, [portal, c]);

  // One short phrase per state: the line under the rows carries the explanation.
  const soundLabel = ringer.sound === "ready" ? (ringer.muted ? c("soundMuted") : ringer.leader ? c("soundOn") : c("soundOtherTab"))
    : ringer.sound === "unsupported" ? c("soundUnsupported") : ringer.sound === "locked" ? c("soundLocked") : c("checking");
  const soundTone: Tone = ringer.sound === "ready" ? (ringer.muted ? "amber" : "green") : ringer.sound === "locked" ? "amber" : ringer.sound === "unsupported" ? "red" : "neutral";
  const pushLabel = c(PUSH_LABEL[pushState]);
  const pushTone: Tone = pushState === "on" ? "green" : pushState === "blocked" ? "red" : pushState === "off" || pushState === "not_saved" || pushState === "ios_install" ? "amber" : "neutral";
  const pushHelp = pushState === "checking" ? null : c(PUSH_HELP[pushState]);
  const needsSetup = ringer.sound === "locked" || canEnablePush;

  return { ringer, sub, busy, testing, enable, test, testPush, soundLabel, soundTone, pushLabel, pushTone, pushState, pushHelp, needsSetup, c };
}

type Tone = "green" | "amber" | "neutral" | "red";
const PUSH_LABEL: Record<PushState, AlertCopyKey> = { checking: "checking", on: "pushOn", off: "pushOff", blocked: "pushBlocked", unconfigured: "pushUnconfigured", ios_install: "pushIosInstall", unsupported: "pushUnsupported", not_saved: "pushNotSaved" };
const PUSH_HELP: Record<Exclude<PushState, "checking">, AlertCopyKey> = { on: "helpOn", off: "helpOff", blocked: "helpBlocked", unconfigured: "helpUnconfigured", ios_install: "helpIosInstall", unsupported: "helpUnsupported", not_saved: "helpNotSaved" };

const pill: Record<Tone, string> = {
  green: "bg-success-50 text-success", amber: "bg-warning-50 text-warning", neutral: "bg-surface-2 text-ink-3", red: "bg-danger-50 text-danger",
};

/** Full settings block: status rows, why push is in the state it is in, the enable button, the two tests, mute and ringtone. */
export function AlertSetup({ portal, push, className, compact, moreLabel = "Ringtone, mute and details", copy }: { portal: Portal; push: PushConfig; className?: string; /** Rider profile: status + Enable up front, the ringtone, mute and explanation behind one "more" toggle. */ compact?: boolean; moreLabel?: string; /** Translated wording (rider app). */ copy?: AlertCopy }) {
  const s = useAlertSetup(push, copy, portal);
  const { c } = s;
  const Wrap = compact ? "details" : "div";
  return (
    <div className={cn("space-y-4", className)}>
      <dl className="grid gap-2 sm:grid-cols-2">
        <StatusRow icon={<Volume2 className="h-4 w-4" aria-hidden />} label={c("soundLabel")} value={s.soundLabel} tone={s.soundTone} />
        <StatusRow icon={<Smartphone className="h-4 w-4" aria-hidden />} label={c("pushLabel")} value={s.pushLabel} tone={s.pushTone} />
      </dl>
      {s.pushHelp ? <p role="status" className={cn("rounded-lg px-3 py-2 text-xs", s.pushState === "on" ? "bg-success-50 text-ink-2" : s.pushState === "blocked" ? "bg-danger-50 text-ink" : "bg-warning-50 text-ink")}>{s.pushHelp}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={s.enable} loading={s.busy} disabled={s.ringer.sound === "unsupported" && !s.sub.available} className={cn("flex-1 sm:flex-none", compact && "h-12 rounded-xl")}>
          <BellRing className="h-4 w-4" /> {s.needsSetup ? c("enable") : c("recheck")}
        </Button>
        <Button size="lg" variant="outline" onClick={() => s.test()} disabled={s.ringer.sound === "unsupported"} className={cn(compact && "h-12 rounded-xl")}><Play className="h-4 w-4" /> {c("testRingtone")}</Button>
        {s.pushState === "on" ? <Button size="lg" variant="outline" onClick={s.testPush} loading={s.testing} className={cn(compact && "h-12 rounded-xl")}><Send className="h-4 w-4" /> {c("testPush")}</Button> : null}
      </div>
      <Wrap className={cn(compact && "group space-y-4 rounded-xl bg-surface-2 px-3.5 py-2.5")}>
      {compact ? <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600"><span>{moreLabel}</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden /></summary> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label={c("ringtone")} value={s.ringer.ringtone} onChange={(e) => { s.ringer.setRingtone(e.target.value as RingtoneKey); void s.test(e.target.value as RingtoneKey); }}
          options={(Object.keys(RINGTONES) as RingtoneKey[]).map((k) => ({ value: k, label: `${RINGTONES[k].label} · ${RINGTONES[k].description}` }))} hint={c("ringtoneHint")} />
        <div className="flex items-end">
          <Switch checked={s.ringer.muted} onChange={(v) => s.ringer.setMuted(v)} label={s.ringer.muted ? c("muteOn") : c("muteOff")} description={c("muteDescription")} />
        </div>
      </div>
      <div className={cn("rounded-lg px-3 py-2.5 text-xs text-ink-2", compact ? "bg-card" : "bg-surface")}>
        <p className="font-semibold text-ink">{c("whatRingsTitle")}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>{c("whatRingsOpen")}</li>
          <li>{c("whatRingsClosed")}</li>
          <li>{c("whatRingsLocked")}</li>
        </ul>
      </div>
      </Wrap>
    </div>
  );
}

function StatusRow({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-card px-3 py-2.5">
      <dt className="flex items-center gap-2 text-sm font-semibold text-ink">{icon}{label}</dt>
      <dd><span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold", pill[tone])}>{value}</span></dd>
    </div>
  );
}

/**
 * Slim bar shown on every page of a portal until alerts are enabled on this device (or dismissed for the
 * session). It exists because the enabling tap has to come from the person, not from page load. It only
 * shows while a tap here can change something: a blocked, unsupported or not-yet-installed device is
 * explained on the settings screen instead, where there is room to say what to do.
 */
export function AlertBanner({ portal, push, href, copy }: { portal: Portal; push: PushConfig; href: string; copy?: AlertCopy }) {
  const s = useAlertSetup(push, copy, portal);
  const { c } = s;
  const [dismissed, setDismissed] = React.useState(true);
  React.useEffect(() => {
    let d = false; try { d = sessionStorage.getItem(BANNER_KEY) === "1"; } catch { /* private mode */ }
    const t = setTimeout(() => setDismissed(d), 0);
    return () => clearTimeout(t);
  }, []);
  if (dismissed || !s.needsSetup || s.ringer.sound === "unknown") return null;
  const dismiss = () => { setDismissed(true); try { sessionStorage.setItem(BANNER_KEY, "1"); } catch { /* private mode */ } };
  return (
    <div role="region" aria-label={c("enable")} className="mb-3 flex items-center gap-3 rounded-lg border border-saffron-300 bg-warning-50 px-3 py-2">
      {s.ringer.sound === "locked" ? <VolumeX className="h-5 w-5 shrink-0 text-warning" aria-hidden /> : <BellRing className="h-5 w-5 shrink-0 text-warning" aria-hidden />}
      <p className="min-w-0 flex-1 text-sm text-ink">
        <span className="font-semibold">{s.ringer.sound === "locked" ? c("bannerCannotRing") : c("bannerBackgroundOff")}</span>{" "}
        <span className="text-ink-2">{copy?.bannerTap ?? (portal === "admin" ? ALERT_COPY.bannerTap : "Tap Enable so delivery requests ring here.")}</span>{" "}
        <a href={href} className="font-semibold text-brand-700 underline">{c("bannerSettings")}</a>
      </p>
      <Button size="sm" onClick={s.enable} loading={s.busy}><BellRing className="h-4 w-4" /> {c("bannerEnable")}</Button>
      <button type="button" onClick={dismiss} aria-label={c("bannerDismiss")} className="tap flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-saffron-100"><X className="h-4 w-4" /></button>
    </div>
  );
}

/** Small inline chip used inside alert popups. */
export function SoundChip({ sound, leader, muted, onClaim }: { sound: ReturnType<typeof useRinger>["sound"]; leader: boolean; muted: boolean; onClaim?: () => void }) {
  if (sound === "ready" && leader && !muted) return <Badge tone="success" size="sm"><Volume2 className="mr-1 h-3 w-3" aria-hidden />Ringing</Badge>;
  if (sound === "ready" && muted) return <Badge tone="warning" size="sm"><VolumeX className="mr-1 h-3 w-3" aria-hidden />Muted</Badge>;
  if (sound === "ready" && !leader) return onClaim
    ? <button type="button" onClick={onClaim} className="tap inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2 hover:bg-brand-50 hover:text-brand-700" title="Another tab of this browser is ringing. Tap to ring here instead."><Volume2 className="h-3 w-3" aria-hidden />Ring here</button>
    : <Badge tone="neutral" size="sm">Ringing in another tab</Badge>;
  if (sound === "unsupported") return <Badge tone="neutral" size="sm">No sound support</Badge>;
  return <Badge tone="warning" size="sm"><VolumeX className="mr-1 h-3 w-3" aria-hidden />Sound off</Badge>;
}
