"use client";
import * as React from "react";
import { Banknote, Info, PackageCheck } from "lucide-react";
import type { DeliveryPartner, RiderAssignment } from "@/types/app";
import { EmptyState } from "@/components/ui/states";
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
      <section className="rounded-[24px] bg-brand-700 p-5 text-white shadow-card" aria-label={t("time.today")}>
        <p className="text-[15px] font-semibold text-white/80">{t("home.todayEarned")}</p>
        <p className="mt-0.5 font-display text-[40px] font-extrabold leading-none tabular">{formatINR(today.earned)}</p>
        <p className="mt-2 text-[15px] text-white/85">{trips(today.deliveries)}</p>
      </section>

      <dl className="divide-y divide-line overflow-hidden rounded-[20px] bg-card shadow-card ring-1 ring-line">
        <Line label={t("time.thisWeek")} hint={`${trips(week.deliveries)} · ${t("earn.monSun")}`} value={formatINR(week.earned)} />
        <Line label={t("time.thisMonth")} hint={trips(month.deliveries)} value={formatINR(month.earned)} />
        <Line label={t("earn.lifetime")} hint={trips(rider.total_deliveries)} value={formatINR(rider.total_earnings)} />
      </dl>

      <section className="rounded-[20px] bg-card p-4 shadow-card ring-1 ring-line" aria-labelledby="cod-head">
        <h2 id="cod-head" className="flex items-center gap-2 font-display text-[18px] font-extrabold text-ink"><Banknote className="h-5 w-5 text-saffron-700" aria-hidden /> {t("earn.cashCollected")}</h2>
        <dl className="mt-2 divide-y divide-line">
          {[{ l: t("time.today"), v: today.cod }, { l: t("time.thisWeek"), v: week.cod }, { l: t("time.thisMonth"), v: month.cod }].map((x) => (
            <div key={x.l} className="flex min-h-11 items-center justify-between gap-3 text-[16px]"><dt className="text-ink-2">{x.l}</dt><dd className="font-bold tabular text-ink">{formatINR(x.v)}</dd></div>
          ))}
        </dl>
        <p className="mt-2 flex items-start gap-2 rounded-2xl bg-saffron-50 px-3.5 py-3 text-[14px] text-ink"><Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-saffron-700" aria-hidden />{t("earn.cashNote")}</p>
      </section>

      <section className="rounded-[20px] bg-card p-4 shadow-card ring-1 ring-line" aria-labelledby="earn-chart">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="earn-chart" className="font-display text-[18px] font-extrabold text-ink">{t("earn.last7")}</h2>
          <p className="text-[14px] text-ink-3">{t("common.total")} <span className="font-bold tabular text-ink">{formatINR(last7.reduce((s, d) => s + d.earned, 0))}</span></p>
        </div>
        {max === 0 ? (
          <EmptyState compact title={t("earn.noneThisWeek")} description={t("earn.noneThisWeekBody")} />
        ) : (
          <div className="flex h-40 items-end gap-2" role="img" aria-label={last7.map((d) => `${dayLabel(d.key)} ${formatINR(d.earned)}`).join(", ")}>
            {last7.map((d) => {
              const isToday = d.key === todayKey; const isMax = d.earned === max && max > 0;
              const h = max > 0 ? Math.max(d.earned > 0 ? 4 : 2, Math.round((d.earned / max) * 100)) : 2;
              return (
                <div key={d.key} className="flex flex-1 flex-col items-center justify-end gap-1 self-stretch">
                  {isToday || isMax ? <span className="text-[12px] font-bold tabular text-ink-2">{formatINR(d.earned)}</span> : null}
                  <div className="flex w-full flex-1 items-end">
                    <div className={cn("w-full rounded-t-md", d.earned > 0 ? (isToday ? "bg-brand-600" : "bg-brand-300") : "bg-line-2")} style={{ height: `${h}%` }} />
                  </div>
                  <span className={cn("text-[12px] font-semibold", isToday ? "text-brand-700" : "text-ink-3")}>{dayKeyWeekday(d.key, lang)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="per-day">
        <h2 id="per-day" className="mb-2 px-1 font-display text-[18px] font-extrabold text-ink">{t("earn.dayByDay")}</h2>
        {recent.length === 0 ? (
          <div className="rounded-[20px] bg-card shadow-card ring-1 ring-line"><EmptyState compact icon={<PackageCheck className="h-7 w-7" />} title={t("earn.noneYet")} description={t("earn.noneYetBody")} /></div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[20px] bg-card shadow-card ring-1 ring-line">
            {recent.map((d) => (
              <li key={d.key} className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold text-ink">{dayLabel(d.key)}</p>
                  <p className="text-[14px] text-ink-3">{trips(d.deliveries)}{d.cod ? ` · ${t("earn.cashShort", { amount: formatINR(d.cod) })}` : ""}</p>
                </div>
                <p className="shrink-0 font-display text-[18px] font-extrabold tabular text-brand-700">{formatINR(d.earned)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Line({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <div className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-2.5">
      <dt className="min-w-0"><span className="block text-[16px] font-semibold text-ink">{label}</span><span className="block text-[14px] text-ink-3">{hint}</span></dt>
      <dd className="shrink-0 font-display text-[20px] font-extrabold tabular text-ink">{value}</dd>
    </div>
  );
}
