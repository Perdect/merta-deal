import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "brand" | "saffron" | "success" | "warning" | "danger" | "info" | "dark";
const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  brand: "bg-brand-50 text-brand-700",
  saffron: "bg-saffron-100 text-saffron-700",
  success: "bg-success-50 text-success",
  warning: "bg-warning-50 text-[#8a6300]",
  danger: "bg-danger-50 text-danger",
  info: "bg-info-50 text-info",
  dark: "bg-ink text-white",
};

export function Badge({ tone = "neutral", className, children, size = "sm", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; size?: "xs" | "sm" | "md" }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full font-semibold leading-none", size === "xs" ? "px-1.5 py-1 text-[10px]" : size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs", tones[tone], className)} {...props}>
      {children}
    </span>
  );
}

export function DiscountBadge({ pct, className }: { pct: number; className?: string }) {
  if (!pct || pct <= 0) return null;
  return <span className={cn("inline-flex items-center rounded-xs bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white", className)}>{pct}% OFF</span>;
}

export function VegMark({ veg = true, className }: { veg?: boolean; className?: string }) {
  return (
    <span aria-label={veg ? "Vegetarian" : "Non-vegetarian"} className={cn("inline-flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border", veg ? "border-success" : "border-danger", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", veg ? "bg-success" : "bg-danger")} />
    </span>
  );
}
