"use client";
import * as React from "react";
import { BellRing, Volume2, VolumeX, Smartphone, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Switch } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { useRinger } from "@/lib/alerts/use-ringer";
import { RINGTONES, type RingtoneKey } from "@/lib/alerts/ringtone";
import { usePushSubscription } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

export type PushConfig = { configured: boolean; vapidPublicKey: string };
type Portal = "admin" | "rider";

const BANNER_KEY = "md-alert-banner-dismissed";

/**
 * The honest state of sound and push on this device, with the one tap that unlocks both. Browsers
 * refuse to play audio or to ask for notification permission without a user gesture, so nothing here
 * runs on page load: the staff member taps "Enable order alerts" and reads the result.
 */
export function useAlertSetup(push: PushConfig) {
  const ringer = useRinger();
  const sub = usePushSubscription(push);
  const [busy, setBusy] = React.useState(false);

  const enable = React.useCallback(async () => {
    setBusy(true);
    try {
      const soundOk = await ringer.unlock();
      let pushMsg: string | null = null;
      if (sub.available && !sub.enabled && sub.permission !== "denied") {
        const r = await sub.enable();
        pushMsg = r.ok ? "Push notifications are on for this device." : r.error;
      }
      if (soundOk) toast.success("Order alerts enabled", pushMsg ?? (sub.available ? undefined : "Sound is on. Background push is not set up on this server."));
      else toast.error("Sound is still blocked", "Your browser did not allow audio. Check the site's sound permission, or try a different browser.");
    } finally { setBusy(false); }
  }, [ringer, sub]);

  const test = React.useCallback(async (key?: RingtoneKey) => {
    const ok = await ringer.test(key);
    if (!ok) toast.error("Sound is blocked", "Tap Enable order alerts first.");
  }, [ringer]);

  const soundLabel = ringer.sound === "ready" ? (ringer.muted ? "Muted on this device" : ringer.leader ? "On" : "On · another tab of this browser rings")
    : ringer.sound === "unsupported" ? "Not supported in this browser" : ringer.sound === "locked" ? "Tap Enable to allow sound" : "Checking…";
  const soundTone: "green" | "amber" | "neutral" | "red" = ringer.sound === "ready" ? (ringer.muted ? "amber" : "green") : ringer.sound === "locked" ? "amber" : ringer.sound === "unsupported" ? "red" : "neutral";
  const pushLabel = sub.permission === "unconfigured" ? "Not set up on the server" : sub.permission === "unsupported" ? "Not supported here" : sub.permission === "denied" ? "Blocked in browser settings"
    : sub.enabled ? "On · this device" : sub.permission === null ? "Checking…" : "Off";
  const pushTone: "green" | "amber" | "neutral" | "red" = sub.enabled ? "green" : sub.permission === "denied" ? "red" : sub.permission === "unconfigured" || sub.permission === "unsupported" ? "neutral" : "amber";
  const needsSetup = ringer.sound === "locked" || (sub.available && !sub.enabled && sub.permission !== "denied");

  return { ringer, sub, busy, enable, test, soundLabel, soundTone, pushLabel, pushTone, needsSetup };
}

const pill: Record<"green" | "amber" | "neutral" | "red", string> = {
  green: "bg-success-50 text-success", amber: "bg-[#fff6dc] text-[#8a6300]", neutral: "bg-surface-2 text-ink-3", red: "bg-danger-50 text-danger",
};

/** Full settings block: status rows, the enable button, test, mute and ringtone. */
export function AlertSetup({ portal, push, className }: { portal: Portal; push: PushConfig; className?: string }) {
  const s = useAlertSetup(push);
  const who = portal === "admin" ? "a new order" : "a delivery request";
  return (
    <div className={cn("space-y-4", className)}>
      <dl className="grid gap-2 sm:grid-cols-2">
        <StatusRow icon={<Volume2 className="h-4 w-4" aria-hidden />} label="Sound" value={s.soundLabel} tone={s.soundTone} />
        <StatusRow icon={<Smartphone className="h-4 w-4" aria-hidden />} label="Push notifications" value={s.pushLabel} tone={s.pushTone} />
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={s.enable} loading={s.busy} disabled={s.ringer.sound === "unsupported" && !s.sub.available} className="flex-1 sm:flex-none">
          <BellRing className="h-4 w-4" /> {s.needsSetup ? "Enable order alerts" : "Re-check alerts"}
        </Button>
        <Button size="lg" variant="outline" onClick={() => s.test()} disabled={s.ringer.sound === "unsupported"}><Play className="h-4 w-4" /> Test ringtone</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Ringtone" value={s.ringer.ringtone} onChange={(e) => { s.ringer.setRingtone(e.target.value as RingtoneKey); void s.test(e.target.value as RingtoneKey); }}
          options={(Object.keys(RINGTONES) as RingtoneKey[]).map((k) => ({ value: k, label: `${RINGTONES[k].label} · ${RINGTONES[k].description}` }))} hint="Plays when the ringtone changes" />
        <div className="flex items-end">
          <Switch checked={s.ringer.muted} onChange={(v) => s.ringer.setMuted(v)} label={s.ringer.muted ? "Muted on this device" : "Mute this device"} description="Alerts still show on screen; only the sound stops." />
        </div>
      </div>
      <div className="rounded-lg bg-surface px-3 py-2.5 text-xs text-ink-2">
        <p className="font-semibold text-ink">What rings, and when</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>While this page is open (even in a background tab) the device rings for {who} until it is handled or the ring time runs out.</li>
          <li>When the browser is closed or the phone is locked, a push notification arrives instead and sounds once, as your phone&rsquo;s notification settings allow. {s.sub.permission === "unconfigured" ? "Push is not set up on this server yet, so there is no background alert." : null}</li>
          <li>Continuous ringing with the phone locked is not possible from a website; that needs the native Android app.</li>
          {s.sub.permission === "unsupported" ? <li>On iPhone, add Merta Deal to the Home Screen first; Safari tabs cannot receive push.</li> : null}
          {s.sub.permission === "denied" ? <li>Notifications are blocked for this site. Allow them in the browser&rsquo;s site settings, then tap Enable again.</li> : null}
        </ul>
      </div>
    </div>
  );
}

function StatusRow({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "green" | "amber" | "neutral" | "red" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-card px-3 py-2.5">
      <dt className="flex items-center gap-2 text-sm font-semibold text-ink">{icon}{label}</dt>
      <dd><span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold", pill[tone])}>{value}</span></dd>
    </div>
  );
}

/**
 * Slim bar shown on every page of a portal until alerts are enabled on this device (or dismissed for the
 * session). It exists because the enabling tap has to come from the person, not from page load.
 */
export function AlertBanner({ portal, push, href }: { portal: Portal; push: PushConfig; href: string }) {
  const s = useAlertSetup(push);
  const [dismissed, setDismissed] = React.useState(true);
  React.useEffect(() => {
    let d = false; try { d = sessionStorage.getItem(BANNER_KEY) === "1"; } catch { /* private mode */ }
    const t = setTimeout(() => setDismissed(d), 0);
    return () => clearTimeout(t);
  }, []);
  if (dismissed || !s.needsSetup || s.ringer.sound === "unknown") return null;
  const dismiss = () => { setDismissed(true); try { sessionStorage.setItem(BANNER_KEY, "1"); } catch { /* private mode */ } };
  return (
    <div role="region" aria-label="Order alerts" className="mb-3 flex items-center gap-3 rounded-lg border border-saffron-300 bg-[#fff6dc] px-3 py-2">
      {s.ringer.sound === "locked" ? <VolumeX className="h-5 w-5 shrink-0 text-[#8a6300]" aria-hidden /> : <BellRing className="h-5 w-5 shrink-0 text-[#8a6300]" aria-hidden />}
      <p className="min-w-0 flex-1 text-sm text-ink">
        <span className="font-semibold">{s.ringer.sound === "locked" ? "This device cannot ring yet." : "Background alerts are off on this device."}</span>{" "}
        <span className="text-ink-2">{portal === "admin" ? "Tap Enable so new orders ring here." : "Tap Enable so delivery requests ring here."}</span>{" "}
        <a href={href} className="font-semibold text-brand-700 underline">Settings</a>
      </p>
      <Button size="sm" onClick={s.enable} loading={s.busy}><BellRing className="h-4 w-4" /> Enable</Button>
      <button type="button" onClick={dismiss} aria-label="Dismiss for now" className="tap flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-saffron-100"><X className="h-4 w-4" /></button>
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
