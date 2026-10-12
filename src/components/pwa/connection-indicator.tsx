"use client";
import * as React from "react";
import { WifiOff, Wifi } from "lucide-react";

/**
 * Slim connection banner. Shows while the browser reports no network and, briefly,
 * when it comes back. Checkout and payment need a connection — the offline copy
 * says so rather than implying an order could still be placed.
 *
 * `navigator.onLine` is browser state outside React, so it lives in a tiny external
 * store read through useSyncExternalStore. The "back online" window is part of that
 * store too, which keeps render pure: no setState-in-effect, no Date.now() in render,
 * and the server snapshot is "online" so SSR renders nothing.
 */
type Snapshot = { online: boolean; justBack: boolean };
const BACK_ONLINE_MS = 3000;

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
    backTimer = setTimeout(() => {
      snapshot = { online: true, justBack: false };
      emit();
    }, BACK_ONLINE_MS);
  } else {
    snapshot = { online: false, justBack: false };
    emit();
  }
}

function subscribe(onChange: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("online", onConnectivityChange);
    window.addEventListener("offline", onConnectivityChange);
  }
  listeners.add(onChange);
  // A page that loads offline should show the pill at once, without a "back online" flash later.
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
  if (online && !justBack) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3"
      style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}
    >
      {!online ? (
        <p className="flex items-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-white shadow-float animate-slide-up">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          You&rsquo;re offline — browsing saved pages. Checkout needs a connection.
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-full bg-success px-3.5 py-1.5 text-xs font-semibold text-white shadow-float animate-slide-up">
          <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Back online
        </p>
      )}
    </div>
  );
}
