"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Download, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stat, Card, CardHeader, CardBody } from "@/components/ui/card";
import { BarChart, RankedBars, dayLabel } from "@/components/admin/bar-chart";
import type { AdminReport } from "@/lib/data/admin";
import { PAYMENT_METHOD_LABEL } from "@/lib/order-status";
import { formatINR, formatNumber } from "@/lib/utils";

/** Date-range picker + KPI cards + rankings, with client-side CSV export (no libraries). */
export function ReportView({ report, start, end }: { report: AdminReport | null; start: string; end: string }) {
  const router = useRouter(); const pathname = usePathname();
  const [s, setS] = React.useState(start); const [e, setE] = React.useState(end);
  const apply = (from: string, to: string) => router.push(`${pathname}?start=${from}&end=${to}`);
  const preset = (days: number) => { const t = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; const f = new Date(t); f.setDate(t.getDate() - days + 1); setS(iso(f)); setE(iso(t)); apply(iso(f), iso(t)); };

  const download = (name: string, rows: (string | number | null | undefined)[][]) => {
    const csv = rows.map((r) => r.map((c) => { const v = c == null ? "" : String(c); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${name}-${start}-to-${end}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const exportAll = () => {
    if (!report) return;
    const r = report;
    download("merta-deal-report", [
      ["Merta Deal report", `${r.range.start} to ${r.range.end}`], [],
      ["Metric", "Value"], ["Orders", r.orders], ["Delivered", r.delivered], ["Cancelled", r.cancelled], ["GMV", r.gmv], ["Commission", r.commission], ["Delivery fees", r.delivery_fees], ["Platform fees", r.platform_fees], ["GST on fees", r.taxes], ["Rider earnings", r.rider_earnings], ["Store payouts", r.store_payouts], ["Coupon discounts", r.coupon_discounts], ["Net platform revenue", r.net_revenue], ["Avg order value", r.avg_order_value], ["Avg delivery minutes", r.avg_delivery_minutes ?? ""], ["New customers", r.new_customers], [],
      ["Day", "Orders", "GMV", "Cancelled"], ...r.daily.map((d) => [d.day, d.orders, d.gmv, d.cancelled]), [],
      ["Top products", "Quantity", "Revenue", "Orders"], ...r.top_products.map((p) => [p.name, p.quantity, p.revenue, p.orders]), [],
      ["Top stores", "Orders", "GMV", "Commission", "Cancelled"], ...r.top_stores.map((t) => [t.name, t.orders, t.gmv, t.commission, t.cancelled]), [],
      ["Rider", "Deliveries", "Earnings", "Avg minutes", "Distance km", "Rating"], ...r.riders.map((x) => [x.name ?? "", x.deliveries, x.earnings, x.avg_minutes ?? "", x.distance_km, x.rating]), [],
      ["Payment method", "Orders"], ...Object.entries(r.payment_methods).map(([k, v]) => [k, v]),
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3 sm:flex-row sm:items-end">
        <Input label="From" type="date" value={s} onChange={(x) => setS(x.target.value)} wrapperClassName="sm:w-44" />
        <Input label="To" type="date" value={e} onChange={(x) => setE(x.target.value)} wrapperClassName="sm:w-44" />
        <Button size="sm" onClick={() => apply(s, e)} className="h-11"><Calendar className="h-4 w-4" /> Apply</Button>
        <div className="flex flex-wrap gap-1.5 sm:ml-2">{[7, 30, 90].map((d) => <button key={d} type="button" onClick={() => preset(d)} className="h-9 rounded-full border border-line-2 bg-card px-3 text-xs font-semibold text-ink-2 hover:bg-surface-2">Last {d} days</button>)}</div>
        <Button size="sm" variant="outline" className="h-11 sm:ml-auto" disabled={!report} onClick={exportAll}><Download className="h-4 w-4" /> Export CSV</Button>
      </div>

      {!report ? <p className="rounded-lg border border-line bg-card p-8 text-center text-sm text-ink-3">Could not build the report for this range.</p> : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Orders" value={formatNumber(report.orders)} hint={`${report.delivered} delivered · ${report.cancelled} cancelled`} />
            <Stat label="GMV" value={formatINR(report.gmv)} hint={`AOV ${formatINR(report.avg_order_value)}`} tone="brand" />
            <Stat label="Commission" value={formatINR(report.commission)} hint="On delivered orders" />
            <Stat label="Delivery fees" value={formatINR(report.delivery_fees)} hint={`Rider pay ${formatINR(report.rider_earnings)}`} />
            <Stat label="Platform fees" value={formatINR(report.platform_fees)} hint={`GST on fees ${formatINR(report.taxes, { precise: true })}`} />
            <Stat label="Net revenue" value={formatINR(report.net_revenue)} hint="Commission + fees − rider pay" tone="saffron" />
            <Stat label="Cancellations" value={report.orders ? `${Math.round((report.cancelled / report.orders) * 100)}%` : "—"} hint={`${report.cancelled} orders`} tone={report.cancelled ? "danger" : "neutral"} />
            <Stat label="Store payouts" value={formatINR(report.store_payouts)} hint={`Coupons funded ${formatINR(report.coupon_discounts)}`} />
            <Stat label="Avg delivery" value={report.avg_delivery_minutes != null ? `${report.avg_delivery_minutes} min` : "—"} />
            <Stat label="New customers" value={formatNumber(report.new_customers)} />
            <Stat label="Payment mix" value={<span className="text-sm">{Object.entries(report.payment_methods).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${PAYMENT_METHOD_LABEL[k as keyof typeof PAYMENT_METHOD_LABEL] ?? k} ${v}`).join(" · ") || "—"}</span>} className="col-span-2" />
          </section>

          <Card>
            <CardHeader title="Daily orders & GMV" />
            <CardBody><BarChart points={report.daily.map((d) => ({ label: dayLabel(d.day), value: d.orders, secondary: d.gmv }))} primaryLabel="Orders" secondaryLabel="GMV" secondaryMoney height={180} /></CardBody>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card><CardHeader title="Top products" subtitle="By revenue" /><CardBody><RankedBars money rows={report.top_products.map((p) => ({ label: p.name, value: Number(p.revenue), hint: `${p.quantity} sold`, href: `/admin/products/${p.product_id}` }))} /></CardBody></Card>
            <Card><CardHeader title="Top stores" subtitle="By GMV" /><CardBody><RankedBars money rows={report.top_stores.map((t) => ({ label: t.name, value: Number(t.gmv), hint: `${t.orders} orders · ${formatINR(t.commission)} commission${t.cancelled ? ` · ${t.cancelled} cancelled` : ""}`, href: `/admin/stores/${t.store_id}` }))} /></CardBody></Card>
            <Card><CardHeader title="Rider performance" subtitle="Deliveries completed" /><CardBody>
              {report.riders.length === 0 ? <p className="py-6 text-center text-sm text-ink-3">No deliveries in this range.</p> : (
                <ul className="divide-y divide-line text-sm">{report.riders.map((r) => <li key={r.rider_id} className="flex items-center justify-between gap-2 py-2"><Link href={`/admin/riders/${r.rider_id}`} className="min-w-0 truncate font-medium text-ink hover:underline">{r.name ?? "Rider"}</Link><span className="shrink-0 text-right text-xs text-ink-3"><span className="block font-semibold text-ink">{r.deliveries} deliveries</span>{r.avg_minutes != null ? `${r.avg_minutes} min avg · ` : ""}{Number(r.distance_km).toFixed(1)} km · {formatINR(r.earnings)}</span></li>)}</ul>
              )}
            </CardBody></Card>
          </div>
        </>
      )}
    </div>
  );
}
