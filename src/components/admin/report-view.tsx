"use client";
import * as React from "react";
import { Download } from "lucide-react";
import { useQueryState } from "@/components/admin/kit";
import { toast } from "@/components/ui/toast";
import { btn } from "@/components/admin/care/shared";
import type { AdminReport } from "@/lib/data/admin";
import { cn } from "@/lib/utils";

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const istToday = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

/** Date range for the report (IST days), kept in the URL as ?start=&end=. Presets apply immediately. */
export function ReportRangeControls({ start, end, today }: { start: string; end: string; today: string }) {
  const { set, pending } = useQueryState();
  const [s, setS] = React.useState(start); const [e, setE] = React.useState(end);
  const [prev, setPrev] = React.useState(`${start}|${end}`);
  if (prev !== `${start}|${end}`) { setPrev(`${start}|${end}`); setS(start); setE(end); }
  const error = !s || !e ? "Choose both dates." : e < s ? "The end date must be on or after the start date." : e > today ? "The end date can't be in the future." : null;
  const go = (from: string, to: string) => set({ start: from, end: to }, { replace: false });
  const preset = (kind: "7" | "30" | "90" | "month") => {
    const t = istToday(); const f = new Date(t);
    if (kind === "month") f.setDate(1); else f.setDate(t.getDate() - Number(kind) + 1);
    go(isoDay(f), isoDay(t));
  };
  const dirty = s !== start || e !== end;
  const inputCls = "h-9 rounded-lg border border-line-2 bg-card px-2.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger";
  return (
    <form noValidate onSubmit={(ev) => { ev.preventDefault(); if (!error) go(s, e); }} className="mb-4 rounded-xl border border-line bg-card px-4 py-3 shadow-card" aria-label="Report period">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="text-xs font-medium text-ink-3">From<input type="date" value={s} max={today} onChange={(x) => setS(x.target.value)} aria-invalid={Boolean(error && dirty)} className={cn(inputCls, "mt-1 block w-[150px]")} /></label>
        <label className="text-xs font-medium text-ink-3">To<input type="date" value={e} max={today} onChange={(x) => setE(x.target.value)} aria-invalid={Boolean(error && dirty)} className={cn(inputCls, "mt-1 block w-[150px]")} /></label>
        <button type="submit" className={btn.primary} disabled={!dirty || Boolean(error) || pending}>{pending ? "Loading…" : "Apply"}</button>
        <div className="flex flex-wrap gap-1.5 sm:ml-auto" role="group" aria-label="Quick ranges">
          {([["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["month", "This month"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => preset(k)} className="h-8 rounded-full border border-line-2 bg-card px-3 text-xs font-semibold text-ink-2 transition-colors hover:bg-surface-2">{label}</button>
          ))}
        </div>
      </div>
      {error && dirty ? <p className="mt-2 text-xs font-medium text-danger" role="alert">{error}</p> : <p className="mt-2 text-xs text-ink-4">Days are IST. Order figures count orders placed in the range; rider figures count deliveries completed in it.</p>}
    </form>
  );
}

type Cell = string | number | null | undefined;

/** Client-side CSV of everything on the page (no libraries). */
export function ReportExportButton({ report, start, end }: { report: AdminReport | null; start: string; end: string }) {
  const exportAll = () => {
    if (!report) return;
    const r = report;
    const rows: Cell[][] = [
      ["Merta Deal report", `${r.range.start} to ${r.range.end}`], [],
      ["Metric", "Value"], ["Orders", r.orders], ["Delivered", r.delivered], ["Cancelled", r.cancelled], ["GMV", r.gmv], ["Item sales", r.item_sales], ["Delivery fees", r.delivery_fees], ["Platform fees", r.platform_fees], ["GST on fees", r.taxes], ["Rider earnings", r.rider_earnings], ["Coupon discounts", r.coupon_discounts], ["Net revenue", r.net_revenue], ["Avg order value", r.avg_order_value], ["Avg delivery minutes", r.avg_delivery_minutes ?? ""], ["New customers", r.new_customers], [],
      ["Day", "Orders", "GMV", "Cancelled"], ...r.daily.map((d) => [d.day, d.orders, d.gmv, d.cancelled]), [],
      ["Top products", "Quantity", "Revenue", "Orders"], ...r.top_products.map((p) => [p.name, p.quantity, p.revenue, p.orders]), [],
      ["Top categories", "Quantity", "Revenue"], ...r.top_categories.map((c) => [c.name, c.quantity, c.revenue]), [],
      ["Rider", "Deliveries", "Earnings", "Avg minutes", "Distance km", "Rating"], ...r.riders.map((x) => [x.name ?? "", x.deliveries, x.earnings, x.avg_minutes ?? "", x.distance_km, x.rating]), [],
      ["Payment method", "Orders"], ...Object.entries(r.payment_methods).map(([k, v]) => [k, v]),
    ];
    const csv = rows.map((row) => row.map((c) => { const v = c == null ? "" : String(c); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `merta-deal-report-${start}-to-${end}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success("CSV downloaded", `merta-deal-report-${start}-to-${end}.csv`);
  };
  return <button type="button" className={btn.secondary} disabled={!report} onClick={exportAll} title={report ? undefined : "Nothing to export: the report didn't load"}><Download className="h-4 w-4" aria-hidden />Export CSV</button>;
}
