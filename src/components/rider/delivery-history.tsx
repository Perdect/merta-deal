"use client";
import * as React from "react";
import { Bike, Banknote, Route, Clock } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatINR, formatTime } from "@/lib/utils";
import { ASSIGNMENT_META, assignmentWhen, dayKeyLabel, formatKm, istDayKey, istDayKeyAgo, istWeekStartKey } from "./rider-utils";
import { useT } from "@/lib/rider-i18n";

type Filter = "today" | "week" | "all";

/** Past assignments grouped by IST day with today / this week / all filters. */
export function DeliveryHistory({ items }: { items: RiderAssignment[] }) {
  const { t, lang } = useT();
  const [filter, setFilter] = React.useState<Filter>("today");
  const todayKey = istDayKeyAgo(0);
  const weekStart = istWeekStartKey();

  const filtered = React.useMemo(() => items.filter((a) => {
    const k = istDayKey(assignmentWhen(a));
    return filter === "all" || (filter === "today" ? k === todayKey : k >= weekStart);
  }), [items, filter, todayKey, weekStart]);

  const groups = React.useMemo(() => {
    const map = new Map<string, RiderAssignment[]>();
    for (const a of filtered) { const k = istDayKey(assignmentWhen(a)); map.set(k, [...(map.get(k) ?? []), a]); }
    return [...map.entries()].sort((x, y) => (x[0] < y[0] ? 1 : -1));
  }, [filtered]);

  const counts = React.useMemo(() => ({
    today: items.filter((a) => istDayKey(assignmentWhen(a)) === todayKey).length,
    week: items.filter((a) => istDayKey(assignmentWhen(a)) >= weekStart).length,
    all: items.length,
  }), [items, todayKey, weekStart]);

  const dayLabel = (key: string) => (key === istDayKeyAgo(0) ? t("time.today") : key === istDayKeyAgo(1) ? t("time.yesterday") : dayKeyLabel(key, lang));

  return (
    <div className="space-y-4">
      <div className="[&_button]:min-h-12 [&_button]:text-[15px]"><Tabs variant="pill" items={[{ value: "today", label: t("time.today"), count: counts.today }, { value: "week", label: t("time.thisWeek"), count: counts.week }, { value: "all", label: t("common.all"), count: counts.all }]} value={filter} onChange={(v) => setFilter(v as Filter)} /></div>
      {groups.length === 0 ? (
        <div className="rounded-[20px] bg-card shadow-card ring-1 ring-line"><EmptyState compact icon={<Bike className="h-7 w-7" />} title={t("history.emptyTitle")} description={filter === "all" ? t("history.emptyAll") : t("history.emptyPeriod")} /></div>
      ) : groups.map(([day, list]) => {
        const delivered = list.filter((a) => a.status === "delivered");
        const earned = delivered.reduce((s, a) => s + Number(a.earning), 0);
        return (
          <section key={day} aria-labelledby={`day-${day}`}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 id={`day-${day}`} className="font-display text-[18px] font-extrabold text-ink">{dayLabel(day)}</h2>
              <p className="text-[14px] text-ink-3">{t("history.deliveredCount", { n: delivered.length })} · <span className="font-semibold tabular text-ink">{formatINR(earned)}</span></p>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-[20px] bg-card shadow-card ring-1 ring-line">
              {list.map((a) => <HistoryRow key={a.id} a={a} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function HistoryRow({ a }: { a: RiderAssignment }) {
  const { t } = useT();
  const meta = ASSIGNMENT_META[a.status];
  const delivered = a.status === "delivered";
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  return (
    <li className="flex min-h-[64px] items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[16px] font-semibold text-ink">{a.order.order_number}</p>
          <Badge tone={meta.tone} size="sm">{t(meta.label)}</Badge>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[14px] text-ink-3">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{formatTime(assignmentWhen(a))}</span>
          {a.distance_km != null && Number(a.distance_km) > 0 ? <span className="inline-flex items-center gap-1"><Route className="h-3.5 w-3.5" aria-hidden />{formatKm(a.distance_km)}</span> : null}
          {delivered && cod ? <span className="inline-flex items-center gap-1 font-semibold text-saffron-700"><Banknote className="h-3.5 w-3.5" aria-hidden />{t("earn.cashShort", { amount: formatINR(a.cod_amount) })}</span> : null}
        </p>
      </div>
      {/* Only a delivered order earned anything: a missed or cancelled request shows no amount at all. */}
      {delivered ? <p className="shrink-0 font-display text-[18px] font-extrabold tabular text-brand-700">{formatINR(a.earning)}</p> : null}
    </li>
  );
}
