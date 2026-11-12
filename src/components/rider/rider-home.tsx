"use client";
import * as React from "react";
import Link from "next/link";
import { RefreshCw, BellRing, Bike, IndianRupee, Banknote, PackageCheck, Inbox, ChevronRight } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { refreshRiderHomeAction, type RiderHomeData } from "@/lib/actions/rider";
import { ErrorState } from "@/components/ui/states";
import { Button, IconButton } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn, formatINR } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { OnlineToggle } from "./online-toggle";
import { ActiveDelivery, DeliveryComplete, type CompletedDelivery } from "./active-delivery";

/**
 * Rider home, top to bottom: the online switch, then the one thing to do now (the active delivery, or a
 * waiting state), then three numbers for today. Delivery requests are not listed here: the ringing popup
 * is the single request card, and a minimised request shows as a button in the waiting card.
 */
export function RiderHome({ initial }: { initial: RiderHomeData }) {
  const storeStats = useRiderStore((s) => s.stats);
  const setStats = useRiderStore((s) => s.setStats);
  const setActiveDelivery = useRiderStore((s) => s.setActiveDelivery);
  const version = useRiderStore((s) => s.assignmentsVersion);
  const realtime = useRiderStore((s) => s.realtime);
  const stats = storeStats ?? initial.stats;

  const [active, setActive] = React.useState<RiderAssignment[]>(initial.active);
  const [completed, setCompleted] = React.useState<CompletedDelivery | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  // A fresh server render (after a revalidatePath) is the truth: adopt it during render, mirror it into the store after commit.
  const [seen, setSeen] = React.useState(initial);
  if (seen !== initial) { setSeen(initial); setActive(initial.active); }
  React.useEffect(() => { setStats(initial.stats); setActiveDelivery(initial.active.length > 0); }, [initial, setStats, setActiveDelivery]);

  const refresh = React.useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    const r = await refreshRiderHomeAction();
    if (!quiet) setRefreshing(false);
    if (!r.ok) { if (!quiet) toast.error(r.error); return; }
    setStats(r.data.stats); setActive(r.data.active); setActiveDelivery(r.data.active.length > 0);
  }, [setStats, setActiveDelivery]);

  // Realtime bumps (from the shell: events, reconnects, tab resume, network back) → refetch. Skip the initial mount.
  const firstRef = React.useRef(true);
  React.useEffect(() => { if (firstRef.current) { firstRef.current = false; return; } void refresh(true); }, [version, refresh]);
  // Timer fallback: every 20 s while Realtime is down, a slow reconcile every 2 min while it is live.
  React.useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") void refresh(true); }, realtime === "live" ? 120_000 : 20_000);
    return () => clearInterval(id);
  }, [refresh, realtime]);

  const current = active[0] ?? null;

  return (
    <div className="space-y-4">
      <OnlineToggle />

      {completed ? <DeliveryComplete completed={completed} onDone={() => { setCompleted(null); void refresh(); }} />
        : current ? <ActiveDelivery assignment={current} onChanged={() => refresh(true)} onCompleted={(c) => { setCompleted(c); void refresh(true); }} />
        : <WaitingCard />}

      <section aria-labelledby="rider-today">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="rider-today" className="text-base font-bold text-ink">Today</h2>
          <IconButton label="Refresh" onClick={() => refresh()} loading={refreshing}><RefreshCw className="h-4 w-4" /></IconButton>
        </div>
        {stats ? (
          <>
            <dl className="grid grid-cols-3 gap-2">
              <Tile label="Active" value={stats.active} icon={<Bike className="h-4 w-4" />} tone={stats.active > 0 ? "brand" : "neutral"} />
              <Tile label="Delivered" value={stats.today_deliveries} icon={<PackageCheck className="h-4 w-4" />} />
              <Tile label="Earned" value={formatINR(stats.today_earnings)} icon={<IndianRupee className="h-4 w-4" />} tone="brand" />
            </dl>
            {Number(stats.cash_due ?? stats.cod_in_hand) > 0 ? (
              <Link href="/rider/earnings" className="mt-2 flex min-h-12 items-center gap-2.5 rounded-lg border border-saffron-300 bg-saffron-50 px-3 py-2 text-sm text-ink active:scale-[0.99]">
                <Banknote className="h-5 w-5 shrink-0 text-saffron-700" aria-hidden />
                <span className="min-w-0 flex-1">Cash to hand over: <strong className="tabular">{formatINR(stats.cash_due ?? stats.cod_in_hand)}</strong></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
              </Link>
            ) : null}
          </>
        ) : <ErrorState title="Couldn't load today's numbers" description="Tap refresh or try again in a moment." onRetry={() => refresh()} />}
      </section>
    </div>
  );
}

function Tile({ label, value, icon, tone = "neutral" }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: "neutral" | "brand" }) {
  return (
    <div className={cn("rounded-lg border border-line px-3 py-3 shadow-card", tone === "brand" ? "bg-brand-50" : "bg-card")}>
      <dt className="flex items-center justify-between gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}<span className={tone === "brand" ? "text-brand-700" : "text-ink-4"}>{icon}</span></dt>
      <dd className={cn("mt-1 text-xl font-extrabold tabular", tone === "brand" ? "text-brand-800" : "text-ink")}>{value}</dd>
    </div>
  );
}

/**
 * No active delivery. Says plainly whether requests can reach the rider right now, and brings back a
 * minimised request with one tap. The numbers here are the popup's view of the server's open offers.
 */
function WaitingCard() {
  const isOnline = useRiderStore((s) => s.isOnline);
  const status = useRiderStore((s) => s.rider?.status ?? "active");
  const offers = useRiderStore((s) => s.offers);
  const setOffers = useRiderStore((s) => s.setOffers);
  const realtime = useRiderStore((s) => s.realtime);
  if (status !== "active") return null;
  if (isOnline && offers.live > 0 && offers.collapsed) {
    return (
      <section className="rounded-lg border border-saffron-300 bg-card p-4 shadow-card animate-slide-up" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-saffron-100 text-saffron-700"><BellRing className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-ink">{offers.live === 1 ? "A delivery request is waiting" : `${offers.live} delivery requests are waiting`}</p>
            <p className="text-xs text-ink-3">Open it to accept or decline before it expires.</p>
          </div>
        </div>
        <Button size="lg" fullWidth className="mt-3" onClick={() => setOffers({ collapsed: false })}>Open request</Button>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-dashed border-line-2 bg-card px-4 py-7 text-center shadow-card" aria-live="polite">
      <span className={cn("mx-auto flex h-14 w-14 items-center justify-center rounded-full", isOnline ? "bg-brand-50 text-brand-700" : "bg-surface-2 text-ink-3")}>
        {isOnline ? <BellRing className={cn("h-6 w-6", realtime === "live" && "animate-pulse-soft")} aria-hidden /> : <Inbox className="h-6 w-6" aria-hidden />}
      </span>
      <h2 className="mt-3 text-base font-bold text-ink">{isOnline ? "Waiting for delivery requests" : "You're offline"}</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm text-ink-3">
        {isOnline
          ? realtime === "live" ? "A new request rings here the moment it is sent. Keep this screen open." : "Requests are checked every few seconds until live updates reconnect."
          : "Go online above to start receiving delivery requests."}
      </p>
    </section>
  );
}
