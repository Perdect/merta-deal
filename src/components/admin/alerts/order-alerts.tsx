"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, MapPin, VolumeX, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { realtimeTopic } from "@/lib/realtime-topic";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { useNow } from "@/components/rider/use-now";
import { useRinger } from "@/lib/alerts/use-ringer";
import { shouldRing, type AlertFeed, type AlertOrder } from "@/lib/alerts/types";
import { getOrderAlertsAction, acceptOrderAction, deliverPendingPushAction } from "@/lib/actions/alerts";
import { PAYMENT_METHOD_LABEL } from "@/lib/order-status";
import type { Notification } from "@/types/app";
import type { Tables } from "@/types/database";
import { SoundChip, type PushConfig } from "@/components/alerts/alert-setup";
import { cn, formatINR } from "@/lib/utils";

const SNOOZE_KEY = "md-order-alert-snoozed";
const CHANNEL = "md-order-alerts";

function readSnoozed(): Set<string> { try { return new Set(JSON.parse(sessionStorage.getItem(SNOOZE_KEY) ?? "[]") as string[]); } catch { return new Set(); } }
function writeSnoozed(s: Set<string>) { try { sessionStorage.setItem(SNOOZE_KEY, JSON.stringify([...s])); } catch { /* private mode */ } }

/**
 * Incoming-order alerts for the admin dashboard. The server feed (admin_order_alerts) is the single
 * truth: it is re-read on every Realtime change to orders, on a timer, and whenever the tab comes back,
 * so retries, reconnects and several tabs all converge on the same list and nothing rings twice for one
 * order. Ringing follows the configured policy; accepting, cancelling or the ring timeout stops it.
 * Muting only silences; it never accepts or hides the order.
 */
export function OrderAlerts({ userId, push }: { userId: string; push: PushConfig }) {
  const router = useRouter();
  const ringer = useRinger();
  const { setRinging, ping, courier } = ringer;
  const now = useNow();
  const [feed, setFeed] = React.useState<AlertFeed | null>(null);
  const [offset, setOffset] = React.useState(0);
  const [snoozed, setSnoozed] = React.useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const feedRef = React.useRef<AlertFeed | null>(null);
  const seenRef = React.useRef<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    try {
      const r = await getOrderAlertsAction();
      if (!r.ok) { setLoadError(r.error); return; }
      setLoadError(null);
      setOffset(new Date(r.data.now).getTime() - Date.now());
      feedRef.current = r.data;
      setFeed(r.data);
      // Orders that arrived since the last read re-open the popup even if it was collapsed.
      const fresh = r.data.orders.filter((o) => !seenRef.current.has(o.id));
      fresh.forEach((o) => seenRef.current.add(o.id));
      if (fresh.length) setCollapsed(false);
    } catch { setLoadError("No connection. Retrying…"); }
  }, []);

  // Snooze state is per browser session and shared with every tab (the ringing tab may be another one).
  React.useEffect(() => {
    const t = setTimeout(() => setSnoozed(readSnoozed()), 0);
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
    if (bc) bc.onmessage = (e: MessageEvent<{ type: string; id?: string }>) => { if (e.data?.type === "snooze") setSnoozed(readSnoozed()); if (e.data?.type === "reload") void load(); };
    return () => { clearTimeout(t); bc?.close(); };
  }, [load]);

  // Initial read, slow poll (Realtime is the fast path), and a re-read when the tab or network returns.
  React.useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);
    return () => { clearTimeout(first); clearInterval(id); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", load); };
  }, [load]);

  // Realtime: any order change re-reads the feed; an acceptance by someone else is announced.
  React.useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | null = null; let flush: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => { void load(); }, 400); };
    const pushNow = () => {
      if (!push.configured || !courier) return;
      if (flush) clearTimeout(flush);
      flush = setTimeout(() => { void deliverPendingPushAction(); }, 1500);
    };
    const ch = supabase.channel(realtimeTopic("admin-alerts"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => { bump(); pushNow(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const n = payload.new as Tables<"orders">;
        const pending = feedRef.current?.orders.find((o) => o.id === n.id);
        if (pending && n.accepted_by && n.accepted_by !== userId) toast.info(`Order ${n.order_number} accepted by ${n.accepted_by_name ?? "another admin"}`);
        else if (pending && ["cancelled", "rejected"].includes(n.status)) toast.warning(`Order ${n.order_number} was ${n.status}`);
        bump();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as Notification;
        if (n.type === "new_order") { bump(); pushNow(); return; }
        if (["dispatch_no_rider", "order_unattended", "rider_arrived", "exception_expired", "exception_resolved", "refund_due", "delivery_failed", "order_cancelled"].includes(n.type)) {
          ping();
          const orderId = (n.data as { order_id?: string } | null)?.order_id;
          toast.custom({ title: n.title, description: n.body, tone: "warning", action: orderId ? { label: "Open", onClick: () => router.push(`/admin/orders/${orderId}`) } : undefined });
        }
        if (n.type === "delivery_offer") pushNow();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); if (t) clearTimeout(t); if (flush) clearTimeout(flush); };
  }, [load, userId, push.configured, courier, ping, router]);

  // Ring while any unaccepted, unsnoozed order is inside its ring or reminder window.
  // `now` is 0 until the shared clock's first tick (and on the server): nothing rings until then.
  const serverNow = now ? now + offset : 0;
  const orders = feed?.orders ?? [];
  const live = feed && serverNow ? orders.some((o) => !snoozed.has(o.id) && shouldRing(o, feed, serverNow)) : false;
  React.useEffect(() => { setRinging(live); }, [live, setRinging]);
  React.useEffect(() => () => setRinging(false), [setRinging]);

  // Tab title shows the count so a background tab is noticed.
  const count = orders.length;
  React.useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = count ? `(${count}) ${base}` : base;
    return () => { document.title = base; };
  }, [count]);

  const snooze = (id: string) => {
    const next = new Set(snoozed); if (next.has(id)) next.delete(id); else next.add(id);
    writeSnoozed(next); setSnoozed(next);
    try { new BroadcastChannel(CHANNEL).postMessage({ type: "snooze", id }); } catch { /* unsupported */ }
  };

  const accept = async (o: AlertOrder) => {
    if (busy) return;
    setBusy(o.id);
    try {
      const r = await acceptOrderAction(o.id);
      if (!r.ok) { toast.error("Could not accept", r.error); await load(); return; }
      if (r.data.already) toast.info(`Order ${o.order_number} was already accepted by ${r.data.accepted_by_name ?? "another admin"}`);
      else toast.success(`Order ${o.order_number} accepted`, "Pack it, then tap Packed to call a rider.");
      const next = { ...(feedRef.current ?? { now: new Date().toISOString(), ring_seconds: 0, reminder_seconds: 0, orders: [] }), orders: orders.filter((x) => x.id !== o.id) };
      feedRef.current = next; setFeed(next);
      try { new BroadcastChannel(CHANNEL).postMessage({ type: "reload" }); } catch { /* unsupported */ }
      router.refresh();
    } catch { toast.error("Could not accept", "Check your connection and try again."); }
    finally { setBusy(null); }
  };

  if (!count) return null;
  const i = Math.min(index, count - 1);
  const o = orders[i]!;
  const ageSec = serverNow ? Math.max(0, Math.round((serverNow - new Date(o.created_at).getTime()) / 1000)) : 0;
  const ringingThis = !snoozed.has(o.id) && feed && serverNow ? shouldRing(o, feed, serverNow) : false;

  return <OrderAlertView collapsed={collapsed} setCollapsed={setCollapsed} count={count} live={live} o={o} i={i} ageSec={ageSec} ringingThis={ringingThis}
    ringer={ringer} snoozed={snoozed} loadError={loadError} busy={busy} accept={accept} snooze={snooze} setIndex={setIndex} />;
}

export type OrderAlertViewProps = {
  collapsed: boolean; setCollapsed: (v: boolean) => void; count: number; live: boolean; o: AlertOrder; i: number; ageSec: number; ringingThis: boolean;
  ringer: { sound: ReturnType<typeof useRinger>["sound"]; leader: boolean; muted: boolean; unlock: () => Promise<boolean>; claim: () => void };
  snoozed: Set<string>; loadError: string | null; busy: string | null; accept: (o: AlertOrder) => void | Promise<void>; snooze: (id: string) => void; setIndex: React.Dispatch<React.SetStateAction<number>>;
};

/** The popup itself, free of data fetching so it can be rendered with fixture data. */
export function OrderAlertView(p: OrderAlertViewProps) {
  const { collapsed, setCollapsed, count, live, o, i, ageSec, ringingThis, ringer, snoozed, loadError, busy, accept, snooze, setIndex } = p;
  if (collapsed) {
    return (
      <button type="button" onClick={() => setCollapsed(false)} aria-label={`${count} unaccepted ${count === 1 ? "order" : "orders"}, open`}
        className="fixed bottom-4 right-4 z-[65] flex h-12 items-center gap-2 rounded-full bg-brand-600 pl-3 pr-4 text-sm font-bold text-white shadow-float animate-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
        <span className="relative flex h-6 w-6 items-center justify-center"><span className={cn("absolute inset-0 rounded-full bg-white/30", live && "animate-ping")} /><BellRing className="relative h-4 w-4" aria-hidden /></span>
        {count} {count === 1 ? "order" : "orders"} waiting
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-labelledby="order-alert-title" aria-describedby="order-alert-body" className="fixed inset-x-3 bottom-3 z-[65] mx-auto max-w-md sm:inset-x-auto sm:right-6 sm:w-[400px]" style={{ bottom: "calc(var(--safe-bottom) + 12px)" }}>
      <div className={cn("rounded-2xl border-2 bg-card shadow-float animate-slide-up", ringingThis ? "border-brand-500" : "border-line-2")}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            {ringingThis ? <span className="absolute inset-0 rounded-full bg-brand-200 animate-ping" aria-hidden /> : null}
            <BellRing className="relative h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p id="order-alert-title" className="text-sm font-bold text-ink">{o.status === "placed" ? "New order · needs acceptance" : "New order"}</p>
            <p className="text-[11px] text-ink-3">{count > 1 ? `${i + 1} of ${count} waiting` : "1 waiting"} · {ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)} min ago`}</p>
          </div>
          <SoundChip sound={ringer.sound} leader={ringer.leader} muted={ringer.muted || snoozed.has(o.id)} onClaim={ringer.claim} />
          <button type="button" onClick={() => setCollapsed(true)} aria-label="Minimise" className="tap flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2"><ChevronDown className="h-4 w-4" /></button>
        </div>
        <div id="order-alert-body" className="px-4 py-3">
          <p className="font-display text-2xl font-extrabold tabular text-ink">{o.order_number}</p>
          <p className="mt-0.5 text-sm text-ink-2">{o.item_count} {o.item_count === 1 ? "item" : "items"} · <span className="font-bold text-ink">{formatINR(o.total, { precise: true })}</span> · {PAYMENT_METHOD_LABEL[o.payment_method]}{o.delivery_type === "express" ? " · Express" : o.delivery_type === "scheduled" ? " · Scheduled" : ""}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-2"><MapPin className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />{[o.area, o.city].filter(Boolean).join(", ") || "Delivery area not set"}</p>
          {ringer.sound === "locked" ? <button type="button" onClick={() => void ringer.unlock()} className="mt-2 flex w-full items-center gap-2 rounded-lg bg-[#fff6dc] px-3 py-2 text-left text-xs font-semibold text-[#8a6300]"><Volume2 className="h-4 w-4" aria-hidden />Sound is blocked on this device. Tap here to turn it on.</button> : null}
          {loadError ? <p className="mt-2 text-xs text-danger">{loadError}</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 pb-3">
          <Button size="lg" loading={busy === o.id} disabled={busy !== null} onClick={() => accept(o)} className="col-span-2"><Check className="h-4 w-4" /> Accept order</Button>
          <Button size="md" variant="outline" href={`/admin/orders/${o.id}`} onClick={() => setCollapsed(true)}><ExternalLink className="h-4 w-4" /> View order</Button>
          <Button size="md" variant="outline" onClick={() => snooze(o.id)} aria-pressed={snoozed.has(o.id)}>{snoozed.has(o.id) ? <><Volume2 className="h-4 w-4" /> Unmute</> : <><VolumeX className="h-4 w-4" /> Mute sound</>}</Button>
        </div>
        {count > 1 ? (
          <div className="flex items-center justify-between border-t border-line px-2 py-1.5">
            <button type="button" onClick={() => setIndex((x) => (x - 1 + count) % count)} className="tap flex h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-ink-2 hover:bg-surface-2"><ChevronLeft className="h-4 w-4" /> Previous</button>
            <Link href="/admin/orders?status=confirmed" className="text-xs font-semibold text-brand-700 underline" onClick={() => setCollapsed(true)}>All waiting orders</Link>
            <button type="button" onClick={() => setIndex((x) => (x + 1) % count)} className="tap flex h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-ink-2 hover:bg-surface-2">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
