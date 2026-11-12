"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { BellRing, MapPin, Package, Route, Store as StoreIcon, Timer, Banknote, VolumeX, Volume2, ChevronDown, IndianRupee } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { getRiderAssignmentsAction, respondAssignmentAction } from "@/lib/actions/rider";
import { deliverPendingPushAction } from "@/lib/actions/alerts";
import { Button } from "@/components/ui/button";
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
 * The one delivery-request card of the rider app: a ringing popup over every page. Offers come from the
 * server (`rider_assignments`, which also expires stale ones), re-read on every Realtime change to this
 * rider's assignments, after a reconnect or a return to the foreground, and on a slow timer (fast only
 * while Realtime is down). Ringing stops when the offer is accepted, declined, expired, withdrawn by an
 * admin assignment, or the order is cancelled, because each of those removes it from the server list.
 * Mute only silences. Accept and Decline report success only once the database has confirmed them.
 */
export function OfferAlert({ push }: { push: PushConfig }) {
  const router = useRouter();
  const ringer = useRinger();
  const { setRinging, courier } = ringer;
  const now = useNow();
  const version = useRiderStore((s) => s.assignmentsVersion);
  const realtime = useRiderStore((s) => s.realtime);
  const bump = useRiderStore((s) => s.bumpAssignments);
  const setOffersMeta = useRiderStore((s) => s.setOffers);
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
      if (fresh.length) {
        setCollapsed(false);
        if (push.configured && courier) void deliverPendingPushAction();
        // A short buzz where the browser allows it (Android Chrome after the rider has used the page); silently nothing elsewhere.
        try { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([300, 120, 300]); } catch { /* unsupported */ }
      }
    } catch { /* offline: the next bump or poll retries */ }
  }, [push.configured, courier]);

  React.useEffect(() => { const t = setTimeout(() => setSnoozed(readSnoozed()), 0); return () => clearTimeout(t); }, []);
  // First read, then the shell's bump on every Realtime change / reconnect / resume. The timer is a fallback: every
  // 20 s while Realtime is down, a slow reconcile every 90 s while it is live.
  React.useEffect(() => {
    if (riderStatus && riderStatus !== "active") return;
    const first = setTimeout(load, 0);
    const id = setInterval(load, realtime === "live" ? 90_000 : 20_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load, riderStatus, realtime]);
  const firstRef = React.useRef(true);
  React.useEffect(() => { if (firstRef.current) { firstRef.current = false; return; } void load(); }, [version, load]);

  // `now` is 0 until the shared clock's first tick: no offer counts as live (or expired) before that.
  const live = now ? offers.filter((o) => now < new Date(o.expires_at).getTime()) : [];
  const ringing = live.some((o) => !snoozed.has(o.id));
  React.useEffect(() => { setRinging(ringing); }, [ringing, setRinging]);
  React.useEffect(() => () => setRinging(false), [setRinging]);
  React.useEffect(() => { setOffersMeta({ live: live.length, collapsed }); }, [live.length, collapsed, setOffersMeta]);
  React.useEffect(() => () => setOffersMeta({ live: 0, collapsed: false }), [setOffersMeta]);
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
      if (!r.ok) {
        if ("outcome" in r) {
          if (r.outcome === "taken") toast.warning("Another rider got this one", "They accepted a moment before you. Your screen has been refreshed.");
          else if (r.outcome === "expired") toast.warning("This request has expired", "It was not answered in time and is being offered again.");
          else toast.info("This request is no longer open", r.error);
        } else toast.error("Could not send your answer", r.error);
        setOffers((cur) => cur.filter((x) => x.id !== offer.id));
        bump(); router.refresh();
        return;
      }
      if (accept) toast.success(r.data.already ? "Already yours" : "Delivery accepted", `Head to ${offer.pickup.name} for pickup.`);
      else toast.info("Request declined", "It is being offered to another rider.");
      setOffers((cur) => cur.filter((x) => x.id !== offer.id));
      bump(); router.refresh();
    } catch { toast.error("Could not reach Merta Deal", "Nothing was recorded. Check your connection and tap the button again; a repeat is safe."); }
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
    <div role="alertdialog" aria-labelledby="offer-alert-title" className="fixed inset-0 z-[65] flex items-end justify-center bg-ink/55 p-3 sm:items-center" style={{ paddingTop: "calc(var(--safe-top) + 12px)" }}>
      <div className={cn("w-full max-w-md overflow-hidden rounded-2xl border-2 bg-card shadow-float animate-slide-up", urgent ? "border-danger" : "border-brand-500")} style={{ marginBottom: "var(--safe-bottom)" }}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            {ringing && !muted ? <span className="absolute inset-0 rounded-full bg-brand-200 animate-ping" aria-hidden /> : null}
            <BellRing className="relative h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p id="offer-alert-title" className="text-base font-bold text-ink">New delivery request</p>
            <p className="text-xs text-ink-3">{live.length > 1 ? `${live.length} waiting · ` : ""}Order {o.order.order_number}</p>
          </div>
          <span className={cn("inline-flex h-9 items-center gap-1 rounded-full px-3 text-base font-bold tabular", urgent ? "bg-danger-50 text-danger" : "bg-saffron-100 text-saffron-700")} aria-live="polite" aria-label={now ? `Expires in ${mmss(msLeft)}` : "Expires soon"}>
            <Timer className="h-4 w-4" aria-hidden />{now ? mmss(msLeft) : "--:--"}
          </span>
          <button type="button" onClick={() => setCollapsed(true)} aria-label="Minimise" className="tap flex h-9 w-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2"><ChevronDown className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3 px-4 py-3.5">
          <div className="space-y-2">
            <p className="flex items-start gap-2.5 text-[15px] text-ink-2"><StoreIcon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-700" aria-hidden /><span>Pick up at <span className="font-bold text-ink">{o.pickup.name}</span>{o.pickup.area ? <span className="text-ink-3"> · {o.pickup.area}</span> : null}</span></p>
            <p className="flex items-start gap-2.5 text-[15px] text-ink-2"><MapPin className="mt-0.5 h-4.5 w-4.5 shrink-0 text-info" aria-hidden /><span>Deliver to <span className="font-bold text-ink">{customerArea || "the customer's area"}</span></span></p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-brand-50 px-2 py-2.5"><dt className="text-[10px] font-semibold uppercase tracking-wide text-brand-700"><IndianRupee className="mr-0.5 inline h-3 w-3" aria-hidden />You earn</dt><dd className={cn("font-extrabold tabular text-brand-800", earns ? "text-xl" : "text-xs leading-7")}>{earns ? formatINR(o.earning) : "Not set yet"}</dd></div>
            <div className="rounded-md bg-surface-2 px-2 py-2.5"><dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3"><Route className="mr-0.5 inline h-3 w-3" aria-hidden />Distance</dt><dd className={cn("font-extrabold tabular text-ink", km ? "text-xl" : "text-xs leading-7")}>{km ? formatKm(o.distance_km) : "No map pin"}</dd></div>
            <div className="rounded-md bg-surface-2 px-2 py-2.5"><dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3"><Package className="mr-0.5 inline h-3 w-3" aria-hidden />Items</dt><dd className="text-xl font-extrabold tabular text-ink">{o.order.item_count}</dd></div>
          </dl>
          <p className={cn("flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[15px] font-semibold", cod ? "bg-saffron-50 text-saffron-700" : "bg-success-50 text-success")}>
            <Banknote className="h-5 w-5 shrink-0" aria-hidden />
            {cod ? <span>Collect <span className="tabular">{formatINR(o.cod_amount)}</span> cash from the customer</span> : <span>Prepaid · nothing to collect</span>}
          </p>
          <div className="flex items-center justify-between gap-2">
            <SoundChip sound={ringer.sound} leader={ringer.leader} muted={ringer.muted || muted} onClaim={ringer.claim} />
            {ringer.sound === "locked" ? <button type="button" onClick={() => void ringer.unlock()} className="tap text-xs font-semibold text-[#8a6300] underline">Turn sound on</button> : null}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          <Button size="lg" className="col-span-3 h-14 text-lg" loading={busy === "accept"} disabled={busy !== null || msLeft <= 0} onClick={() => respond(o, true)}>{busy === "accept" ? "Confirming with Merta Deal…" : "Accept delivery"}</Button>
          <Button size="lg" variant="outline" className="col-span-2" disabled={busy !== null || msLeft <= 0} onClick={() => setConfirmReject(true)}>Decline</Button>
          <Button size="lg" variant="outline" onClick={() => snooze(o.id)} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute sound"}>{muted ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</Button>
        </div>
      </div>
      <ConfirmDialog open={confirmReject} onClose={() => setConfirmReject(false)} onConfirm={() => respond(o, false)} title="Decline this request?" description="It is offered to another rider right away." confirmLabel="Decline" tone="danger" loading={busy === "reject"} />
    </div>
  );
}
