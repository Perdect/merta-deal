"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { BellRing, MapPin, Package, Route, Store as StoreIcon, Timer, Banknote, VolumeX, Volume2, ChevronDown } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { getRiderAssignmentsAction, respondAssignmentAction } from "@/lib/actions/rider";
import { deliverPendingPushAction } from "@/lib/actions/alerts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { useRinger } from "@/lib/alerts/use-ringer";
import { SoundChip, type PushConfig } from "@/components/alerts/alert-setup";
import { useRiderStore } from "./rider-store";
import { useNow } from "./use-now";
import { customerOf, formatKm, mmss } from "./rider-utils";
import { cn, formatINR } from "@/lib/utils";

const SNOOZE_KEY = "md-offer-alert-snoozed";
function readSnoozed(): Set<string> { try { return new Set(JSON.parse(sessionStorage.getItem(SNOOZE_KEY) ?? "[]") as string[]); } catch { return new Set(); } }
function writeSnoozed(s: Set<string>) { try { sessionStorage.setItem(SNOOZE_KEY, JSON.stringify([...s])); } catch { /* private mode */ } }

/**
 * Ringing delivery-request popup for the rider app. Offers come from the server (rider_assignments,
 * which also expires stale ones), re-read on every Realtime change to this rider's assignments, on a
 * timer and when the app returns to the foreground. Ringing stops when the offer is accepted, declined,
 * expired, withdrawn by an admin assignment, or the order is cancelled, because each of those removes
 * it from the server list. Mute only silences.
 */
export function OfferAlert({ push }: { push: PushConfig }) {
  const router = useRouter();
  const ringer = useRinger();
  const { setRinging, courier } = ringer;
  const now = useNow();
  const version = useRiderStore((s) => s.assignmentsVersion);
  const bump = useRiderStore((s) => s.bumpAssignments);
  const riderStatus = useRiderStore((s) => s.rider?.status);
  const [offers, setOffers] = React.useState<RiderAssignment[]>([]);
  const [snoozed, setSnoozed] = React.useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = React.useState(false);
  const [busy, setBusy] = React.useState<"accept" | "reject" | null>(null);
  const [confirmReject, setConfirmReject] = React.useState(false);
  const seenRef = React.useRef<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    try {
      const r = await getRiderAssignmentsAction(["offered"]);
      if (!r.ok) return;
      setOffers(r.data);
      const fresh = r.data.filter((o) => !seenRef.current.has(o.id));
      fresh.forEach((o) => seenRef.current.add(o.id));
      if (fresh.length) { setCollapsed(false); if (push.configured && courier) void deliverPendingPushAction(); }
    } catch { /* offline: the next bump or poll retries */ }
  }, [push.configured, courier]);

  React.useEffect(() => { const t = setTimeout(() => setSnoozed(readSnoozed()), 0); return () => clearTimeout(t); }, []);
  React.useEffect(() => {
    if (riderStatus && riderStatus !== "active") return;
    const first = setTimeout(load, 0);
    const id = setInterval(load, 20_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);
    return () => { clearTimeout(first); clearInterval(id); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", load); };
  }, [load, riderStatus]);
  // The shell bumps `assignmentsVersion` on every Realtime change to this rider's assignments.
  const firstRef = React.useRef(true);
  React.useEffect(() => { if (firstRef.current) { firstRef.current = false; return; } void load(); }, [version, load]);

  // `now` is 0 until the shared clock's first tick: no offer counts as live (or expired) before that.
  const live = now ? offers.filter((o) => now < new Date(o.expires_at).getTime()) : [];
  const ringing = live.some((o) => !snoozed.has(o.id));
  React.useEffect(() => { setRinging(ringing); }, [ringing, setRinging]);
  React.useEffect(() => () => setRinging(false), [setRinging]);
  // An offer that ran out on the clock is re-read so the server records the expiry and re-offers.
  const expiredCount = now ? offers.length - live.length : 0;
  React.useEffect(() => { if (expiredCount > 0) { const t = setTimeout(load, 800); return () => clearTimeout(t); } }, [expiredCount, load]);

  const snooze = (id: string) => { const next = new Set(snoozed); if (next.has(id)) next.delete(id); else next.add(id); writeSnoozed(next); setSnoozed(next); };

  const respond = async (offer: RiderAssignment, accept: boolean) => {
    if (busy) return;
    setBusy(accept ? "accept" : "reject");
    try {
      const r = await respondAssignmentAction(offer.id, accept);
      setConfirmReject(false);
      if (!r.ok) { toast.error(r.error); await load(); return; }
      if (accept) toast.success("Delivery accepted", `Head to ${offer.pickup.name} for pickup.`); else toast.info("Request declined", "It is being offered to another rider.");
      setOffers((cur) => cur.filter((x) => x.id !== offer.id));
      bump(); router.refresh();
    } catch { toast.error("Could not send your answer", "Check your connection and try again."); }
    finally { setBusy(null); }
  };

  if (!live.length) return null;
  const o = live[0]!;
  const msLeft = now ? new Date(o.expires_at).getTime() - now : 0;
  const urgent = msLeft > 0 && msLeft < 30_000;
  const customer = customerOf(o);
  const cod = o.order.payment_method === "cod" && Number(o.cod_amount) > 0;
  const earns = Number(o.earning) > 0;
  const km = o.distance_km != null && Number(o.distance_km) > 0;
  const muted = snoozed.has(o.id);

  return <OfferAlertView collapsed={collapsed} setCollapsed={setCollapsed} live={live} o={o} now={now} msLeft={msLeft} urgent={urgent} customerArea={customer.area} cod={cod} earns={earns} km={km} muted={muted} ringing={ringing}
    ringer={ringer} busy={busy} respond={respond} confirmReject={confirmReject} setConfirmReject={setConfirmReject} snooze={snooze} />;
}

export type OfferAlertViewProps = {
  collapsed: boolean; setCollapsed: (v: boolean) => void; live: RiderAssignment[]; o: RiderAssignment; now: number; msLeft: number; urgent: boolean; customerArea: string;
  cod: boolean; earns: boolean; km: boolean; muted: boolean; ringing: boolean;
  ringer: { sound: ReturnType<typeof useRinger>["sound"]; leader: boolean; muted: boolean; unlock: () => Promise<boolean>; claim: () => void };
  busy: "accept" | "reject" | null; respond: (o: RiderAssignment, accept: boolean) => void | Promise<void>; confirmReject: boolean; setConfirmReject: (v: boolean) => void; snooze: (id: string) => void;
};

/** The popup itself, free of data fetching so it can be rendered with fixture data. */
export function OfferAlertView(p: OfferAlertViewProps) {
  const { collapsed, setCollapsed, live, o, now, msLeft, urgent, customerArea, cod, earns, km, muted, ringing, ringer, busy, respond, confirmReject, setConfirmReject, snooze } = p;
  const customer = { area: customerArea };
  if (collapsed) {
    return (
      <button type="button" onClick={() => setCollapsed(false)} aria-label="Open delivery request"
        className="fixed right-4 z-[65] flex h-12 items-center gap-2 rounded-full bg-brand-600 pl-3 pr-4 text-sm font-bold text-white shadow-float animate-pop" style={{ bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 18px)" }}>
        <span className="relative flex h-6 w-6 items-center justify-center"><span className={cn("absolute inset-0 rounded-full bg-white/30", ringing && "animate-ping")} /><BellRing className="relative h-4 w-4" aria-hidden /></span>
        Request · {now ? mmss(msLeft) : "--:--"}
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-labelledby="offer-alert-title" className="fixed inset-0 z-[65] flex items-end justify-center bg-ink/50 p-3 sm:items-center">
      <div className={cn("w-full max-w-md rounded-2xl border-2 bg-card shadow-float animate-slide-up", urgent ? "border-danger" : "border-brand-500")} style={{ marginBottom: "var(--safe-bottom)" }}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            {ringing && !muted ? <span className="absolute inset-0 rounded-full bg-brand-200 animate-ping" aria-hidden /> : null}
            <BellRing className="relative h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p id="offer-alert-title" className="text-sm font-bold text-ink">New delivery request</p>
            <p className="text-[11px] text-ink-3">{live.length > 1 ? `${live.length} waiting · ` : ""}Order {o.order.order_number}</p>
          </div>
          <span className={cn("inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-sm font-bold tabular", urgent ? "bg-danger-50 text-danger" : "bg-saffron-100 text-saffron-700")} aria-live="polite" aria-label={now ? `Expires in ${mmss(msLeft)}` : "Expires soon"}>
            <Timer className="h-4 w-4" aria-hidden />{now ? mmss(msLeft) : "--:--"}
          </span>
          <button type="button" onClick={() => setCollapsed(true)} aria-label="Minimise" className="tap flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2"><ChevronDown className="h-4 w-4" /></button>
        </div>

        <div className="space-y-2.5 px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-ink-2"><StoreIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden /><span>Pick up at <span className="font-bold text-ink">{o.pickup.name}</span>{o.pickup.area ? <span className="text-ink-3"> · {o.pickup.area}</span> : null}</span></p>
          <p className="flex items-start gap-2 text-sm text-ink-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden /><span>Deliver to <span className="font-bold text-ink">{customer.area || "the customer's area"}</span></span></p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-brand-50 px-2 py-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">You earn</dt><dd className="text-lg font-extrabold tabular text-brand-800">{earns ? formatINR(o.earning) : "—"}</dd></div>
            <div className="rounded-md bg-surface-2 px-2 py-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3"><Route className="mr-0.5 inline h-3 w-3" aria-hidden />Distance</dt><dd className={cn("font-extrabold tabular text-ink", km ? "text-lg" : "text-xs leading-7")}>{km ? formatKm(o.distance_km) : "No map pin"}</dd></div>
            <div className="rounded-md bg-surface-2 px-2 py-2"><dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3"><Package className="mr-0.5 inline h-3 w-3" aria-hidden />Items</dt><dd className="text-lg font-extrabold tabular text-ink">{o.order.item_count}</dd></div>
          </dl>
          <p className="flex items-center gap-2 text-sm">
            <Banknote className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
            {cod ? <span className="text-ink-2">Collect <Badge tone="saffron" size="sm">{formatINR(o.cod_amount)} cash</Badge></span> : <span className="text-ink-2">Prepaid <Badge tone="success" size="sm">nothing to collect</Badge></span>}
          </p>
          <div className="flex items-center justify-between gap-2">
            <SoundChip sound={ringer.sound} leader={ringer.leader} muted={ringer.muted || muted} onClaim={ringer.claim} />
            {ringer.sound === "locked" ? <button type="button" onClick={() => void ringer.unlock()} className="text-xs font-semibold text-[#8a6300] underline">Turn sound on</button> : null}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          <Button size="lg" className="col-span-3" loading={busy === "accept"} disabled={busy !== null || msLeft <= 0} onClick={() => respond(o, true)}>Accept</Button>
          <Button size="md" variant="outline" className="col-span-2" disabled={busy !== null || msLeft <= 0} onClick={() => setConfirmReject(true)}>Decline</Button>
          <Button size="md" variant="outline" onClick={() => snooze(o.id)} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute sound"}>{muted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</Button>
        </div>
      </div>
      <ConfirmDialog open={confirmReject} onClose={() => setConfirmReject(false)} onConfirm={() => respond(o, false)} title="Decline this request?" description="It is offered to another rider right away." confirmLabel="Decline" tone="danger" loading={busy === "reject"} />
    </div>
  );
}
