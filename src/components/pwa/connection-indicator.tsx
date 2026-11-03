"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { WifiOff, Wifi, RefreshCw } from "lucide-react";

/**
 * Connection banner. Sits just under the sticky header / app bar (never over it, never over the
 * bottom nav) and tells the customer plainly what the situation is:
 *   - offline: nothing on screen is live any more (prices, stock, order status), checkout needs
 *     a connection;
 *   - back online: the data on screen may be stale, with a Refresh button that re-fetches the
 *     current page (router.refresh keeps typed input; nothing is reloaded on its own).
 *
 * `navigator.onLine` is browser state outside React, so it lives in a tiny external store read
 * through useSyncExternalStore. The "back online" window is part of that store too, which keeps
 * render pure: no setState-in-effect, no Date.now() in render, and the server snapshot is "online"
 * so SSR renders nothing. Only "offline" is trusted as a hard fact; "online" just means the device
 * has a network, so the banner never promises that a request will succeed.
 */
type Snapshot = { online: boolean; justBack: boolean };
const BACK_ONLINE_MS = 8000;

let snapshot: Snapshot = { online: true, justBack: false };
const listeners = new Set<() => void>();
let backTimer: ReturnType<typeof setTimeout> | undefined;

function emit() {
  for (const l of listeners) l();
}

function onConnectivityChange() {
  const online = navigator.onLine;
  if (online === snapshot.online) return;
  if (backTimer) clearTimeout(backTimer);
  if (online) {
    snapshot = { online: true, justBack: true };
    emit();
    backTimer = setTimeout(dismissBack, BACK_ONLINE_MS);
  } else {
    snapshot = { online: false, justBack: false };
    emit();
  }
}

function dismissBack() {
  if (backTimer) clearTimeout(backTimer);
  backTimer = undefined;
  if (!snapshot.justBack) return;
  snapshot = { online: true, justBack: false };
  emit();
}

function subscribe(onChange: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("online", onConnectivityChange);
    window.addEventListener("offline", onConnectivityChange);
  }
  listeners.add(onChange);
  // A page that loads offline should show the banner at once, without a "back online" flash later.
  if (snapshot.online !== navigator.onLine) snapshot = { online: navigator.onLine, justBack: false };
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      window.removeEventListener("online", onConnectivityChange);
      window.removeEventListener("offline", onConnectivityChange);
      if (backTimer) clearTimeout(backTimer);
    }
  };
}

const getSnapshot = () => snapshot;
const serverSnapshot: Snapshot = { online: true, justBack: false };
const getServerSnapshot = () => serverSnapshot;

export function ConnectionIndicator() {
  const { online, justBack } = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const router = useRouter();
  if (online && !justBack) return null;

  const refresh = () => { dismissBack(); router.refresh(); };

  return (
    // --header-h is published by the site header / AppBar; on pages without either the banner
    // sits under the status bar. z-20 keeps it under the header (z-30) and every dialog.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-20 flex justify-center px-3"
      style={{ top: "calc(var(--header-h, var(--safe-top)) + 8px)" }}
    >
      {!online ? (
        <p className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl bg-ink px-3.5 py-2.5 text-[13px] font-medium leading-snug text-white shadow-float animate-slide-up motion-reduce:animate-none">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span><strong className="font-bold">You&rsquo;re offline.</strong> Prices, stock and order status shown may be out of date. Checkout needs a connection.</span>
        </p>
      ) : (
        <div className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-success px-3.5 py-2 text-[13px] font-medium text-white shadow-float animate-slide-up motion-reduce:animate-none">
          <Wifi className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0"><strong className="font-bold">Back online.</strong> Refresh to see the latest prices and order status.</span>
          <button type="button" onClick={refresh} className="tap ml-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs font-bold hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
          </button>
        </div>
      )}
    </div>
  );
}
