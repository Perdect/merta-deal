import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Package, IndianRupee, Clock, Bike, CheckCircle2, XCircle, Box, AlertTriangle, PackageX, Star } from "lucide-react";
import { getMyStore, getStoreStats, getPendingStoreOrders, getStoreOrderTabCounts } from "@/lib/data/store";
import { Stat, Card, CardHeader, CardBody } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { StarRating } from "@/components/ui/misc";
import { WeeklyChart } from "@/components/store/weekly-chart";
import { DashboardLive } from "@/components/store/dashboard-live";
import { formatINR, formatNumber, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function StoreDashboardPage() {
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  const { store } = membership;
  const [stats, pending, counts] = await Promise.all([getStoreStats(store.id), getPendingStoreOrders(store.id, 8), getStoreOrderTabCounts(store.id)]);
  const toPack = counts.new ?? pending.length;
  if (!stats) return <ErrorState title="Could not load your dashboard" description="The stats service did not respond. Pull to refresh or try again in a moment." retryHref="/store" />;

  const kpis = [
    { label: "Today's orders", value: formatNumber(stats.today_orders), icon: <Package className="h-4 w-4" />, tone: "brand" as const },
    { label: "Today's revenue", value: formatINR(stats.today_revenue), icon: <IndianRupee className="h-4 w-4" />, tone: "brand" as const, hint: "Your payout share, excl. cancelled" },
    { label: "To pack", value: formatNumber(toPack), icon: <Clock className="h-4 w-4" />, tone: toPack > 0 ? ("saffron" as const) : ("neutral" as const) },
    { label: "Active", value: formatNumber(stats.active_orders), icon: <Bike className="h-4 w-4" />, tone: "neutral" as const, hint: "Packing to on the way" },
    { label: "Completed", value: formatNumber(stats.completed_orders), icon: <CheckCircle2 className="h-4 w-4" />, tone: "neutral" as const, hint: "All time" },
    { label: "Cancelled / rejected", value: formatNumber(stats.cancelled_orders), icon: <XCircle className="h-4 w-4" />, tone: "neutral" as const, hint: "All time" },
    { label: "Products", value: formatNumber(stats.products), icon: <Box className="h-4 w-4" />, tone: "neutral" as const, hint: "Active listings" },
    { label: "Low stock", value: formatNumber(stats.low_stock), icon: <AlertTriangle className="h-4 w-4" />, tone: stats.low_stock > 0 ? ("saffron" as const) : ("neutral" as const) },
    { label: "Out of stock", value: formatNumber(stats.out_of_stock), icon: <PackageX className="h-4 w-4" />, tone: stats.out_of_stock > 0 ? ("danger" as const) : ("neutral" as const) },
    { label: "Rating", value: <StarRating value={Number(stats.rating_avg)} count={store.rating_count} size={18} className="text-2xl" />, icon: <Star className="h-4 w-4" />, tone: "neutral" as const },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-extrabold text-ink sm:text-2xl">{store.name}</h1>
        <p className="text-sm text-ink-3">{formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })} · {store.area}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => <Stat key={k.label} label={k.label} value={k.value} hint={k.hint} icon={k.icon} tone={k.tone} />)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <DashboardLive storeId={store.id} isOpen={store.is_open} storeActive={store.status === "active"} pending={pending} pendingTotal={toPack} />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Last 7 days" subtitle="Orders per day (excl. cancelled)" />
            <CardBody><WeeklyChart weekly={stats.weekly} metric="orders" /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Revenue, 7 days" subtitle={`Total ${formatINR(stats.weekly.reduce((s, w) => s + Number(w.revenue), 0))}`} />
            <CardBody><WeeklyChart weekly={stats.weekly} metric="revenue" /></CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
