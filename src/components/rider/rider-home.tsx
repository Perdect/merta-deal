"use client";
import * as React from "react";
import Link from "next/link";
import { RefreshCw, BellRing, Inbox, ChevronRight, CircleDollarSign } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { refreshRiderHomeAction, type RiderHomeData } from "@/lib/actions/rider";
import { ErrorState } from "@/components/ui/states";
import { Button, IconButton } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn, formatINR } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { ActiveDelivery, DeliveryComplete, type CompletedDelivery } from "./active-delivery";
import { useT } from "@/lib/rider-i18n";

/**
 * Rider home, top to bottom: today's earning card with two tiles (deliveries, cash to hand over), then
 * "Deliveries" with the one thing to do now (the active delivery, or a waiting state). The online switch
 * lives in the top bar. Requests are not listed here: the ringing popup is the single request card, and a
 * minimised request shows as a button in the waiting card.
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
  const count = active.length;

  return (
    <div className="space-y-4">
      <section aria-labelledby="rider-today">
        {stats ? (
          <div className="rounded-[20px] bg-card p-4 shadow-card">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700" aria-hidden><CircleDollarSign className="h-7 w-7" strokeWidth={2.2} /></span>
              <div className="min-w-0 flex-1">
                <p id="rider-today" className="text-[13px] font-semibold text-ink-3">{t("home.totalEarning")}</p>
                <p className="font-display text-[26px] font-extrabold tabular leading-tight text-ink">{formatINR(stats.today_earnings)}</p>
              </div>
              <span className="shrink-0 rounded-full border border-brand-600 px-3 py-1 text-[11px] font-bold tracking-wide text-brand-700">{t("home.todayChip")}</span>
              <IconButton label={t("common.refresh")} onClick={() => refresh()} loading={refreshing} className="-mr-1"><RefreshCw className="h-4 w-4" /></IconButton>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <Tile label={t("home.deliveriesToday")} value={stats.today_deliveries} />
              <Tile label={t("home.cashToHandOverShort")} value={formatINR(cashDue)} href={cashDue > 0 ? "/rider/earnings" : undefined} hot={cashDue > 0} />
            </dl>
          </div>
        ) : <ErrorState title={t("home.statsFailed")} description={t("home.statsFailedBody")} onRetry={() => refresh()} />}
      </section>

      <section aria-labelledby="rider-deliveries">
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <h2 id="rider-deliveries" className="font-display text-[18px] font-extrabold text-ink">{t("home.deliveriesTitle")}</h2>
          <p className="text-[12px] font-semibold text-brand-700">{count === 0 ? t("home.youHaveNone") : count === 1 ? t("home.youHaveOne") : t("home.youHave", { n: count })}</p>
        </div>
        {completed ? <DeliveryComplete completed={completed} onDone={() => { setCompleted(null); void refresh(); }} />
          : current ? <ActiveDelivery assignment={current} onChanged={() => refresh(true)} onCompleted={(c) => { setCompleted(c); void refresh(true); }} />
          : <WaitingCard />}
      </section>
    </div>
  );
}

/** Mint tile: label on top, big number below; a link when there is somewhere to go. */
function Tile({ label, value, href, hot }: { label: string; value: React.ReactNode; href?: string; hot?: boolean }) {
  const inner = (
    <>
      <dt className="text-[12px] font-semibold text-ink-2">{label}</dt>
      <dd className={cn("mt-1 flex items-center gap-1 font-display text-[22px] font-extrabold tabular leading-none", hot ? "text-brand-700" : "text-ink")}>
        {value}{href ? <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden /> : null}
      </dd>
    </>
  );
  const cls = "block rounded-2xl bg-surface-2 px-4 py-3.5";
  return href ? <Link href={href} className={cn(cls, "active:scale-[0.99]")}>{inner}</Link> : <div className={cls}>{inner}</div>;
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
      <section className="rounded-[20px] bg-card p-4 shadow-card ring-1 ring-saffron-300 animate-slide-up" aria-live="polite">
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
    <section className="rounded-[20px] bg-card px-5 py-8 text-center shadow-card" aria-live="polite">
      <span className={cn("mx-auto flex h-16 w-16 items-center justify-center rounded-full", isOnline ? "bg-brand-50 text-brand-700" : "bg-surface-2 text-ink-3")}>
        {isOnline ? <BellRing className={cn("h-7 w-7", realtime === "live" && "animate-pulse-soft")} aria-hidden /> : <Inbox className="h-7 w-7" aria-hidden />}
      </span>
      <h3 className="mt-3 font-display text-[17px] font-extrabold text-ink">{isOnline ? t("waiting.title") : t("waiting.offlineTitle")}</h3>
      <p className="mx-auto mt-1 max-w-xs text-[13px] text-ink-3">
        {isOnline ? (realtime === "live" ? t("waiting.liveBody") : t("waiting.pollingBody")) : t("waiting.offlineBody")}
      </p>
    </section>
  );
}
