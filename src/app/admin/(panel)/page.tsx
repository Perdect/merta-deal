import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Bike, Clock, IndianRupee, Inbox, LifeBuoy, PackageCheck, RotateCcw, ShoppingBag, Smartphone, Star, Timer, Truck, CheckCircle2 } from "lucide-react";
import { getAttentionItems, spGet, type SP } from "@/lib/data/admin";
import { getToday, getLateOrders, getUnconfirmed, getPeriod, getRecentOrders, getLiveCounts, pctChange, ACTIVE_STATUSES, RANGE_OPTIONS, type RangeKey, type LiveCounts } from "@/lib/data/admin-dashboard";
import { AdminPageHeader, Panel, MetricCard, ActionRow, DataTable, CellStack, RowLink, EmptyBlock, TrendChart, BreakdownBar, RangePicker, OrderStatusPill, PaymentStatusPill, paymentMethodLabel, ORDER_STATUS_COLOR, rupees } from "@/components/admin/kit";
import { dayLabel } from "@/components/admin/bar-chart";
import { ORDER_STATUS_META, type OrderStatus } from "@/lib/order-status";
import { cn, formatINR, formatNumber, formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rangeKey = (RANGE_OPTIONS.some((r) => r.value === spGet(sp, "range")) ? spGet(sp, "range") : "14d") as RangeKey;
  const [today, attention, late, unconfirmed, period, recent, live] = await Promise.all([
    getToday(), getAttentionItems(), getLateOrders(), getUnconfirmed(5), getPeriod(rangeKey), getRecentOrders(8), getLiveCounts(),
  ]);

  const r = period.report; const p = period.previous;
  const vsYesterday = "vs. same time yesterday";
  const prevLabel = `vs. previous ${RANGE_OPTIONS.find((o) => o.value === rangeKey)?.label}`;

  const attentionRows = [
    late.length ? { href: "/admin/orders?status=active&late=1", icon: Timer, title: `${late.length} ${late.length === 1 ? "order is" : "orders are"} past the promised time`, detail: late.slice(0, 3).map((o) => `${o.order_number} · ${ORDER_STATUS_META[o.status].short}`).join(", "), tone: "red" as const, count: late.length } : null,
    attention.unassignedReady.length ? { href: "/admin/orders?status=ready_for_pickup", icon: Bike, title: "Packed orders waiting for a rider", detail: attention.unassignedReady.slice(0, 3).map((o) => `${o.order_number} · ready ${timeAgo(o.ready_at ?? o.created_at)}`).join(", "), tone: "red" as const, count: attention.unassignedReady.length } : null,
    unconfirmed.count ? { href: "/admin/orders?status=placed", icon: Clock, title: "Orders waiting for payment for over 5 minutes", detail: unconfirmed.items.slice(0, 3).map((o) => `${o.order_number} · ${timeAgo(o.created_at)}`).join(", "), tone: "amber" as const, count: unconfirmed.count } : null,
    attention.refundsPending.length ? { href: "/admin/payments?tab=refunds", icon: RotateCcw, title: "Refunds to issue", detail: attention.refundsPending.slice(0, 3).map((x) => `${x.order?.order_number ?? "Order"} · ${formatINR(Number(x.amount) - Number(x.refund_amount))}`).join(", "), tone: "red" as const, count: attention.refundsPending.length } : null,
    attention.openTickets.length ? { href: "/admin/support?status=open_all", icon: LifeBuoy, title: "Open support tickets", detail: attention.openTickets.slice(0, 2).map((t) => `${t.ticket_number} · ${t.subject}`).join(", "), tone: "amber" as const, count: attention.openTickets.length } : null,
    attention.pendingReviews ? { href: "/admin/reviews", icon: Star, title: "Reviews to moderate", tone: "blue" as const, count: attention.pendingReviews } : null,
  ].filter(Boolean) as { href: string; icon: typeof Timer; title: string; detail?: string; tone: "red" | "amber" | "blue"; count: number }[];
  const needsAttention = late.length + attention.unassignedReady.length + unconfirmed.count + attention.refundsPending.length;

  const statusItems = (Object.keys(ORDER_STATUS_META) as OrderStatus[])
    .map((s) => ({ label: ORDER_STATUS_META[s].label, value: period.statusCounts[s] ?? 0, color: ORDER_STATUS_COLOR[s], href: `/admin/orders?status=${s}&from=${period.start}&to=${period.end}` }))
    .filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const statusTotal = statusItems.reduce((a, i) => a + i.value, 0);

  return (
    <>
      <AdminPageHeader title="Dashboard" description={`Today's operations and how the business is trending. Times are IST.`} actions={<Link href="/admin/orders?status=active" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white hover:bg-brand-700"><ShoppingBag className="h-4 w-4" aria-hidden />Active orders</Link>} />

      {/* 1. What needs a hand right now; 2. the live order pipeline; 3. today's figures; 4. trends and lists. */}
      {attentionRows.length ? (
        <Panel id="attention" title={`Needs attention · ${attentionRows.length}`} description="Issues you can act on now, most urgent first" flush className="mb-4 border-warning/50">
          <div className="grid gap-x-4 px-2 pb-2 md:grid-cols-2">{attentionRows.map((a) => <ActionRow key={a.title} {...a} />)}</div>
        </Panel>
      ) : (
        <p id="attention" className="mb-4 flex items-center gap-2 rounded-xl border border-success/25 bg-success-50 px-4 py-2.5 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />All clear: no late or unassigned orders, refunds, tickets or reviews waiting.</p>
      )}

      <Panel title="Right now" description="Live orders by stage · tap a stage to open those orders" className="mb-4">
        <Pipeline live={live} />
      </Panel>

      <section aria-label="Today" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Orders" period="Today so far" value={formatNumber(today.orders)} icon={ShoppingBag} href="/admin/orders"
          change={pctChange(today.orders, today.ordersSameTimeYesterday) != null ? { pct: pctChange(today.orders, today.ordersSameTimeYesterday)!, label: vsYesterday } : null}
          hint={today.ordersSameTimeYesterday == null ? "No orders by this time yesterday" : undefined} />
        <MetricCard label="Sales" period="Today so far, excl. cancelled" value={formatINR(Math.round(today.sales))} icon={IndianRupee}
          change={pctChange(today.sales, today.salesSameTimeYesterday) != null ? { pct: pctChange(today.sales, today.salesSameTimeYesterday)!, label: vsYesterday } : null} />
        <MetricCard label="Active deliveries" period="Right now" value={formatNumber(today.activeDeliveries)} icon={Truck} href="/admin/orders?status=out_for_delivery"
          hint={`${today.awaitingRider} packed, awaiting rider · ${today.onlineRiders} ${today.onlineRiders === 1 ? "rider" : "riders"} online`} />
        <MetricCard label="Needs attention" period="Right now" value={formatNumber(needsAttention)} icon={AlertTriangle} tone={needsAttention ? "attention" : "default"} href="#attention"
          hint={needsAttention ? "Late, unassigned, unconfirmed or refunds" : "Nothing waiting"} />
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Sales and orders" description={`${period.label} · ${dayLabel(period.start)} to ${dayLabel(period.end)}`}
          actions={<RangePicker value={rangeKey} options={RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />}>
          {r ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Total label="Sales" value={formatINR(Math.round(Number(r.gmv)))} change={pctChange(Number(r.gmv), p ? Number(p.gmv) : null)} prevLabel={prevLabel} hasPrev={Boolean(p)} />
                <Total label="Orders" value={formatNumber(r.orders)} change={pctChange(r.orders, p?.orders)} prevLabel={prevLabel} hasPrev={Boolean(p)} />
                <Total label="Avg order value" value={formatINR(Math.round(Number(r.avg_order_value)))} change={pctChange(Number(r.avg_order_value), p ? Number(p.avg_order_value) : null)} prevLabel={prevLabel} hasPrev={Boolean(p)} />
                <Total label="Cancelled" value={formatNumber(r.cancelled)} change={pctChange(r.cancelled, p?.cancelled)} prevLabel={prevLabel} goodWhenUp={false} hasPrev={Boolean(p)} />
              </div>
              <TrendChart points={period.daily.map((d) => ({ label: dayLabel(d.day), orders: d.orders, sales: d.sales }))} />
              {!p ? <p className="mt-2 text-xs text-ink-4">No comparison shown: the previous {RANGE_OPTIONS.find((o) => o.value === rangeKey)?.label} had no orders.</p> : null}
            </>
          ) : <EmptyBlock title="Couldn't load the trend" description="The report function did not respond. Reload to try again." action={<a href={`/admin?range=${rangeKey}`} className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white">Retry</a>} />}
        </Panel>

        <Panel title="Order status" description={`${period.label}, by status at the time of viewing`}>
          {statusTotal ? <BreakdownBar items={statusItems} total={statusTotal} /> : <EmptyBlock icon={ShoppingBag} title="No orders in this period" />}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Recent orders" description="Latest 8, all statuses" flush actions={<Link href="/admin/orders" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>}>
          <DataTable caption="Recent orders" maxHeight={null} className="rounded-none border-0 border-t shadow-none" rows={recent} rowKey={(o) => o.id}
            empty={<EmptyBlock icon={ShoppingBag} title="No orders yet" />}
            columns={[
              { key: "order", header: "Order", render: (o) => <CellStack primary={o.order_number} secondary={o.address_snapshot?.full_name ?? "Customer"} href={`/admin/orders?view=${o.id}`} /> },
              { key: "status", header: "Status", render: (o) => <OrderStatusPill status={o.status} /> },
              { key: "payment", header: "Payment", hideBelow: "md", render: (o) => <span className="flex items-center gap-2"><span className="text-xs text-ink-2">{paymentMethodLabel(o.payment_method)}</span><PaymentStatusPill status={o.payment_status} /></span> },
              { key: "total", header: "Total", align: "right", render: (o) => <span className="font-semibold tabular">{rupees(o.total)}</span> },
              { key: "placed", header: "Placed", hideBelow: "sm", render: (o) => <span className="whitespace-nowrap text-xs text-ink-3" title={formatDateTime(o.created_at)}>{timeAgo(o.created_at)}</span> },
              { key: "view", header: <span className="sr-only">Actions</span>, align: "right", hideBelow: "sm", render: (o) => <RowLink href={`/admin/orders?view=${o.id}`} label={`View order ${o.order_number}`} /> },
            ]} />
        </Panel>

        <Panel title="Top products" description={`${period.label} · by sales`} flush>
          {r && r.top_products.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {r.top_products.slice(0, 5).map((t, i) => (
                <li key={t.product_id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span className="w-5 text-xs font-semibold tabular text-ink-4">{i + 1}</span>
                  <Link href={`/admin/products/${t.product_id}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:underline">{t.name}</Link>
                  <span className="hidden text-xs text-ink-3 sm:inline">{formatNumber(t.quantity)} sold</span>
                  <span className="w-24 text-right font-semibold tabular text-ink">{formatINR(Math.round(Number(t.revenue)))}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyBlock icon={PackageCheck} title="No sales in this period yet" />}
        </Panel>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-4"><PackageCheck className="h-3.5 w-3.5" aria-hidden />Figures come straight from orders; nothing here is estimated.</p>
    </>
  );
}

function Total({ label, value, change, prevLabel, goodWhenUp = true, hasPrev }: { label: string; value: string; change: number | null; prevLabel: string; goodWhenUp?: boolean; hasPrev: boolean }) {
  const good = change == null ? null : goodWhenUp ? change >= 0 : change <= 0;
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold tabular text-ink">{value}</p>
      {change != null ? <p className={good ? "text-[11px] font-medium text-success" : "text-[11px] font-medium text-danger"} title={prevLabel}>{change >= 0 ? "Up" : "Down"} {Math.abs(change)}% <span className="font-normal text-ink-4">{prevLabel}</span></p> : <p className="text-[11px] text-ink-4">{hasPrev ? "Zero in the previous period" : "No earlier data"}</p>}
    </div>
  );
}

/**
 * The live order pipeline: one chip per active stage with its count, then riders online, UPI payments
 * waiting for the admin and new service requests. Empty stages stay visible (greyed) so the row reads
 * the same every day; each chip opens the matching list.
 */
function Pipeline({ live }: { live: LiveCounts }) {
  // Stage names for the strip: each distinct, in the order an order moves (the shared "Packing" short label would repeat).
  const STAGE_LABEL: Record<(typeof ACTIVE_STATUSES)[number], string> = { placed: "Placed", confirmed: "Confirmed", preparing: "Packing", ready_for_pickup: "Packed", rider_assigned: "Rider assigned", out_for_delivery: "On the way" };
  const stages = ACTIVE_STATUSES.map((s) => ({ status: s, label: STAGE_LABEL[s], count: live.byStatus[s], href: `/admin/orders?status=${s}`, color: ORDER_STATUS_COLOR[s] }));
  const chip = "flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-600";
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Active orders by stage">
        {stages.map((s) => (
          <li key={s.status}>
            <Link href={s.href} className={cn(chip, s.count ? "border-line bg-card hover:border-brand-300" : "border-dashed border-line bg-surface text-ink-3")}>
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.count ? s.color : "var(--color-line-2)" }} />
              <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
              <span className={cn("font-display text-lg font-bold tabular", s.count ? "text-ink" : "text-ink-4")}>{s.count}</span>
            </Link>
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-2 text-sm" aria-label="People and payments">
        <li><Link href="/admin/riders" className={cn(chip, "border-line bg-card hover:border-brand-300")}><Bike className="h-4 w-4 text-ink-3" aria-hidden /><span><span className="font-display font-bold tabular text-ink">{live.onlineRiders}</span> {live.onlineRiders === 1 ? "rider" : "riders"} online</span></Link></li>
        <li><Link href="/admin/payments" className={cn(chip, live.upiToConfirm ? "border-warning/50 bg-warning-50 text-[#7a5600]" : "border-line bg-card hover:border-brand-300")}><Smartphone className="h-4 w-4" aria-hidden /><span><span className="font-display font-bold tabular">{live.upiToConfirm}</span> UPI {live.upiToConfirm === 1 ? "payment" : "payments"} to confirm</span></Link></li>
        <li><Link href="/admin/requests" className={cn(chip, live.newRequests ? "border-info/40 bg-info-50 text-[#1d4ed8]" : "border-line bg-card hover:border-brand-300")}><Inbox className="h-4 w-4" aria-hidden /><span><span className="font-display font-bold tabular">{live.newRequests}</span> new {live.newRequests === 1 ? "request" : "requests"}</span></Link></li>
      </ul>
    </div>
  );
}
