"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Six OTP boxes drawn over one real input, so the keyboard, paste and the phone's
 * "one-time-code" autofill all work as with a plain field while it looks like the familiar boxes.
 */
export function OtpInput({ value, onChange, length = 6, autoFocus, disabled, className }: {
  value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean; disabled?: boolean; className?: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [focused, setFocused] = React.useState(false);
  const active = Math.min(value.length, length - 1);
  return (
    <div className={cn("relative", className)} onClick={() => ref.current?.focus()}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden>
        {Array.from({ length }).map((_, i) => (
          <div key={i} className={cn("flex h-14 items-center justify-center rounded-xl border-2 bg-surface-2 font-display text-2xl font-bold text-ink transition-colors",
            focused && i === active ? "border-brand-600 bg-card" : "border-transparent", value[i] ? "bg-card" : "")}>
            {value[i] ?? ""}
            {focused && i === active && !value[i] ? <span className="h-7 w-0.5 animate-pulse bg-brand-600" /> : null}
          </div>
        ))}
      </div>
      <input ref={ref} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} autoFocus={autoFocus} disabled={disabled}
        type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={length} aria-label={`${length}-digit OTP`}
        className="absolute inset-0 h-full w-full cursor-text opacity-0" />
    </div>
  );
}
