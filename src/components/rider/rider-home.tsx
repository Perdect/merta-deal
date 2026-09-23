"use client";
import * as React from "react";
import { RefreshCw, BellRing, Bike, IndianRupee, Wallet, Banknote, PackageCheck, Inbox } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { refreshRiderHomeAction, type RiderHomeData } from "@/lib/actions/rider";
import { Stat } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { IconButton } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { formatINR } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { OnlineToggle } from "./online-toggle";
import { OfferCard } from "./offer-card";
import { ActiveDelivery, DeliveryComplete, type CompletedDelivery } from "./active-delivery";
import { useNow } from "./use-now";

/** Rider home: online switch, active delivery stepper, today's numbers and new requests. */
export function RiderHome({ initial }: { initial: RiderHomeData }) {
  const storeStats = useRiderStore((s) => s.stats);
  const setStats = useRiderStore((s) => s.setStats);
  const setActiveDelivery = useRiderStore((s) => s.setActiveDelivery);
  const version = useRiderStore((s) => s.assignmentsVersion);
  const isOnline = useRiderStore((s) => s.isOnline);
  const stats = storeStats ?? initial.stats;

  const [offers, setOffers] = React.useState<RiderAssignment[]>(initial.offers);
  const [active, setActive] = React.useState<RiderAssignment[]>(initial.active);
  const [completed, setCompleted] = React.useState<CompletedDelivery | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  // A fresh server render (after a revalidatePath) is the truth: adopt it during render, mirror it into the store after commit.
  const [seen, setSeen] = React.useState(initial);
  if (seen !== initial) { setSeen(initial); setOffers(initial.offers); setActive(initial.active); }
  React.useEffect(() => { setStats(initial.stats); setActiveDelivery(initial.active.length > 0); }, [initial, setStats, setActiveDelivery]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    const r = await refreshRiderHomeAction();
    setRefreshing(false);
    if (!r.ok) { toast.error(r.error); return; }
    setStats(r.data.stats); setOffers(r.data.offers); setActive(r.data.active); setActiveDelivery(r.data.active.length > 0);
  }, [setStats, setActiveDelivery]);

  // Realtime bumps (from the shell) → refetch. Skip the initial mount; server data is already fresh.
  const firstRef = React.useRef(true);
  React.useEffect(() => { if (firstRef.current) { firstRef.current = false; return; } void refresh(); }, [version, refresh]);
  // Fallback polling in case realtime is unavailable.
  React.useEffect(() => { const id = setInterval(() => { void refresh(); }, 30_000); return () => clearInterval(id); }, [refresh]);

  const now = useNow();
  const current = active[0] ?? null;
  const liveOffers = offers.filter((o) => new Date(o.expires_at).getTime() > now);

  return (
    <div className="space-y-4">
      <OnlineToggle />

      {completed ? <DeliveryComplete completed={completed} onDone={() => { setCompleted(null); void refresh(); }} /> : current ? <ActiveDelivery assignment={current} onChanged={refresh} onCompleted={(c) => { setCompleted(c); void refresh(); }} /> : null}

      <section aria-labelledby="rider-stats">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="rider-stats" className="text-base font-bold text-ink">Today</h2>
          <IconButton label="Refresh" onClick={() => refresh()} loading={refreshing}><RefreshCw className="h-4 w-4" /></IconButton>
        </div>
        {stats ? (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Deliveries" value={stats.today_deliveries} icon={<PackageCheck className="h-4 w-4" />} />
            <Stat label="Earned today" value={formatINR(stats.today_earnings)} tone="brand" icon={<IndianRupee className="h-4 w-4" />} />
            <Stat label="This week" value={formatINR(stats.week_earnings)} icon={<Wallet className="h-4 w-4" />} hint="Last 7 days" />
            <Stat label="COD in hand" value={formatINR(stats.cod_in_hand)} tone="saffron" icon={<Banknote className="h-4 w-4" />} hint="Collected today" />
            <Stat label="New requests" value={stats.new_requests} icon={<BellRing className="h-4 w-4" />} />
            <Stat label="Active" value={stats.active} icon={<Bike className="h-4 w-4" />} />
          </div>
        ) : <ErrorState title="Couldn't load your stats" description="Pull to refresh or try again in a moment." onRetry={() => refresh()} />}
      </section>

      <section aria-labelledby="rider-offers">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="rider-offers" className="text-base font-bold text-ink">New requests{liveOffers.length ? <span className="ml-2 rounded-full bg-saffron-500 px-2 py-0.5 text-xs font-bold text-ink">{liveOffers.length}</span> : null}</h2>
        </div>
        {liveOffers.length ? (
          <div className="space-y-3">{liveOffers.map((o) => <OfferCard key={o.id} offer={o} onChanged={refresh} />)}</div>
        ) : (
          <div className="rounded-lg border border-dashed border-line-2 bg-card">
            <EmptyState compact icon={isOnline ? <BellRing className="h-7 w-7" /> : <Inbox className="h-7 w-7" />} title={isOnline ? "Waiting for requests" : "You're offline"} description={isOnline ? "Stay near busy areas — new requests appear here instantly and ring your phone." : "Go online to start receiving delivery requests."} />
          </div>
        )}
      </section>
    </div>
  );
}
