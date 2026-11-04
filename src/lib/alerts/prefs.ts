"use client";
import { create } from "zustand";
import type { RingtoneKey } from "./ringtone";

/**
 * Per-device alert preferences (mute, ringtone). Kept in localStorage and mirrored across this
 * browser's tabs through the storage event, so muting in one tab mutes the tab that is ringing.
 */
export type AlertPrefs = { muted: boolean; ringtone: RingtoneKey };
const KEY = "md-alert-prefs";
const DEFAULTS: AlertPrefs = { muted: false, ringtone: "classic" };

function read(): AlertPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<AlertPrefs>;
    return { muted: Boolean(v.muted), ringtone: v.ringtone === "chime" || v.ringtone === "urgent" ? v.ringtone : "classic" };
  } catch { return DEFAULTS; }
}
function write(p: AlertPrefs) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ } }

type Store = AlertPrefs & { hydrated: boolean; hydrate: () => void; setMuted: (v: boolean) => void; setRingtone: (v: RingtoneKey) => void };

export const useAlertPrefs = create<Store>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  hydrate: () => { if (!get().hydrated) set({ ...read(), hydrated: true }); },
  setMuted: (muted) => { const p = { muted, ringtone: get().ringtone }; write(p); set(p); },
  setRingtone: (ringtone) => { const p = { muted: get().muted, ringtone }; write(p); set(p); },
}));

let listening = false;
/** Mirrors changes made in other tabs. Safe to call many times. */
export function listenAlertPrefs() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => { if (e.key === KEY) useAlertPrefs.setState({ ...read(), hydrated: true }); });
}
