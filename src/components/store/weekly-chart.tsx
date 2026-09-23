import { formatINR } from "@/lib/utils";

/**
 * Seven-day orders/revenue bars without a chart library. Fills gaps so the axis always shows
 * the last 7 IST days, oldest to newest.
 */
export function WeeklyChart({ weekly, metric = "orders" }: { weekly: { day: string; orders: number; revenue: number }[]; metric?: "orders" | "revenue" }) {
  const byDay = new Map(weekly.map((w) => [w.day, w]));
  const days: { key: string; label: string; orders: number; revenue: number }[] = [];
  const istToday = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) + "T00:00:00Z");
  for (let i = 6; i >= 0; i--) {
    const d = new Date(istToday); d.setUTCDate(istToday.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10); const w = byDay.get(key);
    days.push({ key, label: new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(d), orders: w?.orders ?? 0, revenue: Number(w?.revenue ?? 0) });
  }
  const max = Math.max(1, ...days.map((d) => (metric === "orders" ? d.orders : d.revenue)));
  return (
    <div>
      <div className="flex h-36 items-end gap-2" role="img" aria-label={`Last 7 days ${metric}`}>
        {days.map((d) => {
          const v = metric === "orders" ? d.orders : d.revenue; const h = Math.round((v / max) * 100);
          return (
            <div key={d.key} className="group flex flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${d.orders} orders · ${formatINR(d.revenue)}`}>
              <span className="text-[10px] font-semibold tabular text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">{metric === "orders" ? d.orders : formatINR(d.revenue)}</span>
              <div className="flex w-full items-end justify-center" style={{ height: 100 }}>
                <div className={v > 0 ? "w-full max-w-9 rounded-t-sm bg-brand-500 transition-[height]" : "w-full max-w-9 rounded-t-sm bg-line"} style={{ height: `${Math.max(v > 0 ? 6 : 3, h)}%` }} />
              </div>
              <span className="text-[11px] font-medium text-ink-3">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
