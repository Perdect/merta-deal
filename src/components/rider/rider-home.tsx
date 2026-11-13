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
import { useT } from "@/lib/rider-i18n";

/**
 * Rider home, top to bottom: the online switch, the one thing to do now (the active delivery, or a
 * waiting state), then three numbers for today. Requests are not listed here: the ringing popup is the
 * single request card, and a minimised request shows as a button in the waiting card.
 */
export function RiderHome({ initial }: { initial: RiderHomeData }) {
  const { t } = useT();
  const storeStats = useRiderStore((s) => s.stats);
  const setStats = useRiderStore((s) => s.setStats);
  const setActiveDelivery = useRiderStore((s) => s.setActiveDelivery);
  const version = useRiderStore((s) => s.assignmentsVersion);
  const realtime = useRiderStore((s) => s.realtime);
  const stats = storeStats ?? initial.stats;

  const [active, setActive] = React.useState<RiderAssignment[]>(initial.active);
  const [completed, setCompleted] = React.useState<CompletedDelivery | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

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

  const firstRef = React.useRef(true);
  React.useEffect(() => { if (firstRef.current) { firstRef.current = false; return; } void refresh(true); }, [version, refresh]);
  React.useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") void refresh(true); }, realtime === "live" ? 120_000 : 20_000);
    return () => clearInterval(id);
  }, [refresh, realtime]);

  const current = active[0] ?? null;
  const cashDue = Number(stats?.cash_due ?? stats?.cod_in_hand ?? 0);

  return (
    <div className="space-y-4">
      <OnlineToggle />

      {completed ? <DeliveryComplete completed={completed} onDone={() => { setCompleted(null); void refresh(); }} />
        : current ? <ActiveDelivery assignment={current} onChanged={() => refresh(true)} onCompleted={(c) => { setCompleted(c); void refresh(true); }} />
        : <WaitingCard />}

      <section aria-labelledby="rider-today">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 id="rider-today" className="font-display text-[17px] font-extrabold text-ink">{t("home.today")}</h2>
          <IconButton label={t("common.refresh")} onClick={() => refresh()} loading={refreshing}><RefreshCw className="h-4 w-4" /></IconButton>
        </div>
        {stats ? (
          <>
            <dl className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-[20px] border border-line bg-card shadow-card">
              <Tile label={t("home.active")} value={stats.active} icon={<Bike className="h-4 w-4" />} hot={stats.active > 0} />
              <Tile label={t("home.delivered")} value={stats.today_deliveries} icon={<PackageCheck className="h-4 w-4" />} />
              <Tile label={t("home.earned")} value={formatINR(stats.today_earnings)} icon={<IndianRupee className="h-4 w-4" />} hot />
            </dl>
            {cashDue > 0 ? (
              <Link href="/rider/earnings" className="mt-2 flex min-h-12 items-center gap-2.5 rounded-2xl bg-saffron-50 px-4 py-2.5 text-sm text-ink ring-1 ring-saffron-300/60 active:scale-[0.99]">
                <Banknote className="h-5 w-5 shrink-0 text-saffron-700" aria-hidden />
                <span className="min-w-0 flex-1">{t("home.cashToHandOver")} <strong className="tabular">{formatINR(cashDue)}</strong></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
              </Link>
            ) : null}
          </>
        ) : <ErrorState title={t("home.statsFailed")} description={t("home.statsFailedBody")} onRetry={() => refresh()} />}
      </section>
    </div>
  );
}

function Tile({ label, value, icon, hot }: { label: string; value: React.ReactNode; icon: React.ReactNode; hot?: boolean }) {
  return (
    <div className="px-3 py-3.5">
      <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3"><span className={hot ? "text-brand-600" : "text-ink-4"}>{icon}</span>{label}</dt>
      <dd className={cn("mt-1 font-display text-[22px] font-extrabold tabular leading-none", hot ? "text-brand-700" : "text-ink")}>{value}</dd>
    </div>
  );
}

/** No active delivery: says plainly whether requests can reach the rider, and brings back a minimised request. */
function WaitingCard() {
  const { t } = useT();
  const isOnline = useRiderStore((s) => s.isOnline);
  const status = useRiderStore((s) => s.rider?.status ?? "active");
  const offers = useRiderStore((s) => s.offers);
  const setOffers = useRiderStore((s) => s.setOffers);
  const realtime = useRiderStore((s) => s.realtime);
  if (status !== "active") return null;
  if (isOnline && offers.live > 0 && offers.collapsed) {
    return (
      <section className="rounded-[20px] border border-line bg-card p-4 shadow-card ring-1 ring-saffron-300 animate-slide-up" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-saffron-100 text-saffron-700"><BellRing className="h-6 w-6" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] font-extrabold text-ink">{offers.live === 1 ? t("waiting.oneRequest") : t("waiting.manyRequests", { n: offers.live })}</p>
            <p className="text-[13px] text-ink-3">{t("waiting.openBeforeExpiry")}</p>
          </div>
        </div>
        <Button size="lg" fullWidth className="mt-3 h-13 rounded-xl text-base" onClick={() => setOffers({ collapsed: false })}>{t("waiting.openRequest")}</Button>
      </section>
    );
  }
  return (
    <section className="rounded-[20px] border border-line bg-card px-5 py-8 text-center shadow-card" aria-live="polite">
      <span className={cn("mx-auto flex h-16 w-16 items-center justify-center rounded-full", isOnline ? "bg-brand-50 text-brand-700" : "bg-surface-2 text-ink-3")}>
        {isOnline ? <BellRing className={cn("h-7 w-7", realtime === "live" && "animate-pulse-soft")} aria-hidden /> : <Inbox className="h-7 w-7" aria-hidden />}
      </span>
      <h2 className="mt-3 font-display text-[17px] font-extrabold text-ink">{isOnline ? t("waiting.title") : t("waiting.offlineTitle")}</h2>
      <p className="mx-auto mt-1 max-w-xs text-[13px] text-ink-3">
        {isOnline ? (realtime === "live" ? t("waiting.liveBody") : t("waiting.pollingBody")) : t("waiting.offlineBody")}
      </p>
    </section>
  );
}
