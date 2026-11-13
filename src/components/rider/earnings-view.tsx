"use client";
import * as React from "react";
import { Banknote, Info, PackageCheck, Wallet, IndianRupee } from "lucide-react";
import type { DeliveryPartner, RiderAssignment } from "@/types/app";
import { Alert, EmptyState } from "@/components/ui/states";
import { KeyValue } from "@/components/ui/misc";
import { cn, formatINR } from "@/lib/utils";
import { dayKeyLabel, dayKeyWeekday, istDayKey, istDayKeyAgo, istMonthKey, istWeekStartKey } from "./rider-utils";
import { useT } from "@/lib/rider-i18n";

type DayRow = { key: string; deliveries: number; earned: number; cod: number; km: number };

/** Earnings from delivered assignments (client-side IST bucketing) + lifetime totals from the rider row. */
export function EarningsView({ delivered, rider }: { delivered: RiderAssignment[]; rider: DeliveryPartner }) {
  const { t, lang } = useT();
  const todayKey = istDayKeyAgo(0);
  const weekStart = istWeekStartKey();
  const monthKey = istMonthKey();

  const byDay = React.useMemo(() => {
    const map = new Map<string, DayRow>();
    for (const a of delivered) {
      const key = istDayKey(a.delivered_at ?? a.offered_at);
      const row = map.get(key) ?? { key, deliveries: 0, earned: 0, cod: 0, km: 0 };
      row.deliveries += 1; row.earned += Number(a.earning); row.cod += a.order.payment_method === "cod" ? Number(a.cod_amount) : 0; row.km += Number(a.distance_km ?? 0);
      map.set(key, row);
    }
    return map;
  }, [delivered]);

  const sum = (pred: (k: string) => boolean, field: keyof Omit<DayRow, "key">) => [...byDay.values()].filter((r) => pred(r.key)).reduce((s, r) => s + r[field], 0);
  const today = { earned: sum((k) => k === todayKey, "earned"), deliveries: sum((k) => k === todayKey, "deliveries"), cod: sum((k) => k === todayKey, "cod") };
  const week = { earned: sum((k) => k >= weekStart, "earned"), deliveries: sum((k) => k >= weekStart, "deliveries"), cod: sum((k) => k >= weekStart, "cod") };
  const month = { earned: sum((k) => k.startsWith(monthKey), "earned"), deliveries: sum((k) => k.startsWith(monthKey), "deliveries"), cod: sum((k) => k.startsWith(monthKey), "cod") };

  const last7: DayRow[] = Array.from({ length: 7 }, (_, i) => { const key = istDayKeyAgo(6 - i); return byDay.get(key) ?? { key, deliveries: 0, earned: 0, cod: 0, km: 0 }; });
  const max = Math.max(0, ...last7.map((d) => d.earned));
  const recent = [...byDay.values()].sort((a, b) => (a.key < b.key ? 1 : -1)).slice(0, 14);
  const dayLabel = (key: string) => (key === istDayKeyAgo(0) ? t("time.today") : key === istDayKeyAgo(1) ? t("time.yesterday") : dayKeyLabel(key, lang));
  const trips = (n: number) => t("earn.deliveriesCount", { n });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Tile label={t("time.today")} value={formatINR(today.earned)} hint={trips(today.deliveries)} icon={<IndianRupee className="h-4 w-4" />} hot />
        <Tile label={t("time.thisWeek")} value={formatINR(week.earned)} hint={`${trips(week.deliveries)} · ${t("earn.monSun")}`} icon={<Wallet className="h-4 w-4" />} />
        <Tile label={t("time.thisMonth")} value={formatINR(month.earned)} hint={trips(month.deliveries)} icon={<Wallet className="h-4 w-4" />} />
        <Tile label={t("earn.lifetime")} value={formatINR(rider.total_earnings)} hint={trips(rider.total_deliveries)} icon={<PackageCheck className="h-4 w-4" />} />
      </div>

      <section className="rounded-2xl bg-card p-4 shadow-card" aria-labelledby="earn-chart">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="earn-chart" className="font-display text-[15px] font-extrabold text-ink">{t("earn.last7")}</h2>
          <p className="text-xs text-ink-3">{t("common.total")} <span className="font-semibold tabular text-ink">{formatINR(last7.reduce((s, d) => s + d.earned, 0))}</span></p>
        </div>
        {max === 0 ? (
          <EmptyState compact title={t("earn.noneThisWeek")} description={t("earn.noneThisWeekBody")} />
        ) : (
          <div className="flex h-40 items-end gap-2" role="img" aria-label={last7.map((d) => `${dayLabel(d.key)} ${formatINR(d.earned)}`).join(", ")}>
            {last7.map((d) => {
              const isToday = d.key === todayKey; const isMax = d.earned === max && max > 0;
              const h = max > 0 ? Math.max(d.earned > 0 ? 4 : 2, Math.round((d.earned / max) * 100)) : 2;
              return (
                <div key={d.key} className="flex flex-1 flex-col items-center justify-end gap-1 self-stretch" title={`${dayLabel(d.key)}: ${formatINR(d.earned)} · ${trips(d.deliveries)}`}>
                  {isToday || isMax ? <span className="text-[10px] font-semibold tabular text-ink-2">{formatINR(d.earned)}</span> : null}
                  <div className="flex w-full flex-1 items-end">
                    <div className={cn("w-full rounded-t-md transition-[height]", d.earned > 0 ? (isToday ? "bg-brand-600" : "bg-brand-300") : "bg-line-2")} style={{ height: `${h}%` }} />
                  </div>
                  <span className={cn("text-[10px] font-medium", isToday ? "text-brand-700" : "text-ink-3")}>{dayKeyWeekday(d.key, lang)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card" aria-labelledby="cod-head">
        <h2 id="cod-head" className="flex items-center gap-2 font-display text-[15px] font-extrabold text-ink"><Banknote className="h-4 w-4 text-saffron-700" /> {t("earn.cashCollected")}</h2>
        <KeyValue className="mt-3" items={[
          { label: t("time.today"), value: formatINR(today.cod) },
          { label: t("time.thisWeek"), value: formatINR(week.cod) },
          { label: t("time.thisMonth"), value: formatINR(month.cod), strong: true },
        ]} />
        <Alert tone="neutral" icon={<Info className="h-4 w-4" />} className="mt-3">{t("earn.cashNote")}</Alert>
      </section>

      <section aria-labelledby="per-day">
        <h2 id="per-day" className="mb-2 px-1 font-display text-[15px] font-extrabold text-ink">{t("earn.dayByDay")}</h2>
        {recent.length === 0 ? (
          <div className="rounded-2xl bg-card shadow-card"><EmptyState compact icon={<PackageCheck className="h-7 w-7" />} title={t("earn.noneYet")} description={t("earn.noneYetBody")} /></div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
          <table className="w-full min-w-[320px] text-sm">
            <caption className="sr-only">{t("earn.dayByDay")}</caption>
            <thead className="bg-surface text-left text-[11px] uppercase tracking-wide text-ink-3">
              <tr><th scope="col" className="px-3 py-2 font-semibold">{t("earn.day")}</th><th scope="col" className="px-3 py-2 text-right font-semibold">{t("earn.trips")}</th><th scope="col" className="px-3 py-2 text-right font-semibold">{t("history.cod")}</th><th scope="col" className="px-3 py-2 text-right font-semibold">{t("home.earned")}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.map((d) => (
                <tr key={d.key}>
                  <td className="px-3 py-2.5 font-medium text-ink">{dayLabel(d.key)}<span className="block text-xs font-normal text-ink-3">{d.km > 0 ? `${d.km.toFixed(1)} km` : ""}</span></td>
                  <td className="px-3 py-2.5 text-right tabular text-ink-2">{d.deliveries}</td>
                  <td className="px-3 py-2.5 text-right tabular text-ink-2">{d.cod ? formatINR(d.cod) : "—"}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular text-brand-700">{formatINR(d.earned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, hint, icon, hot }: { label: string; value: string; hint: string; icon: React.ReactNode; hot?: boolean }) {
  return (
    <div className={cn("rounded-2xl p-4 shadow-card", hot ? "bg-brand-50" : "bg-card")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
        <span className={hot ? "text-brand-700" : "text-ink-4"}>{icon}</span>
      </div>
      <p className={cn("mt-1.5 font-display text-[22px] font-extrabold tabular leading-none", hot ? "text-brand-800" : "text-ink")}>{value}</p>
      <p className="mt-1.5 text-xs text-ink-3">{hint}</p>
    </div>
  );
}
