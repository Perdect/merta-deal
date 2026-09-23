import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Bike, Package, Store as StoreIcon, Star, LifeBuoy, RotateCcw } from "lucide-react";
import { getAdminStats, getAttentionItems } from "@/lib/data/admin";
import { Stat, Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/misc";
import { BarChart, dayLabel } from "@/components/admin/bar-chart";
import { ORDER_STATUS_META } from "@/lib/order-status";
import type { OrderStatus } from "@/types/app";
import { formatINR, formatNumber, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const [stats, attention] = await Promise.all([getAdminStats(), getAttentionItems()]);
  if (!stats) return <ErrorState title="Could not load dashboard" description="admin_dashboard_stats() failed — check that migrations 0002 and 0009 are applied and you are signed in as an admin." retryHref="/admin" />;
  const daily = fill14(stats.daily);
  const breakdown = Object.entries(stats.status_breakdown ?? {}).sort((a, b) => b[1] - a[1]) as [OrderStatus, number][];
  const attentionCount = attention.pendingStores.length + attention.pendingReviews + attention.openTickets.length + attention.refundsPending.length + attention.unassignedReady.length;

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" subtitle="Live view of Merta Deal — orders, money, partners and what needs a decision." className="px-0" />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Key metrics">
        <Stat label="Total orders" value={formatNumber(stats.total_orders)} hint={`${formatNumber(stats.today_orders)} today`} />
        <Stat label="GMV" value={formatINR(stats.gmv)} hint={`${formatINR(stats.today_gmv)} today`} tone="brand" />
        <Stat label="Platform revenue" value={formatINR(stats.revenue)} hint="Commission + fees − rider pay (delivered)" tone="saffron" />
        <Stat label="Customers" value={formatNumber(stats.customers)} />
        <Stat label="Stores" value={formatNumber(stats.stores)} hint={stats.pending_stores ? <Link href="/admin/stores?status=pending" className="font-semibold text-saffron-700">{stats.pending_stores} pending approval</Link> : "All approved"} />
        <Stat label="Riders" value={formatNumber(stats.riders)} hint={`${stats.online_riders} online now`} tone={stats.online_riders ? "success" : "neutral"} />
        <Stat label="Pending orders" value={formatNumber(stats.pending_orders)} hint={<Link href="/admin/orders?status=active" className="font-semibold text-brand-700">View active</Link>} />
        <Stat label="Cancelled" value={formatNumber(stats.cancelled_orders)} hint={stats.total_orders ? `${Math.round((stats.cancelled_orders / stats.total_orders) * 100)}% of all orders` : undefined} tone={stats.cancelled_orders ? "danger" : "neutral"} />
        <Stat label="Avg delivery" value={stats.avg_delivery_minutes != null ? `${stats.avg_delivery_minutes} min` : "—"} hint="Placed → delivered" />
        <Stat label="On-time" value={stats.on_time_pct != null ? `${stats.on_time_pct}%` : "—"} hint="Delivered before promised time" tone={stats.on_time_pct != null && stats.on_time_pct < 80 ? "danger" : "neutral"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Last 14 days" subtitle="Orders per day with GMV overlay (cancelled excluded)" />
          <CardBody>
            <BarChart points={daily.map((d) => ({ label: dayLabel(d.day), value: d.orders, secondary: d.gmv }))} primaryLabel="Orders" secondaryLabel="GMV" secondaryMoney height={180} />
            <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Order status breakdown">
              {breakdown.length ? breakdown.map(([s, n]) => <Link key={s} href={`/admin/orders?status=${s}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-semibold text-ink-2 hover:bg-surface-2">{ORDER_STATUS_META[s]?.short ?? s}<span className="tabular text-ink-3">{n}</span></Link>) : <span className="text-xs text-ink-3">No orders yet.</span>}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Needs attention" subtitle={attentionCount ? `${attentionCount} items waiting` : "All clear"} action={attentionCount ? <Badge tone="warning"><AlertTriangle className="h-3 w-3" /> {attentionCount}</Badge> : <Badge tone="success">Clear</Badge>} />
          <CardBody className="space-y-3">
            {attention.unassignedReady.length ? (
              <AttentionGroup icon={<Bike className="h-4 w-4" />} title={`${attention.unassignedReady.length} ready, no rider`} href="/admin/orders?status=ready_for_pickup" tone="danger">
                {attention.unassignedReady.slice(0, 4).map((o) => <Row key={o.id} href={`/admin/orders/${o.id}`} primary={o.order_number} secondary={`${o.store?.name ?? "Store"} · ready ${timeAgo(o.ready_at ?? o.created_at)}`} />)}
              </AttentionGroup>
            ) : null}
            {attention.pendingStores.length ? (
              <AttentionGroup icon={<StoreIcon className="h-4 w-4" />} title={`${attention.pendingStores.length} store approvals`} href="/admin/stores?status=pending">
                {attention.pendingStores.slice(0, 4).map((s) => <Row key={s.id} href={`/admin/stores/${s.id}`} primary={s.name} secondary={`${s.area} · applied ${timeAgo(s.created_at)}`} />)}
              </AttentionGroup>
            ) : null}
            {attention.refundsPending.length ? (
              <AttentionGroup icon={<RotateCcw className="h-4 w-4" />} title={`${attention.refundsPending.length} refunds pending`} href="/admin/payments?tab=refunds" tone="danger">
                {attention.refundsPending.slice(0, 4).map((p) => <Row key={p.id} href={`/admin/orders/${p.order_id}`} primary={p.order?.order_number ?? p.order_id.slice(0, 8)} secondary={`${formatINR(Number(p.amount) - Number(p.refund_amount))} · ${timeAgo(p.created_at)}`} />)}
              </AttentionGroup>
            ) : null}
            {attention.openTickets.length ? (
              <AttentionGroup icon={<LifeBuoy className="h-4 w-4" />} title={`${attention.openTickets.length} open tickets`} href="/admin/support?status=open_all">
                {attention.openTickets.slice(0, 4).map((t) => <Row key={t.id} href={`/admin/support/${t.id}`} primary={t.subject} secondary={`${t.ticket_number} · ${t.priority} · ${timeAgo(t.created_at)}`} />)}
              </AttentionGroup>
            ) : null}
            {attention.pendingReviews ? (
              <AttentionGroup icon={<Star className="h-4 w-4" />} title={`${attention.pendingReviews} reviews to moderate`} href="/admin/reviews" />
            ) : null}
            {!attentionCount ? <p className="flex items-center gap-2 py-4 text-sm text-ink-3"><Package className="h-4 w-4" /> Nothing waiting on you right now.</p> : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function AttentionGroup({ icon, title, href, tone = "warning", children }: { icon: React.ReactNode; title: string; href: string; tone?: "warning" | "danger"; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <Link href={href} className="flex items-center justify-between gap-2 text-sm font-semibold text-ink"><span className={`inline-flex items-center gap-2 ${tone === "danger" ? "text-danger" : "text-saffron-700"}`}>{icon}{title}</span><ArrowRight className="h-4 w-4 text-ink-4" /></Link>
      {children ? <ul className="mt-2 space-y-1">{children}</ul> : null}
    </div>
  );
}

function Row({ href, primary, secondary }: { href: string; primary: string; secondary: string }) {
  return <li><Link href={href} className="block rounded-sm px-2 py-1 text-xs hover:bg-card"><span className="font-semibold text-ink">{primary}</span><span className="block truncate text-ink-3">{secondary}</span></Link></li>;
}

/** Ensures the chart always shows 14 consecutive IST days, even when a day had zero orders. */
function fill14(daily: { day: string; orders: number; gmv: number }[]) {
  const map = new Map(daily.map((d) => [d.day, d]));
  const out: { day: string; orders: number; gmv: number }[] = [];
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push(map.get(key) ?? { day: key, orders: 0, gmv: 0 });
  }
  return out;
}
