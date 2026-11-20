"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Share, WifiOff } from "lucide-react";
import { UpdatePrompt } from "@/components/pwa/update-prompt";
import { toast } from "@/components/ui/toast";
import { requestLiveRefresh } from "./live-list";

/*
 * The admin as an installed app ("MD Admin", manifest /admin.webmanifest): service worker and silent
 * updates, the offline state of the frame, and the Install item of the account menu.
 *
 * Offline rule for the admin: nothing is saved on the device and nothing is queued. While the browser
 * reports no connection the frame says so, the page and any open panel or dialog cannot be acted on,
 * and when the connection returns the server data is fetched again once. `navigator.onLine` is only
 * trusted for "offline": "online" means the device has a network, not that the server will answer, so
 * every action still reports its own failure.
 */

/* ───────────── Service worker + updates ───────────── */

/**
 * Registers the shared service worker (production only, like the shop's PwaClient) and attaches the
 * same silent UpdatePrompt the shop uses. No install sheet here: the admin's install entry is the
 * account menu item below. Rendered by the admin frame and by the admin sign-in page.
 */
export function AdminPwa() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); };
    // The frame often mounts after `load` has fired (client navigation from the sign-in page).
    if (document.readyState === "complete") { register(); return; }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return <UpdatePrompt />;
}

/* ───────────── Offline ───────────── */

function subscribeNetwork(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => { window.removeEventListener("online", onChange); window.removeEventListener("offline", onChange); };
}
const readOnline = () => navigator.onLine;
const serverOnline = () => true;

/** Panels, sheets and dialogs portalled to <body>: the admin SidePanel (`data-admin-layer`) and the design system's Modal / Drawer / BottomSheet / ConfirmDialog. */
const LAYER = '[data-admin-layer], [role="dialog"], [role="alertdialog"]';
/** Marks a portalled layer this hook made inert, so only those are released again (styled in globals.css). */
const BLOCKED = "data-admin-offline-blocked";
/** On <body> while such a layer is open: shows the short notice above it (the header strip is underneath). */
const BODY_FLAG = "data-admin-offline-layer";

/**
 * True while the browser reports no connection. While it is true, every layer portalled out of the
 * frame is made `inert` (the frame itself sets `inert` on <main>), including one opened later; a
 * layer can still be closed with Escape or Back. When the connection returns the layers are released
 * and the server data is refreshed once, through the shared live-refresh timer so the frame's own
 * reconnect refresh and this one are a single round trip. Nothing done offline is kept for later.
 */
export function useAdminOffline(shellRef: React.RefObject<HTMLElement | null>) {
  const router = useRouter();
  const offline = !React.useSyncExternalStore(subscribeNetwork, readOnline, serverOnline);

  const wasOffline = React.useRef(false);
  React.useEffect(() => {
    if (offline) { wasOffline.current = true; return; }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    requestLiveRefresh(() => React.startTransition(() => router.refresh()), 800);
  }, [offline, router]);

  React.useEffect(() => {
    if (!offline) return;
    const blocked = new Set<HTMLElement>();
    const sweep = () => {
      const shell = shellRef.current;
      for (const el of Array.from(document.body.children)) {
        if (!(el instanceof HTMLElement) || blocked.has(el) || el.inert) continue;
        if (shell && el.contains(shell)) continue; // the frame: its <main> is handled by the shell itself
        if (!el.matches(LAYER) && !el.querySelector(LAYER)) continue;
        el.inert = true;
        el.setAttribute(BLOCKED, "");
        blocked.add(el);
      }
      for (const el of blocked) if (!el.isConnected) blocked.delete(el);
      document.body.toggleAttribute(BODY_FLAG, blocked.size > 0);
    };
    sweep();
    const observer = new MutationObserver(sweep);
    observer.observe(document.body, { childList: true });
    return () => {
      observer.disconnect();
      for (const el of blocked) { el.inert = false; el.removeAttribute(BLOCKED); }
      document.body.removeAttribute(BODY_FLAG);
    };
  }, [offline, shellRef]);

  return offline;
}

/**
 * The offline strip under the admin top bar. The status region stays mounted so screen readers
 * announce the words when they appear.
 */
export function AdminOfflineBanner({ offline }: { offline: boolean }) {
  return (
    <div role="status" aria-live="polite">
      {offline ? (
        <p className="flex items-start gap-2.5 border-t border-warning/25 bg-warning-50 px-3 py-2 text-[13px] leading-snug text-ink motion-safe:animate-fade-in sm:px-5">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span><strong className="font-semibold">You&rsquo;re offline.</strong> What is on screen may be out of date and nothing can be saved until the connection is back.</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * A short pill shown only while an inert panel or dialog is open, because that layer covers the strip
 * (on a phone, the whole screen) and would otherwise sit there unresponsive with no reason given.
 * Rendered at the root of the frame, not in the header: the sticky header is its own stacking context
 * and would keep the pill underneath the layer. A visual repeat of the strip, so hidden from screen readers.
 */
export function AdminOfflineLayerNotice({ offline }: { offline: boolean }) {
  if (!offline) return null;
  return (
    <p aria-hidden className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[66] hidden w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold text-white shadow-float [[data-admin-offline-layer]_&]:flex">
      <WifiOff className="h-4 w-4 shrink-0" />You&rsquo;re offline. Nothing can be saved.
    </p>
  );
}

/** Controls of the new-order popup that only change this device: Mute / Unmute (aria-pressed) and the labelled buttons that minimise or reopen it. */
const LOCAL_CONTROL = "button[aria-pressed], button[aria-label]";

/**
 * Wraps the new-order popup. It cannot simply be `inert` offline: its sound keeps ringing for the
 * orders already on screen, so Mute and Minimise have to stay usable. Offline, everything else in it
 * (Accept, the UPI confirmation, links to an order) is stopped before its handler runs and the admin
 * is told why, so no order or payment action is sent and none is kept for later.
 */
export function OfflineLocalOnly({ offline, children }: { offline: boolean; children: React.ReactNode }) {
  const guard = (e: React.SyntheticEvent) => {
    if (!offline || !(e.target instanceof Element)) return;
    if (e.type === "click") {
      const control = e.target.closest("a, button, [role='button']");
      if (!control || control.matches(LOCAL_CONTROL)) return;
    }
    e.preventDefault();
    e.stopPropagation();
    toast.warning("You're offline", "This can be done once the connection is back.");
  };
  return <div className="contents" onClickCapture={guard} onSubmitCapture={guard}>{children}</div>;
}

/* ───────────── Install ───────────── */

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type InstallState = "none" | "prompt" | "ios" | "installed";

/* The browser fires `beforeinstallprompt` once, when it decides the page can be installed, which can be
   before the account menu has mounted (or on the sign-in page, before the frame exists). It is kept
   here, outside React, from the moment this file loads. */
let promptEvent: BIPEvent | null = null;
let installedHere = false;
const installListeners = new Set<() => void>();
const emitInstall = () => { for (const l of installListeners) l(); };
const STANDALONE = "(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)";

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); promptEvent = e as BIPEvent; emitInstall(); });
  window.addEventListener("appinstalled", () => { promptEvent = null; installedHere = true; emitInstall(); });
}

function subscribeInstall(onChange: () => void) {
  installListeners.add(onChange);
  const mq = window.matchMedia(STANDALONE);
  mq.addEventListener("change", onChange);
  return () => { installListeners.delete(onChange); mq.removeEventListener("change", onChange); };
}

function readInstallState(): InstallState {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (installedHere || nav.standalone === true || window.matchMedia(STANDALONE).matches) return "installed";
  if (promptEvent) return "prompt";
  // iPhone / iPad Safari never fires the prompt event; installing there is Share → Add to Home Screen.
  // (iPadOS reports itself as a Mac; a real Mac has no touch points.)
  const ua = nav.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && nav.maxTouchPoints > 1);
  return ios && !/crios|fxios|edgios|opios/i.test(ua) ? "ios" : "none";
}
const serverInstallState = (): InstallState => "none";

async function promptInstall() {
  const e = promptEvent;
  if (!e) return;
  promptEvent = null; // a prompt event can be used once; the browser sends a new one if it is dismissed
  emitInstall();
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === "accepted") { installedHere = true; emitInstall(); }
  } catch { /* the browser refused to show it: nothing to do */ }
}

/**
 * Account-menu entry. "Install admin app" appears only while the browser is really offering the
 * install (it has fired `beforeinstallprompt`) and never once the app runs installed. On iPhone / iPad
 * Safari, which has no such prompt, a one-line hint gives the manual steps instead. Any other case
 * renders nothing.
 */
export function AdminInstallItem({ onDone }: { onDone?: () => void }) {
  const state = React.useSyncExternalStore(subscribeInstall, readInstallState, serverInstallState);
  if (state === "prompt") {
    return (
      <button role="menuitem" type="button" onClick={() => { onDone?.(); void promptInstall(); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2 pointer-coarse:min-h-11">
        <Download className="h-4 w-4" aria-hidden />Install admin app
      </button>
    );
  }
  if (state === "ios") {
    return (
      <p className="flex items-start gap-2.5 px-3 py-2 text-xs leading-snug text-ink-3">
        <Share className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>Install admin app: tap <b className="font-semibold text-ink-2">Share</b>, then <b className="font-semibold text-ink-2">Add to Home Screen</b>.</span>
      </p>
    );
  }
  return null;
}
