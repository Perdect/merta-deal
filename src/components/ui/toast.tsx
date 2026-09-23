"use client";
import * as React from "react";
import { create } from "zustand";
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "info" | "warning" | "error";
export type Toast = { id: number; title: string; description?: string; tone: ToastTone; action?: { label: string; onClick: () => void } };

type ToastStore = { toasts: Toast[]; push: (t: Omit<Toast, "id">) => void; dismiss: (id: number) => void };
let seq = 1;
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.tone === "error" ? 6000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "success" }),
  info: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "info" }),
  warning: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "warning" }),
  error: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "error" }),
  custom: (t: Omit<Toast, "id">) => useToastStore.getState().push(t),
};

const icons: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-success" />,
  info: <Info className="h-5 w-5 text-info" />,
  warning: <AlertTriangle className="h-5 w-5 text-warning" />,
  error: <XCircle className="h-5 w-5 text-danger" />,
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cn("pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-line bg-card px-4 py-3 shadow-float animate-slide-up")}>
          {icons[t.tone]}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{t.title}</p>
            {t.description ? <p className="mt-0.5 text-xs text-ink-3">{t.description}</p> : null}
            {t.action ? <button type="button" onClick={() => { t.action?.onClick(); dismiss(t.id); }} className="mt-1.5 text-xs font-semibold text-brand-600">{t.action.label}</button> : null}
          </div>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-4 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
