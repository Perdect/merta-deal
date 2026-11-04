"use client";

/**
 * Ringtones synthesised with the Web Audio API: no audio files to download, nothing that can 404, and
 * the same sound on every device. Browsers only let a page make sound after a user gesture, so the
 * `Ringer` is unlocked from a tap (`unlock()`) and reports honestly whether it can play.
 */
export type RingtoneKey = "classic" | "chime" | "urgent";

type Note = { at: number; dur: number; freq: number[]; gain?: number };
type Pattern = { period: number; notes: Note[]; vibrate: number[] };

export const RINGTONES: Record<RingtoneKey, { label: string; description: string }> = {
  classic: { label: "Classic ring", description: "Two short rings, like a phone" },
  chime: { label: "Chime", description: "Three rising notes, softer" },
  urgent: { label: "Urgent", description: "Fast beeps, loudest" },
};

const PATTERNS: Record<RingtoneKey, Pattern> = {
  classic: { period: 2.4, vibrate: [400, 200, 400, 1400], notes: [{ at: 0, dur: 0.42, freq: [440, 480] }, { at: 0.6, dur: 0.42, freq: [440, 480] }] },
  chime: { period: 2.6, vibrate: [200, 100, 200, 100, 200, 1800], notes: [{ at: 0, dur: 0.22, freq: [523.25] }, { at: 0.24, dur: 0.22, freq: [659.25] }, { at: 0.48, dur: 0.5, freq: [783.99], gain: 0.9 }] },
  urgent: { period: 1.6, vibrate: [150, 80, 150, 80, 150, 80, 150, 770], notes: [0, 0.2, 0.4, 0.6].map((t, i) => ({ at: t, dur: 0.14, freq: [i % 2 ? 1046.5 : 830.6] })) },
};

type Ctor = typeof AudioContext;
function audioCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext ?? null;
}

export type SoundState = "unsupported" | "locked" | "ready";

export class Ringer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextAt = 0;
  private key: RingtoneKey = "classic";
  private volume = 1;
  private listeners = new Set<() => void>();
  playing = false;

  static supported() { return audioCtor() !== null; }

  state(): SoundState {
    if (!Ringer.supported()) return "unsupported";
    return this.ctx && this.ctx.state === "running" ? "ready" : "locked";
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach((l) => l()); }

  /** Call from a click/tap. Creates the AudioContext, resumes it and plays a silent buffer (iOS needs that). */
  async unlock(): Promise<boolean> {
    const Ctor = audioCtor();
    if (!Ctor) return false;
    try {
      if (!this.ctx) {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        this.ctx.onstatechange = () => this.emit();
      }
      if (this.ctx.state !== "running") await this.ctx.resume();
      const buf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.ctx.destination); src.start(0);
    } catch { /* blocked: state() stays "locked" */ }
    this.emit();
    return this.state() === "ready";
  }

  setVolume(v: number) { this.volume = Math.min(1, Math.max(0, v)); if (this.master) this.master.gain.value = this.volume; }

  private schedule(key: RingtoneKey, from: number) {
    if (!this.ctx || !this.master) return;
    const p = PATTERNS[key];
    for (const n of p.notes) {
      for (const f of n.freq) {
        const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
        osc.type = key === "chime" ? "sine" : "square"; osc.frequency.value = f;
        const peak = (n.gain ?? 1) * (key === "chime" ? 0.5 : 0.18) / n.freq.length;
        g.gain.setValueAtTime(0.0001, from + n.at);
        g.gain.exponentialRampToValueAtTime(peak, from + n.at + 0.02);
        g.gain.setValueAtTime(peak, from + n.at + n.dur - 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, from + n.at + n.dur);
        osc.connect(g); g.connect(this.master);
        osc.start(from + n.at); osc.stop(from + n.at + n.dur + 0.02);
      }
    }
  }

  /** Repeats the pattern until stop(). A no-op unless unlocked. */
  start(key: RingtoneKey) {
    this.key = key;
    if (this.playing) return;
    if (this.state() !== "ready" || !this.ctx) return;
    this.playing = true;
    this.nextAt = this.ctx.currentTime + 0.05;
    const tick = () => {
      if (!this.playing || !this.ctx) return;
      const p = PATTERNS[this.key];
      // Keep one period scheduled ahead; background tabs throttle timers to ~1/s, which this tolerates.
      while (this.nextAt < this.ctx.currentTime + 1.5) { this.schedule(this.key, this.nextAt); this.nextAt += p.period; }
      try { navigator.vibrate?.(p.vibrate); } catch { /* unsupported */ }
      this.timer = setTimeout(tick, 500);
    };
    tick();
    this.emit();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try { navigator.vibrate?.(0); } catch { /* unsupported */ }
    this.emit();
  }

  /** One period of the pattern, for the "Test ringtone" button. Returns false when sound is not unlocked. */
  async preview(key: RingtoneKey): Promise<boolean> {
    if (this.state() !== "ready" || !this.ctx) { if (!(await this.unlock())) return false; }
    if (!this.ctx) return false;
    this.schedule(key, this.ctx.currentTime + 0.02);
    try { navigator.vibrate?.(PATTERNS[key].vibrate); } catch { /* unsupported */ }
    return true;
  }

  /** A short single ping (secondary alerts such as "no rider available"). */
  ping() {
    if (this.state() !== "ready" || !this.ctx || this.playing) return;
    this.schedule("chime", this.ctx.currentTime + 0.02);
  }
}

let shared: Ringer | null = null;
/** One ringer per page: two components never play over each other. */
export function getRinger(): Ringer { if (!shared) shared = new Ringer(); return shared; }
