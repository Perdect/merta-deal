"use client";
import * as React from "react";
import { Bike, Banknote, Route, Clock } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatINR, formatTime } from "@/lib/utils";
import { ASSIGNMENT_META, assignmentWhen, dayKeyLabel, formatKm, istDayKey, istDayKeyAgo, istWeekStartKey } from "./rider-utils";

type Filter = "today" | "week" | "all";

/** Past assignments grouped by IST day with today / this week / all filters. */
export function DeliveryHistory({ items }: { items: RiderAssignment[] }) {
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

  return (
    <div className="space-y-4">
      <Tabs variant="pill" items={[{ value: "today", label: "Today", count: counts.today }, { value: "week", label: "This week", count: counts.week }, { value: "all", label: "All", count: counts.all }]} value={filter} onChange={(v) => setFilter(v as Filter)} />
      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-2 bg-card"><EmptyState compact icon={<Bike className="h-7 w-7" />} title="No deliveries here yet" description={filter === "all" ? "Completed and missed requests will show up here." : "Nothing in this period. Try a wider filter."} /></div>
      ) : groups.map(([day, list]) => {
        const delivered = list.filter((a) => a.status === "delivered");
        const earned = delivered.reduce((s, a) => s + Number(a.earning), 0);
        return (
          <section key={day} aria-labelledby={`day-${day}`}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 id={`day-${day}`} className="text-sm font-bold text-ink">{dayKeyLabel(day)}</h2>
              <p className="text-xs text-ink-3">{delivered.length} delivered · <span className="font-semibold tabular text-ink">{formatINR(earned)}</span></p>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card shadow-card">
              {list.map((a) => <HistoryRow key={a.id} a={a} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function HistoryRow({ a }: { a: RiderAssignment }) {
  const meta = ASSIGNMENT_META[a.status];
  const delivered = a.status === "delivered";
  const cod = a.order.payment_method === "cod" && Number(a.cod_amount) > 0;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">{a.order.order_number}</p>
          <Badge tone={meta.tone} size="xs">{meta.label}</Badge>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(assignmentWhen(a))}</span>
          <span className="inline-flex items-center gap-1"><Route className="h-3 w-3" />{formatKm(a.distance_km)}</span>
          {delivered && cod ? <span className="inline-flex items-center gap-1 text-saffron-700"><Banknote className="h-3 w-3" />COD {formatINR(a.cod_amount)}</span> : null}
        </p>
      </div>
      <p className={"shrink-0 text-base font-bold tabular " + (delivered ? "text-brand-700" : "text-ink-4 line-through")}>{formatINR(a.earning)}</p>
    </li>
  );
}
