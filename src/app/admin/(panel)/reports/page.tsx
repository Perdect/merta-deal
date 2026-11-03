import type { Metadata } from "next";
import Link from "next/link";
import { Bike, Clock, FolderTree, IndianRupee, Package, Receipt, ShoppingBag, Ticket, Truck, UserPlus, Wallet, XCircle } from "lucide-react";
import { getReport, spGet, type SP, type AdminReport } from "@/lib/data/admin";
import { pctChange } from "@/lib/data/admin-dashboard";
import { AdminPageHeader, Panel, MetricCard, DataTable, CellStack, EmptyBlock, ErrorBlock, TrendChart, BreakdownBar, paymentMethodLabel, rupees, rupeesRounded } from "@/components/admin/kit";
import { ReportRangeControls, ReportExportButton } from "@/components/admin/report-view";
import { rangeLabel } from "@/components/admin/care/shared";
import { dayLabel } from "@/components/admin/bar-chart";
import type { Enums } from "@/types/database";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(asDate(s).getTime());
function istTodayIso() { const t = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }
function daysBetween(start: string, end: string) { const out: string[] = []; for (let t = asDate(start).getTime(); t <= asDate(end).getTime(); t += DAY) out.push(iso(new Date(t))); return out; }

const METHOD_COLOR: Record<string, string> = { cod: "#e0a100", upi: "#329537", card: "#2563eb", netbanking: "#8b5cf6", wallet: "#329537", razorpay: "#60a5fa" };
const tableCls = "rounded-none border-0 border-t shadow-none";

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = istTodayIso();
  let start = valid(spGet(sp, "start")) ? spGet(sp, "start") : iso(new Date(asDate(today).getTime() - 29 * DAY));
  let end = valid(spGet(sp, "end")) ? spGet(sp, "end") : today;
  if (end < start) [start, end] = [end, start];
  const length = daysBetween(start, end).length;
  const prevEnd = iso(new Date(asDate(start).getTime() - DAY));
  const prevStart = iso(new Date(asDate(prevEnd).getTime() - (length - 1) * DAY));

  const [report, prevRaw] = await Promise.all([getReport(start, end), getReport(prevStart, prevEnd)]);
  const prev: AdminReport | null = prevRaw && prevRaw.orders > 0 ? prevRaw : null;
  const year = Number(today.slice(0, 4));
  const period = rangeLabel(start, end, year);
  const vs = `vs. ${rangeLabel(prevStart, prevEnd, year)}`;
  const change = (curr: number, before: number | undefined, goodWhenUp = true) => {
    const pct = prev ? pctChange(curr, before) : null;
    return pct == null ? null : { pct, label: vs, goodWhenUp };
  };

  return (
    <>
      <AdminPageHeader title="Reports" description="Orders, money and rider performance for any date range. Export to CSV for accounting."
        actions={<ReportExportButton report={report} start={start} end={end} />} />
      <ReportRangeControls start={start} end={end} today={today} />

      {!report ? (
        <ErrorBlock title="Couldn't build the report" description={`The report for ${period} didn't load. Check the dates and try again.`} retryHref={`/admin/reports?start=${start}&end=${end}`} />
      ) : (() => {
        const r = report;
        const byDay = new Map(r.daily.map((d) => [d.day, d]));
        const points = daysBetween(start, end).map((d) => ({ label: dayLabel(d), orders: Number(byDay.get(d)?.orders ?? 0), sales: Number(byDay.get(d)?.gmv ?? 0) }));
        const methods = Object.entries(r.payment_methods).map(([k, v]) => ({ label: paymentMethodLabel(k as Enums<"payment_method">, true), value: Number(v), color: METHOD_COLOR[k] ?? "#7a837e" })).sort((a, b) => b.value - a.value);
        const methodTotal = methods.reduce((a, m) => a + m.value, 0);
        const cancelRate = r.orders ? Math.round((r.cancelled / r.orders) * 100) : null;
        const cancelChange = change(r.cancelled, prev?.cancelled, false);
        return (
          <>
            {!prev ? <p className="-mt-2 mb-3 text-xs text-ink-4">No comparison shown: the previous {length === 1 ? "day" : `${length} days`} ({rangeLabel(prevStart, prevEnd, year)}) had no orders.</p> : null}

            <h2 className="mb-2 text-[13px] font-semibold text-ink-2">Orders and sales</h2>
            <section aria-label="Orders and sales" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard label="Orders" period={period} value={formatNumber(r.orders)} icon={ShoppingBag} hint={`${formatNumber(r.delivered)} delivered · ${formatNumber(r.cancelled)} cancelled`} change={change(r.orders, prev?.orders)} />
              <MetricCard label="Sales" period={period} value={rupeesRounded(r.gmv)} icon={IndianRupee} hint="Excludes cancelled orders" change={change(Number(r.gmv), prev ? Number(prev.gmv) : undefined)} />
              <MetricCard label="Avg order value" period={period} value={rupeesRounded(r.avg_order_value)} icon={Receipt} change={change(Number(r.avg_order_value), prev ? Number(prev.avg_order_value) : undefined)} />
              <MetricCard label="Cancellation rate" period={period} value={cancelRate == null ? "—" : `${cancelRate}%`} icon={XCircle} hint={`${formatNumber(r.cancelled)} cancelled or rejected`} tone={cancelRate ? "attention" : "default"} change={cancelChange ? { ...cancelChange, label: `cancelled orders ${vs}` } : null} />
            </section>

            <h2 className="mb-2 mt-5 text-[13px] font-semibold text-ink-2">Money <span className="font-normal text-ink-4">· delivered orders</span></h2>
            <section aria-label="Money" className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
              <MetricCard label="Net revenue" period={period} value={rupeesRounded(r.net_revenue)} icon={Wallet} hint="Order totals − rider pay" change={change(Number(r.net_revenue), prev ? Number(prev.net_revenue) : undefined)} />
              <MetricCard label="Item sales" period={period} value={rupeesRounded(r.item_sales)} icon={IndianRupee} hint="After coupon discounts" change={change(Number(r.item_sales), prev ? Number(prev.item_sales) : undefined)} />
              <MetricCard label="Delivery fees" period={period} value={rupeesRounded(r.delivery_fees)} icon={Truck} hint={`Rider pay ${rupeesRounded(r.rider_earnings)}`} />
              <MetricCard label="Platform fees" period={period} value={rupeesRounded(r.platform_fees)} icon={Receipt} hint={`GST on fees ${rupees(r.taxes)}`} />
              <MetricCard label="Coupon discounts" period={period} value={rupeesRounded(r.coupon_discounts)} icon={Ticket} hint="Excludes cancelled orders" />
            </section>

            <h2 className="mb-2 mt-5 text-[13px] font-semibold text-ink-2">Customers and delivery</h2>
            <section aria-label="Customers and delivery" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard label="New customers" period={period} value={formatNumber(r.new_customers)} icon={UserPlus} hint="Sign-ups in the range" change={change(r.new_customers, prev?.new_customers)} />
              <MetricCard label="Avg delivery time" period={period} value={r.avg_delivery_minutes != null ? `${r.avg_delivery_minutes} min` : "—"} icon={Clock} hint={r.avg_delivery_minutes != null ? "Order placed to delivered" : "No delivered orders"} change={r.avg_delivery_minutes != null && prev?.avg_delivery_minutes != null ? change(r.avg_delivery_minutes, prev.avg_delivery_minutes, false) : null} />
            </section>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Panel title="Orders and sales by day" description={`${period} · orders exclude cancelled`}>
                <TrendChart points={points} />
              </Panel>
              <Panel title="Payment methods" description={`${period} · orders, excluding cancelled`}>
                <BreakdownBar items={methods} total={methodTotal} />
              </Panel>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <Panel title="Top products" description={`${period} · by revenue`} flush>
                <DataTable caption="Top products" className={tableCls} maxHeight={null} rows={r.top_products} rowKey={(p) => p.product_id}
                  empty={<EmptyBlock icon={Package} title="No products sold in this range" />}
                  columns={[
                    { key: "name", header: "Product", render: (p) => <CellStack primary={p.name} href={`/admin/products/${p.product_id}`} /> },
                    { key: "qty", header: "Sold", align: "right", hideBelow: "sm", render: (p) => <span className="tabular text-ink-2">{formatNumber(p.quantity)}</span> },
                    { key: "orders", header: "Orders", align: "right", hideBelow: "md", render: (p) => <span className="tabular text-ink-3">{formatNumber(p.orders)}</span> },
                    { key: "rev", header: "Revenue", align: "right", render: (p) => <span className="font-semibold tabular">{rupeesRounded(p.revenue)}</span> },
                  ]} />
              </Panel>
              <Panel title="Top categories" description={`${period} · by sales`} flush>
                <DataTable caption="Top categories" className={tableCls} maxHeight={null} rows={r.top_categories} rowKey={(c) => c.category_id}
                  empty={<EmptyBlock icon={FolderTree} title="No sales in this range" />}
                  columns={[
                    { key: "name", header: "Category", render: (c) => <CellStack primary={c.name} href={`/admin/products?category=${c.category_id}`} /> },
                    { key: "qty", header: "Sold", align: "right", render: (c) => <span className="tabular text-ink-2">{formatNumber(c.quantity)}</span> },
                    { key: "rev", header: "Sales", align: "right", render: (c) => <span className="font-semibold tabular">{rupeesRounded(c.revenue)}</span> },
                  ]} />
              </Panel>
            </div>

            <Panel className="mt-4" title="Rider performance" description={`${period} · deliveries completed in the range`} flush>
              <DataTable caption="Rider performance" className={tableCls} maxHeight={null} rows={r.riders} rowKey={(x) => x.rider_id}
                empty={<EmptyBlock icon={Bike} title="No deliveries in this range" />}
                columns={[
                  { key: "name", header: "Rider", render: (x) => <CellStack primary={x.name ?? "Rider"} href={`/admin/riders/${x.rider_id}`} /> },
                  { key: "deliv", header: "Deliveries", align: "right", render: (x) => <span className="tabular font-medium text-ink">{formatNumber(x.deliveries)}</span> },
                  { key: "mins", header: "Avg time", align: "right", hideBelow: "md", render: (x) => <span className="tabular text-ink-2">{x.avg_minutes != null ? `${x.avg_minutes} min` : "—"}</span> },
                  { key: "km", header: "Distance", align: "right", hideBelow: "lg", render: (x) => <span className="tabular text-ink-3">{Number(x.distance_km).toFixed(1)} km</span> },
                  { key: "rating", header: "Rating", align: "right", hideBelow: "lg", render: (x) => <span className="tabular text-ink-3">{Number(x.rating) ? Number(x.rating).toFixed(1) : "—"}</span> },
                  { key: "earn", header: "Earnings", align: "right", render: (x) => <span className="font-semibold tabular">{rupeesRounded(x.earnings)}</span> },
                ]} />
            </Panel>
            <p className="mt-4 text-xs text-ink-4">Figures come straight from orders and deliveries; nothing is estimated. <Link href="/admin/payouts/riders" className="font-medium text-brand-700 hover:underline">Rider payouts</Link> settle what riders are owed.</p>
          </>
        );
      })()}
    </>
  );
}
