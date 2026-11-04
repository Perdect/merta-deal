"use client";
import * as React from "react";
import { CloudOff, RefreshCw, X } from "lucide-react";
import type { PendingItem } from "@/lib/scan/use-pending-queue";
import { cn } from "@/lib/utils";

/** A request key: the server applies a change once per key, so retries and double taps are harmless. */
export function newKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16); (c ?? { getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } }).getRandomValues(b); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A server action threw before the server answered (offline, DNS, timeout): the change is unknown, not failed. */
export const isNetworkFailure = (e: unknown) => e instanceof TypeError || /fetch|network|offline|Failed to connect/i.test(String((e as Error)?.message ?? e));

/**
 * Changes waiting for the server. Shown while anything is queued so nobody mistakes a pending change
 * for a saved one; each item can be retried or, once the server has refused it, dismissed.
 */
export function PendingBanner({ items, online, flushing, onRetry, onDismiss, className }: { items: PendingItem[]; online: boolean; flushing: boolean; onRetry: () => void; onDismiss: (id: string) => void; className?: string }) {
  if (!items.length && online) return null;
  const failed = items.filter((i) => i.error);
  const waiting = items.length - failed.length;
  return (
    <div role="status" aria-live="polite" className={cn("rounded-xl border border-saffron-300 bg-saffron-50 p-3 text-sm text-ink", className)}>
      <div className="flex items-center gap-2">
        <CloudOff className="h-5 w-5 shrink-0 text-saffron-700" aria-hidden />
        <p className="min-w-0 flex-1 font-semibold">
          {!online ? "You're offline." : null} {waiting ? `${waiting} change${waiting === 1 ? "" : "s"} pending — not saved yet.` : failed.length ? "Some changes were refused." : "Changes send as soon as you're back online."}
        </p>
        {online && waiting ? <button type="button" onClick={onRetry} disabled={flushing} className="tap inline-flex h-9 items-center gap-1 rounded-lg bg-card px-2.5 text-xs font-bold text-ink-2 ring-1 ring-line-2"><RefreshCw className={cn("h-3.5 w-3.5", flushing && "motion-safe:animate-spin")} aria-hidden />{flushing ? "Sending" : "Send now"}</button> : null}
      </div>
      {items.length ? (
        <ul className="mt-2 space-y-1">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 rounded-lg bg-card/70 px-2.5 py-1.5 text-xs">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", i.error ? "bg-danger" : "bg-saffron-500 motion-safe:animate-pulse")} aria-hidden />
              <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{i.label}</span>{i.error ? <span className="text-danger"> · {i.error}</span> : <span className="text-ink-3"> · pending</span>}</span>
              {i.error ? <button type="button" onClick={() => onDismiss(i.id)} aria-label={`Dismiss ${i.label}`} className="tap flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2"><X className="h-4 w-4" /></button> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function BigButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={cn("tap flex min-h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50", className)} />;
}
