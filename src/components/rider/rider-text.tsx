"use client";
import { useT, type TKey } from "@/lib/rider-i18n";
import { cn } from "@/lib/utils";

/** A translated line for server-rendered rider pages (page titles, panel headings). */
export function RiderText({ k, as: Tag = "span", className, vars }: { k: TKey; as?: "h1" | "h2" | "p" | "span"; className?: string; vars?: Record<string, string | number> }) {
  const { t } = useT();
  return <Tag className={cn(Tag === "h1" && "mb-3 px-1 font-display text-[22px] font-extrabold text-ink", className)}>{t(k, vars)}</Tag>;
}
