"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { realtimeTopic } from "@/lib/realtime-topic";
import { cn } from "@/lib/utils";

export type LiveTable = { table: string; event?: "INSERT" | "UPDATE" | "DELETE" | "*"; filter?: string };
type LiveState = "connecting" | "live" | "offline";

/* Every live subscriber on a page (the list's pill, the shell's badge counter) funnels through one timer, so a
   burst of events, or two subscribers seeing the same event, costs one `router.refresh()` round trip. */
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingFn: (() => void) | null = null;
export function requestLiveRefresh(fn: () => void, delayMs = 500) {
  pendingFn = fn;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { pendingTimer = null; const f = pendingFn; pendingFn = null; f?.(); }, delayMs);
}

/**
 * Keeps the nav badges (active orders, requests, payments, wholesale) and any admin page current when an order
 * is placed or changes, on every admin page, not only the orders list. No pill: the orders page's LiveList is
 * the visible state. Shares the refresh timer above, so on that page the two never refresh twice.
 */
export function LiveCounts() {
  const router = useRouter();
  const dirtyRef = React.useRef(false);
  const refresh = React.useCallback(() => {
    if (document.visibilityState === "hidden") { dirtyRef.current = true; return; }
    dirtyRef.current = false;
    React.startTransition(() => router.refresh());
  }, [router]);
  React.useEffect(() => {
    const supabase = createClient();
    const bump = () => requestLiveRefresh(refresh, 1200);
    let wasDown = false;
    const ch = supabase.channel(realtimeTopic("admin-counts"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, bump)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const o = payload.old as { status?: string } | null; const n = payload.new as { status?: string };
        if (!o?.status || o.status !== n.status) bump(); // a status change moves the counts; other edits do not
      })
      .subscribe((status) => {
        const live = status === "SUBSCRIBED";
        if (live && wasDown) bump();
        if (!live) wasDown = true;
      });
    const onVisible = () => { if (document.visibilityState === "visible" && dirtyRef.current) refresh(); };
    const onOnline = () => bump();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => { supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onOnline); };
  }, [refresh]);
  return null;
}

/**
 * Keeps a server-rendered admin list current without a page reload. One Realtime channel on the given
 * tables; every change re-renders the Server Component tree through `router.refresh()` (debounced, so a
 * burst of events costs one round trip), which keeps the URL filters, pagination and any open quick view
 * exactly as they are and cannot duplicate rows because the server is the only source of rows.
 *
 * When Realtime is not connected the list polls instead, and the first event after a reconnect, a return
 * to the tab or the network coming back always refetches so nothing missed while away is lost. A slow
 * reconcile tick runs even while live. The pill tells the admin which of these is happening.
 */
export function LiveList({ topic, tables, pollMs = 30_000, reconcileMs = 120_000, className }: {
  topic: string; tables: LiveTable[]; /** Poll interval while Realtime is unavailable. */ pollMs?: number; /** Safety refetch while live. */ reconcileMs?: number; className?: string;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<LiveState>("connecting");
  const [pending, start] = React.useTransition();
  const stateRef = React.useRef<LiveState>("connecting");
  const dirtyRef = React.useRef(false);
  const tablesKey = JSON.stringify(tables);

  const refresh = React.useCallback(() => {
    // A hidden tab waits: the refetch happens the moment it is visible again.
    if (document.visibilityState === "hidden") { dirtyRef.current = true; return; }
    dirtyRef.current = false;
    start(() => router.refresh());
  }, [router]);
  const bump = React.useCallback(() => requestLiveRefresh(refresh, 500), [refresh]);

  React.useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(realtimeTopic(topic));
    for (const t of JSON.parse(tablesKey) as LiveTable[]) {
      ch.on("postgres_changes", { event: (t.event ?? "*") as "*", schema: "public", table: t.table, ...(t.filter ? { filter: t.filter } : {}) }, bump);
    }
    let wasDown = false;
    ch.subscribe((status) => {
      const next: LiveState = status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED" ? "offline" : "connecting";
      stateRef.current = next; setState(next);
      if (next === "live" && wasDown) bump(); // reconcile whatever happened while disconnected
      if (next !== "live") wasDown = true;
    });
    const poll = setInterval(() => { if (stateRef.current !== "live") refresh(); }, pollMs);
    const reconcile = setInterval(() => { if (stateRef.current === "live") refresh(); }, reconcileMs);
    const onVisible = () => { if (document.visibilityState === "visible" && (dirtyRef.current || stateRef.current !== "live")) refresh(); };
    const onOnline = () => bump();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      supabase.removeChannel(ch); clearInterval(poll); clearInterval(reconcile);
      document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onOnline);
    };
  }, [topic, tablesKey, bump, refresh, pollMs, reconcileMs]);

  const label = state === "live" ? "Live" : state === "connecting" ? "Connecting…" : `Live updates unavailable · refreshing every ${Math.round(pollMs / 1000)} s`;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", className)} role="status" aria-live="polite">
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1", state === "live" ? "bg-success-50 text-success" : state === "connecting" ? "bg-surface-2 text-ink-3" : "bg-warning-50 text-[#8a6300]")} title={state === "live" ? "New orders and status changes appear here as they happen" : state === "connecting" ? "Connecting to live updates" : "Realtime is not connected; the list is refreshed on a timer instead"}>
        {state === "live" ? <Wifi className="h-3 w-3" aria-hidden /> : <WifiOff className="h-3 w-3" aria-hidden />}{label}
      </span>
      <button type="button" onClick={refresh} disabled={pending} aria-label="Refresh list" title="Refresh now"
        className="tap inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-60">
        <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} aria-hidden />
      </button>
    </span>
  );
}
