"use client";
import * as React from "react";
import { getRinger, type RingtoneKey, type SoundState } from "./ringtone";
import { useAlertPrefs, listenAlertPrefs } from "./prefs";

const LOCK = "md-alert-ringer";
const COURIER_LOCK = "md-alert-courier";

/**
 * The page's ringer plus the rules around it: sound must be unlocked by a tap, the device may be muted,
 * and only one tab per browser plays (a Web Lock elects it) so several open dashboards never ring over
 * each other. `setRinging(true)` means "an alert is live"; the hook decides whether sound actually plays.
 */
export function useRinger() {
  const ringer = getRinger();
  const [sound, setSound] = React.useState<SoundState | "unknown">("unknown");
  const [leader, setLeader] = React.useState(true);
  const [courier, setCourier] = React.useState(true);
  const wanted = React.useRef(false);
  const prefs = useAlertPrefs();
  const hydrate = useAlertPrefs((s) => s.hydrate);

  React.useEffect(() => { hydrate(); listenAlertPrefs(); }, [hydrate]);
  React.useEffect(() => {
    const sync = () => setSound(ringer.state());
    const t = setTimeout(sync, 0);
    return () => { clearTimeout(t); };
  }, [ringer]);
  React.useEffect(() => ringer.subscribe(() => setSound(ringer.state())), [ringer]);

  // Browsers only allow sound after a gesture, and a reload loses it. Any click or key press in the tab
  // counts, so nobody has to find the Enable button again after refreshing.
  React.useEffect(() => {
    const go = () => { if (ringer.state() === "locked") void ringer.unlock().then(() => setSound(ringer.state())); };
    const events = ["pointerdown", "click", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, go, true));
    return () => events.forEach((e) => window.removeEventListener(e, go, true));
  }, [ringer]);

  // One tab per browser asks the server to send pending pushes. This has nothing to do with sound, so it
  // has its own lock: push must still go out when no tab here is able to ring.
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("locks" in navigator)) return;
    let release: (() => void) | null = null; let stopped = false; let retry: ReturnType<typeof setTimeout> | null = null;
    const attempt = () => {
      if (stopped) return;
      void navigator.locks.request(COURIER_LOCK, { ifAvailable: true }, (lock) => {
        if (!lock) { setCourier(false); retry = setTimeout(attempt, 4000); return Promise.resolve(); }
        setCourier(true);
        return new Promise<void>((resolve) => { release = resolve; });
      });
    };
    attempt();
    return () => { stopped = true; if (retry) clearTimeout(retry); release?.(); };
  }, []);

  // Leader election across tabs. Only a tab whose sound is unlocked may lead (a silent leader would
  // mean nobody rings), and the tab in front takes the lock over from one in the background, so the
  // dashboard you are looking at is the one that rings. Without Web Locks every tab rings (older browsers).
  const leaderRef = React.useRef(true);
  const claimRef = React.useRef<(steal: boolean) => void>(() => {});
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("locks" in navigator)) return;
    let release: (() => void) | null = null; let stopped = false; let holding = false; let retry: ReturnType<typeof setTimeout> | null = null;
    const visible = () => typeof document !== "undefined" && document.visibilityState === "visible";
    const setLead = (v: boolean) => { leaderRef.current = v; setLeader(v); };
    const later = (ms: number) => { if (retry) clearTimeout(retry); retry = setTimeout(() => attempt(false), ms); };
    const attempt = (steal: boolean) => {
      if (stopped || holding) return;
      if (ringer.state() !== "ready") { setLead(false); return; }
      holding = true;
      void navigator.locks.request(LOCK, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
        if (!lock) { setLead(false); later(4000); return Promise.resolve(); }
        setLead(true);
        return new Promise<void>((resolve) => { release = resolve; });
      }).catch(() => { /* the lock was taken over by the tab in front (AbortError) */ })
        .finally(() => { holding = false; release = null; if (!stopped) { setLead(false); later(4000); } });
    };
    claimRef.current = (steal) => { if (steal && holding && leaderRef.current) return; if (holding) { release?.(); } attempt(steal); };
    const onVisible = () => { if (visible() && !leaderRef.current) attempt(true); };
    document.addEventListener("visibilitychange", onVisible);
    attempt(visible());
    return () => { stopped = true; document.removeEventListener("visibilitychange", onVisible); if (retry) clearTimeout(retry); release?.(); };
  }, [ringer]);
  // Sound just became available (or went away) in this tab: re-run the election.
  React.useEffect(() => {
    if (sound === "ready" && !leaderRef.current) claimRef.current(typeof document !== "undefined" && document.visibilityState === "visible");
    if (sound === "locked" && leaderRef.current) claimRef.current(false);
  }, [sound]);
  /** Make this tab the one that rings (the chip's "Ring here"). */
  const claim = React.useCallback(() => claimRef.current(true), []);

  // Apply: play only when wanted, unlocked, not muted and this tab is the leader.
  const apply = React.useCallback(() => {
    const { muted, ringtone } = useAlertPrefs.getState();
    if (wanted.current && !muted && leader && ringer.state() === "ready") ringer.start(ringtone); else ringer.stop();
  }, [leader, ringer]);
  React.useEffect(() => { apply(); }, [apply, prefs.muted, prefs.ringtone, sound, leader]);
  React.useEffect(() => () => ringer.stop(), [ringer]);

  const setRinging = React.useCallback((on: boolean) => { wanted.current = on; apply(); }, [apply]);
  const unlock = React.useCallback(async () => { const ok = await ringer.unlock(); setSound(ringer.state()); apply(); return ok; }, [ringer, apply]);
  const test = React.useCallback((key?: RingtoneKey) => ringer.preview(key ?? useAlertPrefs.getState().ringtone), [ringer]);
  const ping = React.useCallback(() => { if (!useAlertPrefs.getState().muted && leader) ringer.ping(); }, [ringer, leader]);

  return { sound, leader, courier, playing: ringer.playing, muted: prefs.muted, ringtone: prefs.ringtone, hydrated: prefs.hydrated,
    setMuted: prefs.setMuted, setRingtone: prefs.setRingtone, setRinging, unlock, test, ping, claim };
}
