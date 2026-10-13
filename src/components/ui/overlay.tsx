"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./button";
import { useHydrated } from "@/hooks/use-hydrated";
import { useBackToClose } from "@/hooks/use-back-to-close";

function useLockBody(open: boolean) {
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
}

function useEscape(open: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

function Portal({ children }: { children: React.ReactNode }) {
  const mounted = useHydrated();
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export interface OverlayProps { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; className?: string; footer?: React.ReactNode; description?: React.ReactNode }

/** Centered dialog on desktop; on phones it becomes a bottom sheet. */
/**
 * Dialog. Phones: bottom sheet, or with size="screen" a full-screen page with a back arrow (app
 * view: location picker, address forms). Tablet/desktop: centred dialog.
 */
export function Modal({ open, onClose, title, children, className, footer, description, size = "md" }: OverlayProps & { size?: "sm" | "md" | "lg" | "screen" }) {
  useLockBody(open); useEscape(open, onClose); useBackToClose(open, onClose);
  if (!open) return null;
  const screen = size === "screen";
  const sizes = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl", screen: "sm:max-w-2xl" };
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <div className="absolute inset-0 bg-ink/50 animate-fade-in" onClick={onClose} />
        <div className={cn("relative flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl bg-card shadow-sheet animate-slide-up sm:rounded-xl sm:animate-pop", screen && "max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none max-sm:bg-surface max-sm:pt-[env(safe-area-inset-top)]", sizes[size], className)}>
          {screen ? null : <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line-2 sm:hidden" />}
          {screen ? (
            <div className="flex shrink-0 items-center gap-2 bg-card px-2 py-2.5 shadow-[0_1px_0_rgb(23_32_28/0.08)] sm:px-5 sm:pt-4 sm:pb-2 sm:shadow-none">
              <button type="button" onClick={onClose} aria-label="Back" className="tap flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-2 sm:hidden"><ChevronLeft className="h-6 w-6" /></button>
              {title ? <h2 className="flex-1 text-lg font-bold text-ink">{title}</h2> : <span className="flex-1" />}
              <IconButton label="Close" onClick={onClose} className="-mr-2 max-sm:hidden"><X className="h-5 w-5" /></IconButton>
            </div>
          ) : (title || description) ? (
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
              <div>
                {title ? <h2 className="text-lg font-bold text-ink">{title}</h2> : null}
                {description ? <p className="mt-0.5 text-sm text-ink-3">{description}</p> : null}
              </div>
              <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1"><X className="h-5 w-5" /></IconButton>
            </div>
          ) : null}
          <div className={cn("overflow-y-auto overscroll-contain px-5 pb-5", screen ? "flex-1 max-sm:px-0 max-sm:pb-0 sm:max-h-[78dvh]" : "max-h-[70dvh]")}>{children}</div>
          {footer ? <div className="border-t border-line bg-surface px-5 py-3 safe-bottom">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/** Slide-in side panel (filters, menus). */
export function Drawer({ open, onClose, title, children, className, footer, side = "right" }: OverlayProps & { side?: "left" | "right" }) {
  useLockBody(open); useEscape(open, onClose); useBackToClose(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-ink/50 animate-fade-in" onClick={onClose} />
        <div className={cn("absolute inset-y-0 flex w-[88%] max-w-sm flex-col bg-card shadow-float", side === "right" ? "right-0 animate-slide-in-right" : "left-0", className)}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-base font-bold text-ink">{title}</h2>
            <IconButton label="Close" onClick={onClose}><X className="h-5 w-5" /></IconButton>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
          {footer ? <div className="border-t border-line px-4 py-3 safe-bottom">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/** Mobile-first bottom sheet (always anchored to the bottom, even on desktop). */
export function BottomSheet({ open, onClose, title, children, className, footer, description }: OverlayProps) {
  useLockBody(open); useEscape(open, onClose); useBackToClose(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-ink/50 animate-fade-in" onClick={onClose} />
        <div className={cn("relative w-full max-w-lg rounded-t-2xl bg-card shadow-sheet animate-slide-up", className)}>
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line-2" />
          {title ? (
            <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-1">
              <div>
                <h2 className="text-lg font-bold text-ink">{title}</h2>
                {description ? <p className="text-sm text-ink-3">{description}</p> : null}
              </div>
              <IconButton label="Close" onClick={onClose} className="-mr-2"><X className="h-5 w-5" /></IconButton>
            </div>
          ) : null}
          <div className="max-h-[75dvh] overflow-y-auto overscroll-contain px-5 pb-4" style={footer ? undefined : { paddingBottom: "calc(1rem + var(--safe-bottom))" }}>{children}</div>
          {footer ? <div className="border-t border-line bg-surface px-5 py-3" style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}>{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", tone = "primary", loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description?: React.ReactNode; confirmLabel?: string; tone?: "primary" | "danger"; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 h-11 rounded-sm border border-line-2 bg-card text-sm font-semibold text-ink">Cancel</button>
        <button type="button" onClick={onConfirm} disabled={loading} className={cn("flex-1 h-11 rounded-sm text-sm font-semibold text-white disabled:opacity-60", tone === "danger" ? "bg-danger" : "bg-brand-600")}>{loading ? "Please wait…" : confirmLabel}</button>
      </div>
    }>
      {description ? <p className="text-sm text-ink-2">{description}</p> : null}
    </Modal>
  );
}
