"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, BellRing, ChevronRight, CircleSlash, PowerOff, Wifi, WifiOff } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { refreshRiderHomeAction, type RiderHomeData } from "@/lib/actions/rider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn, formatINR } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { ActiveDelivery, DeliveryComplete, type ActiveDeliveryDemo, type CompletedDelivery } from "./active-delivery";
import { RequestList, useRequests } from "./offer-alert";
import { GoOnlineButton } from "./online-toggle";
import { useT } from "@/lib/rider-i18n";

/**
 * Rider home: one state at a time, top to bottom.
 *   offline                → "You are offline" and one big Go online button
 *   online, nothing to do  → "You are online. Waiting for orders."
 *   online, requests open  → the requests, as a list of cards with Accept and Decline
 *   on a delivery          → only that delivery, with its one next step
 * Today's earning and the cash to hand over sit small at the bottom. The online switch is in the top bar.
 */
export function RiderHome({ initial, focus = null, demo }: { initial: RiderHomeData; /** Assignment id from a notification link (`/rider?a=`). */ focus?: string | null; /** Development preview only. */ demo?: ActiveDeliveryDemo }) {
  const { t } = useT();
  const storeStats = useRiderStore((s) => s.stats);
  const setStats = useRiderStore((s) => s.setStats);
  const setActiveDelivery = useRiderStore((s) => s.setActiveDelivery);
  const version = useRiderStore((s) => s.assignmentsVersion);
  const realtime = useRiderStore((s) => s.realtime);
  const isOnline = useRiderStore((s) => s.isOnline);
  const status = useRiderStore((s) => s.rider?.status ?? "active");
  const stats = storeStats ?? initial.stats;
  const requests = useRequests();

  const [active, setActive] = React.useState<RiderAssignment[]>(initial.active);
  const [completed, setCompleted] = React.useState<CompletedDelivery | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const [seen, setSeen] = React.useState(initial);
  if (seen !== initial) { setSeen(initial); setActive(initial.active); }
  React.useEffect(() => { setStats(initial.stats); setActiveDelivery(initial.active.length > 0); }, [initial, setStats, setActiveDelivery]);

  const refresh = React.useCallback(async (quiet = false) => {
    if (demo) return;
    if (!quiet) setRefreshing(true);
    const r = await refreshRiderHomeAction();
    if (!quiet) setRefreshing(false);
    if (!r.ok) { if (!quiet) toast.error(r.error); return; }
    setStats(r.data.stats); setActive(r.data.active); setActiveDelivery(r.data.active.length > 0);
  }, [setStats, setActiveDelivery, demo]);

  const firstRef = React.useRef(true);
  React.useEffect(() => { if (firstRef.current) { firstRef.current = false; return; } void refresh(true); }, [version, refresh]);
  React.useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") void refresh(true); }, realtime === "live" ? 120_000 : 20_000);
    return () => clearInterval(id);
  }, [refresh, realtime]);

  const current = active[0] ?? null;

  return (
    <div className="space-y-4">
      <OpenedFromAlert focus={focus} initial={initial} />
      {completed ? <DeliveryComplete completed={completed} onDone={() => { setCompleted(null); void refresh(); }} />
        : current ? (
          <>
            <ActiveDelivery assignment={current} onChanged={() => refresh(true)} onCompleted={(c) => { setCompleted(c); void refresh(true); }} demo={demo} />
            {requests.open > 0 ? <p className="flex items-start gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-[15px] font-semibold text-ink-2" role="status"><BellRing className="mt-0.5 h-5 w-5 shrink-0 text-ink-3" aria-hidden />{requests.open === 1 ? t("req.whileBusyOne") : t("req.whileBusy", { n: requests.open })}</p> : null}
          </>
        )
        : status !== "active" ? null
        : !isOnline ? <OfflineCard />
        : requests.shown.length > 0 ? <RequestList />
        : <WaitingCard />}
      <TodayRow stats={stats} refreshing={refreshing} onRefresh={() => refresh()} />
    </div>
  );
}

/**
 * The app was opened from a notification about one delivery. An open request is already in the list and an
 * accepted delivery is the card on screen, so those need nothing here. Only a delivery that is no longer this
 * rider's gets a line saying so, once; the address is then cleaned so a refresh does not repeat it. Decided
 * from the server's own lists, never from the link.
 */
function OpenedFromAlert({ focus, initial }: { focus: string | null; initial: RiderHomeData }) {
  const { t } = useT();
  const router = useRouter();
  const [handled, setHandled] = React.useState<string | null>(null);
  const isOffer = Boolean(focus && initial.offers.some((o) => o.id === focus));
  const isActive = Boolean(focus && initial.active.some((o) => o.id === focus));
  const gone = Boolean(focus) && !isOffer && !isActive;
  React.useEffect(() => {
    if (focus && (isOffer || isActive)) router.replace("/rider", { scroll: false });
  }, [focus, isOffer, isActive, router]);
  if (!gone || handled === focus) return null;
  const dismiss = () => { setHandled(focus); router.replace("/rider", { scroll: false }); };
  return (
    <section role="status" className="rounded-[20px] bg-card p-4 shadow-card ring-1 ring-line motion-safe:animate-slide-up">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-3" aria-hidden><CircleSlash className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-extrabold text-ink">{t("link.goneTitle")}</p>
          <p className="mt-0.5 text-[15px] text-ink-2">{t("link.goneBody")}</p>
        </div>
      </div>
      <Button size="lg" variant="outline" fullWidth className="mt-3 h-12 rounded-2xl text-[16px]" onClick={dismiss}>{t("link.dismiss")}</Button>
    </section>
  );
}

/** Offline: one sentence and one big button. */
function OfflineCard() {
  const { t } = useT();
  return (
    <section className="rounded-[24px] bg-card px-5 pb-5 pt-8 text-center shadow-card ring-1 ring-line" aria-live="polite">
      <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-surface-2 text-ink-3" aria-hidden><PowerOff className="h-10 w-10" /></span>
      <h2 className="mt-4 font-display text-[26px] font-extrabold leading-tight text-ink">{t("home.offlineTitle")}</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-[17px] text-ink-2">{t("home.offlineBody")}</p>
      <GoOnlineButton className="mt-6" />
      <p className="mt-3 text-[14px] text-ink-3">{t("home.offlineGps")}</p>
    </section>
  );
}

/** Online with nothing to do: says so, and says truthfully how a new order will reach this phone. */
function WaitingCard() {
  const { t } = useT();
  const realtime = useRiderStore((s) => s.realtime);
  const live = realtime === "live";
  return (
    <section className="rounded-[24px] bg-card px-5 py-9 text-center shadow-card ring-1 ring-line" aria-live="polite">
      <span className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand-700" aria-hidden>
        {live ? <span className="absolute inset-0 rounded-full bg-brand-100 motion-safe:animate-pulse-soft" /> : null}
        <BellRing className="relative h-10 w-10" />
      </span>
      <h2 className="mt-4 font-display text-[26px] font-extrabold leading-tight text-ink">{t("home.waitingTitle")}</h2>
      <p className="mt-1.5 text-[19px] font-semibold text-ink-2">{t("home.waitingBody")}</p>
      <p className={cn("mx-auto mt-4 flex max-w-xs items-start justify-center gap-2 text-left text-[15px]", live ? "text-ink-3" : "text-[#8a6300]")}>
        {live ? <Wifi className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden /> : <WifiOff className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden />}
        <span>{live ? t("home.waitingLive") : t("home.waitingPolling")}</span>
      </p>
    </section>
  );
}

/** Small and out of the way: what today has earned, and the cash that has to be handed over. */
function TodayRow({ stats, refreshing, onRefresh }: { stats: RiderHomeData["stats"]; refreshing: boolean; onRefresh: () => void }) {
  const { t } = useT();
  if (!stats) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3" role="status">
        <p className="min-w-0 text-[15px] text-ink-2">{t("home.statsFailed")}</p>
        <Button variant="outline" className="h-11 shrink-0 rounded-xl" loading={refreshing} onClick={onRefresh}><RefreshCw className="h-4 w-4" aria-hidden /> {t("common.refresh")}</Button>
      </section>
    );
  }
  const cashDue = Number(stats.cash_due ?? stats.cod_in_hand ?? 0);
  const cell = "flex min-h-[68px] min-w-0 flex-1 flex-col justify-center px-4 py-2.5 active:bg-brand-50";
  return (
    <section aria-label={t("home.today")} className="flex items-stretch divide-x divide-line-2 overflow-hidden rounded-2xl bg-surface-2">
      <Link href="/rider/earnings" className={cell}>
        <span className="text-[13px] font-semibold text-ink-3">{t("home.todayEarned")}</span>
        <span className="flex items-baseline gap-1.5"><span className="font-display text-[20px] font-extrabold tabular text-ink">{formatINR(stats.today_earnings)}</span><span className="truncate text-[13px] text-ink-3">{stats.today_deliveries === 1 ? t("home.oneDelivery") : t("earn.deliveriesCount", { n: stats.today_deliveries })}</span></span>
      </Link>
      <Link href="/rider/earnings" className={cell}>
        <span className="text-[13px] font-semibold text-ink-3">{t("home.cashToHandOverShort")}</span>
        <span className="flex items-center gap-1"><span className={cn("font-display text-[20px] font-extrabold tabular", cashDue > 0 ? "text-saffron-700" : "text-ink")}>{formatINR(cashDue)}</span><ChevronRight className="h-4 w-4 text-ink-3" aria-hidden /></span>
      </Link>
      <button type="button" onClick={onRefresh} disabled={refreshing} aria-label={t("common.refresh")} className="flex w-14 shrink-0 items-center justify-center text-ink-3 active:bg-brand-50 disabled:opacity-60">
        <RefreshCw className={cn("h-5 w-5", refreshing && "motion-safe:animate-spin")} aria-hidden />
      </button>
    </section>
  );
}
