"use client";
import * as React from "react";
import { Banknote, Info, PackageCheck, Wallet, IndianRupee } from "lucide-react";
import type { DeliveryPartner, RiderAssignment } from "@/types/app";
import { Stat } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/states";
import { KeyValue } from "@/components/ui/misc";
import { cn, formatINR, formatNumber } from "@/lib/utils";
import { dayKeyLabel, dayKeyWeekday, istDayKey, istDayKeyAgo, istMonthKey, istWeekStartKey } from "./rider-utils";

type DayRow = { key: string; deliveries: number; earned: number; cod: number; km: number };

/** Earnings from delivered assignments (client-side IST bucketing) + lifetime totals from the rider row. */
export function EarningsView({ delivered, rider }: { delivered: RiderAssignment[]; rider: DeliveryPartner }) {
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Today" value={formatINR(today.earned)} tone="brand" icon={<IndianRupee className="h-4 w-4" />} hint={`${today.deliveries} deliveries`} />
        <Stat label="This week" value={formatINR(week.earned)} icon={<Wallet className="h-4 w-4" />} hint={`${week.deliveries} deliveries · Mon–Sun`} />
        <Stat label="This month" value={formatINR(month.earned)} icon={<Wallet className="h-4 w-4" />} hint={`${month.deliveries} deliveries`} />
        <Stat label="Lifetime" value={formatINR(rider.total_earnings)} icon={<PackageCheck className="h-4 w-4" />} hint={`${formatNumber(rider.total_deliveries)} deliveries`} />
      </div>

      <section className="rounded-lg border border-line bg-card p-4 shadow-card" aria-labelledby="earn-chart">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="earn-chart" className="text-sm font-bold text-ink">Last 7 days</h2>
          <p className="text-xs text-ink-3">Total <span className="font-semibold tabular text-ink">{formatINR(last7.reduce((s, d) => s + d.earned, 0))}</span></p>
        </div>
        {max === 0 ? (
          <EmptyState compact title="No earnings yet this week" description="Completed deliveries will chart here day by day." />
        ) : (
          <div className="flex h-40 items-end gap-2" role="img" aria-label={`Daily earnings for the last 7 days: ${last7.map((d) => `${dayKeyLabel(d.key)} ${formatINR(d.earned)}`).join(", ")}`}>
            {last7.map((d) => {
              const isToday = d.key === todayKey; const isMax = d.earned === max && max > 0;
              const h = max > 0 ? Math.max(d.earned > 0 ? 4 : 2, Math.round((d.earned / max) * 100)) : 2;
              return (
                <div key={d.key} className="flex flex-1 flex-col items-center justify-end gap-1 self-stretch" title={`${dayKeyLabel(d.key)}: ${formatINR(d.earned)} · ${d.deliveries} deliveries`}>
                  {isToday || isMax ? <span className="text-[10px] font-semibold tabular text-ink-2">{formatINR(d.earned)}</span> : null}
                  <div className="flex w-full flex-1 items-end">
                    <div className={cn("w-full rounded-t-[4px] transition-[height]", d.earned > 0 ? (isToday ? "bg-brand-700" : "bg-brand-400") : "bg-line-2")} style={{ height: `${h}%` }} />
                  </div>
                  <span className={cn("text-[10px] font-medium", isToday ? "text-brand-700" : "text-ink-3")}>{dayKeyWeekday(d.key)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-card p-4 shadow-card" aria-labelledby="cod-head">
        <h2 id="cod-head" className="flex items-center gap-2 text-sm font-bold text-ink"><Banknote className="h-4 w-4 text-saffron-700" /> Cash collected (COD)</h2>
        <KeyValue className="mt-3" items={[
          { label: "Today", value: formatINR(today.cod) },
          { label: "This week", value: formatINR(week.cod) },
          { label: "This month", value: formatINR(month.cod), strong: true },
        ]} />
        <Alert tone="neutral" icon={<Info className="h-4 w-4" />} className="mt-3">Cash you collect belongs to Merta Deal and the store. Deposit it as agreed with the admin team — deposits are reconciled by the admin, not tracked in this app yet.</Alert>
      </section>

      <section aria-labelledby="per-day">
        <h2 id="per-day" className="mb-2 text-sm font-bold text-ink">Day by day</h2>
        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-2 bg-card"><EmptyState compact icon={<PackageCheck className="h-7 w-7" />} title="No completed deliveries yet" description="Your first delivery will start this list." /></div>
        ) : (
          <table className="w-full overflow-hidden rounded-lg border border-line bg-card text-sm shadow-card">
            <caption className="sr-only">Earnings per day, most recent first</caption>
            <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
              <tr><th scope="col" className="px-3 py-2 font-semibold">Day</th><th scope="col" className="px-3 py-2 text-right font-semibold">Trips</th><th scope="col" className="px-3 py-2 text-right font-semibold">COD</th><th scope="col" className="px-3 py-2 text-right font-semibold">Earned</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.map((d) => (
                <tr key={d.key}>
                  <td className="px-3 py-2.5 font-medium text-ink">{dayKeyLabel(d.key)}<span className="block text-xs font-normal text-ink-3">{d.km > 0 ? `${d.km.toFixed(1)} km` : ""}</span></td>
                  <td className="px-3 py-2.5 text-right tabular text-ink-2">{d.deliveries}</td>
                  <td className="px-3 py-2.5 text-right tabular text-ink-2">{d.cod ? formatINR(d.cod) : "—"}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular text-brand-700">{formatINR(d.earned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
