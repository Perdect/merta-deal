"use client";
import * as React from "react";
import { getRinger, type RingtoneKey, type SoundState } from "./ringtone";
import { useAlertPrefs, listenAlertPrefs } from "./prefs";

const LOCK = "md-alert-ringer";

/**
 * The page's ringer plus the rules around it: sound must be unlocked by a tap, the device may be muted,
 * and only one tab per browser plays (a Web Lock elects it) so several open dashboards never ring over
 * each other. `setRinging(true)` means "an alert is live"; the hook decides whether sound actually plays.
 */
export function useRinger() {
  const ringer = getRinger();
  const [sound, setSound] = React.useState<SoundState | "unknown">("unknown");
  const [leader, setLeader] = React.useState(true);
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

  // Leader election across tabs. Without Web Locks every tab is a leader (older browsers).
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("locks" in navigator)) return;
    let release: (() => void) | null = null; let stopped = false; let retry: ReturnType<typeof setTimeout> | null = null;
    const attempt = () => {
      if (stopped) return;
      void navigator.locks.request(LOCK, { ifAvailable: true }, (lock) => {
        if (!lock) { setLeader(false); retry = setTimeout(attempt, 4000); return Promise.resolve(); }
        setLeader(true);
        return new Promise<void>((resolve) => { release = resolve; });
      });
    };
    attempt();
    return () => { stopped = true; if (retry) clearTimeout(retry); release?.(); };
  }, []);

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

  return { sound, leader, playing: ringer.playing, muted: prefs.muted, ringtone: prefs.ringtone, hydrated: prefs.hydrated,
    setMuted: prefs.setMuted, setRingtone: prefs.setRingtone, setRinging, unlock, test, ping };
}
