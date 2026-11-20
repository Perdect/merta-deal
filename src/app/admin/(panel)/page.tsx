import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BellRing, Bike, CircleAlert, Clock, IndianRupee, Inbox, LifeBuoy, PackageCheck, PackageMinus, PackageSearch, PackageX, RotateCcw, ShoppingBag, Smartphone, Star, Timer, TimerOff, Truck, UserX, CheckCircle2, type LucideIcon } from "lucide-react";
import { getAttentionItems, spGet, type SP } from "@/lib/data/admin";
import { getToday, getLateOrders, getUnconfirmed, getOrderExceptions, getUpiWaiting, getDispatchAlerts, getStockAlerts, getPeriod, getRecentOrders, getLiveCounts, loaded, pctChange, ACTIVE_STATUSES, RANGE_OPTIONS, type RangeKey, type LiveCounts, type OrderException } from "@/lib/data/admin-dashboard";
import { AdminPageHeader, Panel, MetricCard, ActionRow, DataTable, CellStack, RowLink, EmptyBlock, TrendChart, BreakdownBar, RangePicker, OrderStatusPill, PaymentStatusPill, paymentMethodLabel, ORDER_STATUS_COLOR, rupees } from "@/components/admin/kit";
import { dayLabel } from "@/components/admin/bar-chart";
import { minutesLabel } from "@/components/admin/order-summary";
import { ORDER_STATUS_META, type OrderStatus } from "@/lib/order-status";
import { cn, formatINR, formatNumber, formatDateTime, minutesUntil, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rangeKey = (RANGE_OPTIONS.some((r) => r.value === spGet(sp, "range")) ? spGet(sp, "range") : "14d") as RangeKey;
  // The attention reads run with the rest of the page; each is wrapped so one failed read becomes a
  // "couldn't load" row for its own line instead of an empty list or an error page.
  const [today, attentionR, lateR, unconfirmedR, exceptionsR, upi, dispatchR, stockR, period, recent, live] = await Promise.all([
    getToday(), loaded(getAttentionItems()), loaded(getLateOrders()), loaded(getUnconfirmed(5)), loaded(getOrderExceptions()), getUpiWaiting(),
    loaded(getDispatchAlerts()), loaded(getStockAlerts()), getPeriod(rangeKey), getRecentOrders(8), getLiveCounts(),
  ]);

  const r = period.report; const p = period.previous;
  const vsYesterday = "vs. same time yesterday";
  const prevLabel = `vs. previous ${RANGE_OPTIONS.find((o) => o.value === rangeKey)?.label}`;

  const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;
  /** The first `n` of a list as one line, then how many more there are (`total` when the list itself is only a page of them). */
  const first = <T,>(list: T[], n: number, text: (x: T) => string, total = list.length) => { const shown = list.slice(0, n); return shown.map(text).join(", ") + (shown.length && total > shown.length ? ` +${formatNumber(total - shown.length)} more` : ""); };
  const failed = (key: string, href: string, icon: LucideIcon, what: string): AttentionRow => ({ key, href, icon, title: `Couldn't load ${what}`, detail: "Not counted here. Reload the page, or open the list to check.", tone: "amber" });

  /* ---- Orders and payments ---- */
  const orderRows: AttentionRow[] = [];
  if (!lateR.ok) orderRows.push(failed("late", "/admin/orders?status=active&late=1", Timer, "late orders"));
  else if (lateR.data.count) orderRows.push({ key: "late", href: "/admin/orders?status=active&late=1", icon: Timer, tone: "red", count: lateR.data.count,
    title: `${lateR.data.count === 1 ? "Order" : "Orders"} past the promised time`,
    detail: first(lateR.data.items, 3, (o) => `${o.order_number} · ${ORDER_STATUS_META[o.status].short} · ${minutesLabel(minutesUntil(o.promised_at) ?? 0)} late`, lateR.data.count) });

  const waiting = attentionR.ok ? attentionR.data.unassignedReady : [];
  const waitingIds = new Set(waiting.map((o) => o.id));
  const exceptionOf = new Map((exceptionsR.ok ? exceptionsR.data : []).map((o) => [o.id, o.exception]));
  if (!attentionR.ok) orderRows.push(failed("attention", "/admin/orders?status=ready", Bike, "packed orders, refunds, tickets and reviews"));
  else if (waiting.length) orderRows.push({ key: "ready", href: "/admin/orders?status=ready", icon: Bike, tone: "red", count: waiting.length,
    title: "Packed orders waiting for a rider",
    detail: first(waiting, 3, (o) => `${o.order_number} · ready ${timeAgo(o.ready_at ?? o.created_at)}${exceptionOf.get(o.id) === "no_rider" ? " · no rider in range" : ""}`) });

  if (!exceptionsR.ok) orderRows.push(failed("exceptions", "/admin/orders?status=exceptions", CircleAlert, "order exceptions"));
  else {
    const of = (kind: string) => exceptionsR.data.filter((o) => o.exception === kind);
    const since = (o: OrderException) => `${o.order_number}${o.exception_at ? ` · ${timeAgo(o.exception_at)}` : ""}`;
    const add = (kind: string, list: OrderException[], icon: LucideIcon, title: string, tone: "red" | "amber") => { if (list.length) orderRows.push({ key: `exception-${kind}`, href: "/admin/orders?status=exceptions", icon, tone, count: list.length, title, detail: first(list, 3, since) }); };
    add("delivery_failed", of("delivery_failed"), PackageX, "Deliveries the rider could not complete", "red");
    add("unattended", of("unattended"), BellRing, "New orders nobody has accepted", "red");
    add("item_exception", of("item_exception"), PackageSearch, "Item unavailable · waiting for the customer's answer", "amber");
    // "No rider in range" is already said on the packed-orders row above; only orders that row cannot show get their own line.
    add("no_rider", of("no_rider").filter((o) => !attentionR.ok || !waitingIds.has(o.id)), UserX, "Dispatch found no rider in range", "red");
    const known = ["delivery_failed", "unattended", "item_exception", "no_rider"];
    add("other", exceptionsR.data.filter((o) => !known.includes(o.exception)), CircleAlert, "Orders flagged with another exception", "amber");
  }

  const upiCount = (upi.orders?.length ?? 0) + (upi.rider?.length ?? 0);
  if (upiCount) orderRows.push({ key: "upi", href: "/admin/payments", icon: Smartphone, tone: "amber", count: upiCount,
    title: `UPI ${upiCount === 1 ? "payment" : "payments"} waiting for your confirmation`,
    detail: [
      ...(upi.orders ?? []).slice(0, 3).map((x) => `${x.order_number} · ${formatINR(x.amount)} · ${x.claimed_at ? "customer says paid" : "customer has not confirmed"}`),
      ...(upi.rider ?? []).slice(0, 2).map((x) => `${x.order_number} · ${formatINR(x.amount)} · taken by the rider`),
    ].join(", ") });
  if (upi.orders === null || upi.rider === null) orderRows.push(failed("upi-failed", "/admin/payments", Smartphone, upi.orders === null && upi.rider === null ? "UPI payments to confirm" : upi.orders === null ? "UPI orders waiting for payment" : "UPI collected by riders"));

  // An order waiting on a direct UPI payment is also "placed"; it is listed once, on the UPI row.
  if (!unconfirmedR.ok) orderRows.push(failed("placed", "/admin/orders?status=placed", Clock, "unconfirmed orders"));
  else {
    const upiIds = new Set((upi.orders ?? []).map((x) => x.order_id));
    const cutoff = new Date(unconfirmedR.data.cutoff).getTime();
    const overlap = (upi.orders ?? []).filter((x) => new Date(x.placed_at).getTime() < cutoff).length;
    const others = Math.max(0, unconfirmedR.data.count - overlap);
    if (others) orderRows.push({ key: "placed", href: "/admin/orders?status=placed", icon: Clock, tone: "amber", count: others,
      title: `Orders not confirmed for over ${unconfirmedR.data.minutes} minutes`,
      detail: first(unconfirmedR.data.items.filter((o) => !upiIds.has(o.id)), 3, (o) => `${o.order_number} · placed ${timeAgo(o.created_at)}`, others) || undefined });
  }

  if (attentionR.ok && attentionR.data.refundsPending.length) orderRows.push({ key: "refunds", href: "/admin/payments?tab=refunds", icon: RotateCcw, tone: "red", count: attentionR.data.refundsPending.length,
    title: "Refunds to issue",
    detail: first(attentionR.data.refundsPending, 3, (x) => `${x.order?.order_number ?? "Order"} · ${formatINR(Number(x.amount) - Number(x.refund_amount))}`) });

  /* ---- Riders and dispatch ---- */
  const riderRows: AttentionRow[] = [];
  if (!dispatchR.ok) riderRows.push(failed("dispatch", "/admin/riders", Bike, "rider availability and offers"));
  else {
    const d = dispatchR.data;
    if (d.packed && d.online === 0) riderRows.push({ key: "no-rider-online", href: "/admin/riders", icon: UserX, tone: "red", count: d.packed,
      title: "No rider is online", detail: `${plural(d.packed, "packed order is", "packed orders are")} waiting and nobody can take ${d.packed === 1 ? "it" : "them"}` });
    else if (d.packed && d.free === 0) riderRows.push({ key: "riders-busy", href: "/admin/riders", icon: Bike, tone: "amber", count: d.packed,
      title: `${d.online === 1 ? "The only rider online is" : `All ${formatNumber(d.online)} riders online are`} on a delivery`, detail: `${plural(d.packed, "packed order is", "packed orders are")} waiting for a free rider` });
    if (d.unanswered.length) riderRows.push({ key: "offers", href: "/admin/orders?status=ready", icon: TimerOff, tone: "amber", count: d.timedOut + d.declined,
      title: d.timedOut ? "Rider offers ran out with no answer" : "Rider offers were declined",
      detail: first(d.unanswered, 3, (o) => `${o.order_number} · ${[o.timedOut ? `${o.timedOut} timed out` : "", o.declined ? `${o.declined} declined` : ""].filter(Boolean).join(", ")}`) });
  }

  /* ---- Stock ---- */
  const stockRows: AttentionRow[] = [];
  if (!stockR.ok) stockRows.push(failed("stock", "/admin/inventory", PackageX, "stock alerts"));
  else {
    const st = stockR.data;
    if (st.out) stockRows.push({ key: "out", href: "/admin/inventory?filter=out", icon: PackageX, tone: "red", count: st.out, title: `${st.out === 1 ? "Listing" : "Listings"} out of stock`, detail: first(st.outNames, 3, (n) => n, st.out) || undefined });
    if (st.low) stockRows.push({ key: "low", href: "/admin/inventory?filter=low", icon: PackageMinus, tone: "amber", count: st.low, title: `${st.low === 1 ? "Listing" : "Listings"} at or below ${st.low === 1 ? "its" : "their"} low-stock level`, detail: first(st.lowNames, 3, (n) => n, st.low) || undefined });
  }

  /* ---- Customer care ---- */
  const careRows: AttentionRow[] = [];
  if (attentionR.ok && attentionR.data.openTickets.length) careRows.push({ key: "tickets", href: "/admin/support?status=open_all", icon: LifeBuoy, tone: "amber", count: attentionR.data.openTickets.length, title: "Open support tickets", detail: first(attentionR.data.openTickets, 2, (t) => `${t.ticket_number} · ${t.subject}`) });
  if (attentionR.ok && attentionR.data.pendingReviews) careRows.push({ key: "reviews", href: "/admin/reviews", icon: Star, tone: "blue", count: attentionR.data.pendingReviews, title: "Reviews to moderate" });

  const groups = [
    { label: "Orders and payments", rows: orderRows },
    { label: "Riders and dispatch", rows: riderRows },
    { label: "Stock", rows: stockRows },
    { label: "Customer care", rows: careRows },
  ].filter((g) => g.rows.length);
  const attentionCount = groups.reduce((n, g) => n + g.rows.length, 0);
  const anyFailed = [...orderRows, ...riderRows, ...stockRows].some((x) => x.count == null);
  // The headline figure counts each order once, however many rows it sits in (late and unassigned, say).
  // Lists are read a page at a time, so anything beyond the page is added from that read's own count.
  const flagged = new Set<string>([
    ...(lateR.ok ? lateR.data.items.map((o) => o.id) : []),
    ...waiting.map((o) => o.id),
    ...(exceptionsR.ok ? exceptionsR.data.map((o) => o.id) : []),
    ...(upi.orders ?? []).map((x) => x.order_id), ...(upi.rider ?? []).map((x) => x.order_id),
    ...(unconfirmedR.ok ? unconfirmedR.data.items.map((o) => o.id) : []),
    ...(attentionR.ok ? attentionR.data.refundsPending.map((x) => x.order_id) : []),
  ]);
  const beyondPage = (lateR.ok ? Math.max(0, lateR.data.count - lateR.data.items.length) : 0) + (unconfirmedR.ok ? Math.max(0, unconfirmedR.data.count - unconfirmedR.data.items.length) : 0);
  const needsAttention = flagged.size + beyondPage;

  const statusItems = (Object.keys(ORDER_STATUS_META) as OrderStatus[])
    .map((s) => ({ label: ORDER_STATUS_META[s].label, value: period.statusCounts[s] ?? 0, color: ORDER_STATUS_COLOR[s], href: `/admin/orders?status=${s}&from=${period.start}&to=${period.end}` }))
    .filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const statusTotal = statusItems.reduce((a, i) => a + i.value, 0);

  return (
    <>
      <AdminPageHeader title="Dashboard" description={`Today's operations and how the business is trending. Times are IST.`} actions={<Link href="/admin/orders?status=active" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white hover:bg-brand-700"><ShoppingBag className="h-4 w-4" aria-hidden />Active orders</Link>} />

      {/* 1. What needs a hand right now; 2. the live order pipeline; 3. today's figures; 4. trends and lists. */}
      {attentionCount ? (
        <Panel id="attention" title={`Needs attention · ${attentionCount}`} description="What you can act on now, grouped by where it is fixed. Tap a row to open that screen." flush className="mb-4 border-warning/50">
          <div className="space-y-1 px-2 pb-2 pt-1">
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h3 className="px-2 pb-0.5 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">{g.label}</h3>
                <div className="grid gap-x-4 md:grid-cols-2">{g.rows.map(({ key, ...row }) => <ActionRow key={key} {...row} />)}</div>
              </section>
            ))}
          </div>
        </Panel>
      ) : (
        <p id="attention" className="mb-4 flex items-start gap-2 rounded-xl border border-success/25 bg-success-50 px-4 py-2.5 text-sm font-medium text-success"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />All clear: no late, unassigned or flagged orders, no payments or refunds to settle, no stock alerts, and no tickets or reviews waiting.</p>
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
        <MetricCard label="Orders needing attention" period="Right now" value={formatNumber(needsAttention)} icon={AlertTriangle} tone={needsAttention || anyFailed ? "attention" : "default"} href="#attention"
          hint={anyFailed ? "Some checks could not be loaded; see the list above" : needsAttention ? "Late, unassigned, flagged, or with a payment or refund to settle" : "Nothing waiting"} />
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

type AttentionRow = { key: string; href: string; icon: LucideIcon; title: string; detail?: string; tone: "red" | "amber" | "blue"; /** Absent on a row that says its own read failed. */ count?: number };

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
        <li><Link href="/admin/payments" className={cn(chip, live.upiToConfirm ? "border-warning/50 bg-warning-50 text-warning" : "border-line bg-card hover:border-brand-300")}><Smartphone className="h-4 w-4" aria-hidden /><span><span className="font-display font-bold tabular">{live.upiToConfirm}</span> UPI {live.upiToConfirm === 1 ? "payment" : "payments"} to confirm</span></Link></li>
        <li><Link href="/admin/requests" className={cn(chip, live.newRequests ? "border-info/40 bg-info-50 text-info" : "border-line bg-card hover:border-brand-300")}><Inbox className="h-4 w-4" aria-hidden /><span><span className="font-display font-bold tabular">{live.newRequests}</span> new {live.newRequests === 1 ? "request" : "requests"}</span></Link></li>
      </ul>
    </div>
  );
}
