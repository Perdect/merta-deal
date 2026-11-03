"use client";
import * as React from "react";
import { create } from "zustand";
import { Check, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "info" | "warning" | "error";
export type Toast = { id: number; title: string; description?: string; tone: ToastTone; action?: { label: string; onClick: () => void } };

type ToastStore = { toasts: Toast[]; push: (t: Omit<Toast, "id">) => void; dismiss: (id: number) => void };
let seq = 1;
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  // The same message twice in a row replaces the old one (fresh timer) instead of stacking copies.
  push: (t) => set((s) => {
    const rest = s.toasts.filter((x) => !(x.title === t.title && x.tone === t.tone && x.description === t.description));
    return { toasts: [...rest.slice(-2), { ...t, id: seq++ }] };
  }),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "success" }),
  info: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "info" }),
  warning: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "warning" }),
  error: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "error" }),
  custom: (t: Omit<Toast, "id">) => useToastStore.getState().push(t),
};

const TONE: Record<ToastTone, { icon: React.ReactNode; badge: string; bar: string; label: string }> = {
  success: { icon: <Check className="h-4 w-4" strokeWidth={2.75} />, badge: "bg-success text-white", bar: "bg-success", label: "Success" },
  info: { icon: <Info className="h-4 w-4" strokeWidth={2.5} />, badge: "bg-info text-white", bar: "bg-info", label: "Info" },
  warning: { icon: <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />, badge: "bg-warning text-white", bar: "bg-warning", label: "Warning" },
  error: { icon: <X className="h-4 w-4" strokeWidth={3} />, badge: "bg-danger text-white", bar: "bg-danger", label: "Error" },
};

const EXIT_MS = 180;

/** Top-centre on phones, top-right on larger screens; newest at the bottom of the stack. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-3 sm:items-end sm:px-6" style={{ top: "calc(var(--safe-top) + 12px)" }}>
      {toasts.map((t) => <ToastCard key={t.id} t={t} />)}
    </div>
  );
}

function ToastCard({ t }: { t: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const duration = t.tone === "error" || t.action ? 6000 : 3500;
  const [leaving, setLeaving] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [dragX, setDragX] = React.useState(0);
  const remaining = React.useRef(duration);
  const startedAt = React.useRef(0);
  const drag = React.useRef<{ x: number; id: number } | null>(null);

  const close = React.useCallback(() => { setLeaving(true); setTimeout(() => dismiss(t.id), EXIT_MS); }, [dismiss, t.id]);

  // Auto-close after `duration`, paused while hovered/focused (so a message being read never vanishes).
  React.useEffect(() => {
    if (paused || leaving) return;
    startedAt.current = Date.now();
    const timer = setTimeout(close, remaining.current);
    return () => { clearTimeout(timer); remaining.current -= Date.now() - startedAt.current; };
  }, [paused, leaving, close]);

  const tone = TONE[t.tone];
  const isError = t.tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onPointerDown={(e) => { if (e.pointerType !== "mouse") drag.current = { x: e.clientX, id: e.pointerId }; }}
      onPointerMove={(e) => { if (drag.current?.id === e.pointerId) setDragX(Math.max(0, e.clientX - drag.current.x)); }}
      onPointerUp={() => { if (!drag.current) return; drag.current = null; if (dragX > 80) close(); else setDragX(0); }}
      onPointerCancel={() => { drag.current = null; setDragX(0); }}
      style={{ transform: dragX ? `translateX(${dragX}px)` : undefined, opacity: dragX ? Math.max(0.3, 1 - dragX / 220) : undefined, touchAction: "pan-y" }}
      className={cn(
        "pointer-events-auto relative w-full max-w-[380px] overflow-hidden rounded-2xl bg-card shadow-[0_12px_32px_-12px_rgb(23_32_28/0.28),0_2px_6px_rgb(23_32_28/0.06)] ring-1 ring-black/[0.06]",
        dragX ? "" : "transition-[transform,opacity] duration-200",
        leaving ? "motion-safe:animate-[toast-out_180ms_ease-in_forwards] motion-reduce:opacity-0" : "motion-safe:animate-[toast-in_260ms_cubic-bezier(0.2,0.8,0.2,1)]",
      )}
    >
      <div className="flex items-start gap-3 py-3 pl-3.5 pr-2.5">
        <span className={cn("mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full", tone.badge)} aria-hidden>{tone.icon}</span>
        <div className="min-w-0 flex-1 pt-0.5">
          <span className="sr-only">{tone.label}: </span>
          <p className="text-[14px] font-semibold leading-snug text-ink">{t.title}</p>
          {t.description ? <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{t.description}</p> : null}
          {t.action ? (
            <button type="button" onClick={() => { t.action?.onClick(); close(); }} className="tap mt-2 inline-flex h-9 items-center rounded-lg bg-ink px-3 text-xs font-semibold text-white transition-colors hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
              {t.action.label}
            </button>
          ) : null}
        </div>
        <button type="button" onClick={close} aria-label="Dismiss notification" className="-my-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Time left before it closes (pauses on hover/focus). Not a progress indicator for any task. */}
      <span aria-hidden className={cn("absolute bottom-0 left-0 h-[3px] w-full origin-left opacity-60 motion-reduce:hidden", tone.bar)}
        style={{ animation: `toast-timer ${duration}ms linear forwards`, animationPlayState: paused || leaving ? "paused" : "running" }} />
    </div>
  );
}
