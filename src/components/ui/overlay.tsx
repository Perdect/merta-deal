"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./button";
import { useHydrated } from "@/hooks/use-hydrated";
import { useBackToClose } from "@/hooks/use-back-to-close";

/* ------------------------------------------------------------------ scroll lock
 * iOS Safari ignores `overflow: hidden` on <body>: the page behind a sheet still rubber-bands and
 * scrolls. The reliable lock is to pin <body> with `position: fixed` and pull it up by the current
 * scroll offset so nothing visibly moves; on release the offset is scrolled back to (instantly, so
 * the `scroll-behavior: smooth` on <html> doesn't animate it).
 *
 * The lock is reference-counted: nested overlays (a confirm dialog over a sheet over the cart)
 * share one lock, and the page is only un-pinned when the last one closes. The styles live on a
 * class (`md-scroll-lock`, see globals.css) rather than inline `overflow`, so components that still
 * set `body.style.overflow` themselves can't fight with it or leave it stuck.
 */
let lockCount = 0;
let lockedY = 0;
let lockedHref = "";

function acquireScrollLock() {
  if (lockCount++ > 0) return;
  lockedY = window.scrollY;
  lockedHref = location.pathname + location.search;
  document.body.style.top = `-${lockedY}px`;
  document.documentElement.classList.add("md-scroll-lock");
}

function releaseScrollLock() {
  if (lockCount === 0) return;
  if (--lockCount > 0) return;
  document.documentElement.classList.remove("md-scroll-lock");
  document.body.style.top = "";
  // A link tapped inside the overlay may have navigated: the new page is already at the top and
  // must not be dragged back to the old page's offset.
  if (location.pathname + location.search === lockedHref) window.scrollTo({ top: lockedY, left: 0, behavior: "instant" as ScrollBehavior });
}

/** Pins the page behind an overlay while `open` (works on iOS; nested overlays share one lock). */
export function useScrollLock(open: boolean) {
  React.useEffect(() => {
    if (!open) return;
    acquireScrollLock();
    return releaseScrollLock;
  }, [open]);
}

/* ---------------------------------------------------------------- dialog a11y */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const focusables = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);

/** Open dialogs, bottom-most first. Only the top one reacts to Escape and owns the Tab cycle. */
const dialogStack: HTMLElement[] = [];
const isTop = (el: HTMLElement) => dialogStack[dialogStack.length - 1] === el;

/**
 * Everything a dialog needs besides its markup: scroll lock, Back-closes-it, Escape (top-most dialog
 * only), a Tab focus trap, initial focus (first control, or the panel itself; an `autoFocus` field
 * already focused is left alone) and focus restoration to the element that opened it.
 * Attach the returned ref to the dialog panel (the element with role="dialog").
 */
export function useDialog(open: boolean, onClose: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  React.useEffect(() => { closeRef.current = onClose; });
  // The panel is portalled only after hydration; a dialog that is open on first render (e.g. from
  // `?pick=1`) has no element yet, so re-run once the portal exists.
  const hydrated = useHydrated();
  useScrollLock(open && hydrated);
  useBackToClose(open, onClose);

  React.useEffect(() => {
    if (!open || !hydrated) return;
    const el = ref.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogStack.push(el);

    const raf = requestAnimationFrame(() => {
      if (el.contains(document.activeElement)) return;
      (focusables(el)[0] ?? el).focus({ preventScroll: true });
    });

    const onKey = (e: KeyboardEvent) => {
      if (!isTop(el)) return;
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const list = focusables(el);
      if (!list.length) { e.preventDefault(); el.focus(); return; }
      const first = list[0], last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !el.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !el.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      const i = dialogStack.lastIndexOf(el);
      if (i >= 0) dialogStack.splice(i, 1);
      // Give focus back to whatever opened the dialog (a button in the page, or in the dialog
      // underneath), unless the page moved on (link inside the dialog) and it no longer exists.
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, hydrated]);

  return ref;
}

function Portal({ children }: { children: React.ReactNode }) {
  const mounted = useHydrated();
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export interface OverlayProps { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; className?: string; footer?: React.ReactNode; description?: React.ReactNode }

/**
 * Dialog. Phones: bottom sheet, or with size="screen" a full-screen page with a back arrow (app
 * view: location picker, address forms). Tablet/desktop: centred dialog.
 */
export function Modal({ open, onClose, title, children, className, footer, description, size = "md" }: OverlayProps & { size?: "sm" | "md" | "lg" | "screen" }) {
  const ref = useDialog(open, onClose);
  const id = React.useId();
  if (!open) return null;
  const screen = size === "screen";
  const sizes = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl", screen: "sm:max-w-2xl" };
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
        <div className="absolute inset-0 bg-ink/50 animate-fade-in motion-reduce:animate-none" onClick={onClose} aria-hidden="true" />
        <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby={title ? `${id}-t` : undefined} aria-describedby={description ? `${id}-d` : undefined}
          className={cn("relative flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl bg-card shadow-sheet outline-none animate-slide-up sm:rounded-xl sm:animate-pop motion-reduce:animate-none", screen && "max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none max-sm:bg-surface max-sm:pt-[env(safe-area-inset-top)]", sizes[size], className)}>
          {screen ? null : <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line-2 sm:hidden" aria-hidden="true" />}
          {screen ? (
            <div className="flex shrink-0 items-center gap-2 bg-card px-2 py-2.5 shadow-[0_1px_0_rgb(23_32_28/0.08)] sm:px-5 sm:pt-4 sm:pb-2 sm:shadow-none">
              <button type="button" onClick={onClose} aria-label="Back" className="tap flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600 sm:hidden"><ChevronLeft className="h-6 w-6" aria-hidden /></button>
              {title ? <h2 id={`${id}-t`} className="flex-1 text-lg font-bold text-ink">{title}</h2> : <span className="flex-1" />}
              <IconButton label="Close" onClick={onClose} className="-mr-2 max-sm:hidden"><X className="h-5 w-5" /></IconButton>
            </div>
          ) : (title || description) ? (
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
              <div>
                {title ? <h2 id={`${id}-t`} className="text-lg font-bold text-ink">{title}</h2> : null}
                {description ? <p id={`${id}-d`} className="mt-0.5 text-sm text-ink-3">{description}</p> : null}
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
  const ref = useDialog(open, onClose);
  const id = React.useId();
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[60]">
        <div className="absolute inset-0 bg-ink/50 animate-fade-in motion-reduce:animate-none" onClick={onClose} aria-hidden="true" />
        <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby={title ? `${id}-t` : undefined}
          className={cn("absolute inset-y-0 flex w-[88%] max-w-sm flex-col bg-card shadow-float outline-none motion-reduce:animate-none", side === "right" ? "right-0 animate-slide-in-right" : "left-0 animate-slide-in-left", className)}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 id={`${id}-t`} className="text-base font-bold text-ink">{title}</h2>
            <IconButton label="Close" onClick={onClose}><X className="h-5 w-5" /></IconButton>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer ? <div className="border-t border-line px-4 py-3 safe-bottom">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/** Mobile-first bottom sheet (always anchored to the bottom, even on desktop). */
export function BottomSheet({ open, onClose, title, children, className, footer, description }: OverlayProps) {
  const ref = useDialog(open, onClose);
  const id = React.useId();
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center">
        <div className="absolute inset-0 bg-ink/50 animate-fade-in motion-reduce:animate-none" onClick={onClose} aria-hidden="true" />
        <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby={title ? `${id}-t` : undefined} aria-describedby={description ? `${id}-d` : undefined}
          className={cn("relative w-full max-w-lg rounded-t-2xl bg-card shadow-sheet outline-none animate-slide-up motion-reduce:animate-none", className)}>
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line-2" aria-hidden="true" />
          {title ? (
            <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-1">
              <div>
                <h2 id={`${id}-t`} className="text-lg font-bold text-ink">{title}</h2>
                {description ? <p id={`${id}-d`} className="text-sm text-ink-3">{description}</p> : null}
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
        <button type="button" onClick={onClose} disabled={loading} className="flex-1 h-11 rounded-sm border border-line-2 bg-card text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60">Cancel</button>
        <button type="button" onClick={onConfirm} disabled={loading} aria-busy={loading || undefined} className={cn("flex-1 h-11 rounded-sm text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60", tone === "danger" ? "bg-danger" : "bg-brand-600")}>{loading ? "Please wait…" : confirmLabel}</button>
      </div>
    }>
      {description ? <p className="text-sm text-ink-2">{description}</p> : null}
    </Modal>
  );
}
