"use client";
import * as React from "react";

/**
 * Thin hook over the browser Web Speech API (Chrome, Edge, Android Chrome, recent Safari).
 * lib.dom does not ship the SpeechRecognition constructor types, so a minimal shape is declared here.
 * Firefox has no implementation; the hook reports `supported: false` and the UI says so honestly.
 */
type RecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEventLike = { resultIndex: number; results: ArrayLike<RecognitionResultLike> };
type RecognitionErrorLike = { error: string; message?: string };
type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onstart: (() => void) | null; onend: (() => void) | null; onresult: ((e: RecognitionEventLike) => void) | null; onerror: ((e: RecognitionErrorLike) => void) | null;
};
type RecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const subscribeNoop = () => () => {};
const getSupportedSnapshot = () => Boolean(getCtor()) && (window.isSecureContext ?? true);
const getServerSnapshot = (): boolean | null => null;

export const SPEECH_LANGS = ["hi-IN", "en-IN"] as const;
export type SpeechLang = (typeof SPEECH_LANGS)[number];

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Microphone permission denied. Browser settings mein mic allow kijiye.",
  "service-not-allowed": "Speech service is blocked in this browser.",
  "audio-capture": "No microphone found.",
  "no-speech": "Kuch sunai nahi diya — mic ke paas bol kar dobara try kijiye.",
  network: "Speech recognition needs internet (Chrome sends audio to Google). Check your connection.",
  aborted: "",
  "language-not-supported": "Hindi speech is not supported here; trying English (India).",
};

export function useSpeechInput(opts: { onFinal?: (text: string) => void } = {}) {
  // null while server-rendering / hydrating, then the real feature check (hydration-safe via useSyncExternalStore).
  const supported = React.useSyncExternalStore(subscribeNoop, getSupportedSnapshot, getServerSnapshot);
  const [listening, setListening] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const [finalText, setFinalText] = React.useState("");
  const [lang, setLang] = React.useState<SpeechLang>("hi-IN");
  const [error, setError] = React.useState<string | null>(null);
  const recRef = React.useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = React.useRef(opts.onFinal);
  React.useEffect(() => { onFinalRef.current = opts.onFinal; }, [opts.onFinal]);

  const stop = React.useCallback(() => { try { recRef.current?.stop(); } catch { /* already stopped */ } }, []);

  const start = React.useCallback(function startRecognition(useLang: SpeechLang = lang) {
    const Ctor = getCtor();
    if (!Ctor) { setError("Speech recognition is not available in this browser."); return false; }
    stop();
    const rec = new Ctor();
    rec.lang = useLang; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1;
    let collected = "";
    rec.onstart = () => { setListening(true); setError(null); setInterim(""); setLang(useLang); };
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) collected += r[0].transcript; else interimText += r[0].transcript;
      }
      setInterim(interimText);
      if (collected) setFinalText(collected.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "language-not-supported" && useLang === "hi-IN") { setError(ERROR_TEXT[e.error]); setTimeout(() => startRecognition("en-IN"), 50); return; }
      const msg = ERROR_TEXT[e.error] ?? `Speech error: ${e.error}`;
      if (msg) setError(msg);
    };
    rec.onend = () => {
      setListening(false); setInterim("");
      const text = collected.trim();
      if (text) onFinalRef.current?.(text);
      recRef.current = null;
    };
    recRef.current = rec;
    try { rec.start(); return true; } catch (err) { setError(err instanceof Error ? err.message : "Could not start the microphone."); setListening(false); return false; }
  }, [lang, stop]);

  React.useEffect(() => () => { try { recRef.current?.abort(); } catch { /* noop */ } }, []);

  return { supported, listening, interim, finalText, lang, error, start, stop, reset: () => { setFinalText(""); setInterim(""); setError(null); } };
}
