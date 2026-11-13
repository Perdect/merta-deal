"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EN, HI, type TKey } from "./rider-i18n-dict";

export type RiderLang = "en" | "hi";
export const RIDER_LANGS: { value: RiderLang; label: string; short: string }[] = [
  { value: "en", label: "English", short: "EN" },
  { value: "hi", label: "हिन्दी", short: "हिं" },
];

type LangState = { lang: RiderLang; chosen: boolean; setLang: (l: RiderLang, chosen?: boolean) => void };

/**
 * The rider app's language. Remembered on this phone (`chosen` = the rider picked it here) and mirrored to the
 * profile's `preferences.language` by the toggle so Account → Settings shows the same choice. Until the rider picks,
 * the profile's preference (passed in by the shell) decides.
 */
export const useRiderLang = create<LangState>()(persist((set) => ({
  lang: "en",
  chosen: false,
  setLang: (lang, chosen = true) => set({ lang, chosen }),
}), { name: "md-rider-lang" }));

/** `t("key")` with `{name}` placeholders; falls back to English when a Hindi line is missing. */
export function translate(lang: RiderLang, key: TKey, vars?: Record<string, string | number>): string {
  let s = (lang === "hi" ? HI[key] : undefined) ?? EN[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function useT() {
  const lang = useRiderLang((s) => s.lang);
  return { lang, t: (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars) };
}
export type { TKey };
