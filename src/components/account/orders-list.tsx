import Link from "next/link";
import { Package, ChevronRight, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { OrderListItem } from "@/lib/data/orders";
import { ORDER_STATUS_META } from "@/lib/order-status";
import { ProductImage } from "@/components/shop/product-image";
import { ReorderButton } from "@/components/shop/reorder-button";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { formatINR, formatDateTime, cn } from "@/lib/utils";

const TABS = [{ v: "all", l: "All" }, { v: "active", l: "Active" }, { v: "past", l: "Past" }];

/** Stacked order cards: status, time, total, thumbnails, then Rate / Order Again. */
export function OrdersList({ orders, tab, base = "/account/orders" }: { orders: OrderListItem[]; tab: string; base?: string }) {
  return (
    <div className="space-y-3">
      <div className="flex w-fit gap-1 rounded-full bg-surface-2 p-1">
        {TABS.map((t) => <Link key={t.v} href={`${base}?tab=${t.v}`} className={cn("tap rounded-full px-4 py-1.5 text-sm font-semibold", tab === t.v ? "bg-card text-ink shadow-card" : "text-ink-3")}>{t.l}</Link>)}
      </div>
      {orders.length === 0 ? (
        <EmptyState icon={<Package className="h-7 w-7" />} title={tab === "active" ? "No active orders" : "No orders yet"} description="Your orders and live tracking will show up here." action={<Button href="/categories">Start shopping</Button>} />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const meta = ORDER_STATUS_META[o.status];
            const Icon = meta.tone === "success" ? CheckCircle2 : meta.tone === "danger" ? XCircle : Clock;
            const done = o.status === "delivered" || o.status === "completed";
            return (
              <li key={o.id} className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
                <Link href={`/orders/${o.id}`} className="block p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-display text-base font-bold text-ink">Order {meta.label.toLowerCase()} <Icon className={cn("h-4 w-4", meta.tone === "success" ? "text-success" : meta.tone === "danger" ? "text-danger" : "text-info")} /></p>
                      <p className="mt-0.5 text-sm text-ink-3">Placed at {formatDateTime(o.created_at)}</p>
                    </div>
                    <p className="inline-flex shrink-0 items-center gap-0.5 font-display text-base font-bold text-ink">{formatINR(o.total)} <ChevronRight className="h-4 w-4 text-ink-3" /></p>
                  </div>
                  <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
                    {o.items.slice(0, 6).map((it, i) => <ProductImage key={i} image={it.image_url} productName={it.product_name} className="h-14 w-14 shrink-0 rounded-md border border-line" sizes="56px" />)}
                    {o.items.length > 6 ? <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-xs font-bold text-ink-2">+{o.items.length - 6}</span> : null}
                  </div>
                  <p className="mt-2 text-xs text-ink-3">{o.item_count} item{o.item_count === 1 ? "" : "s"} · {o.order_number}</p>
                </Link>
                <div className={cn("grid border-t border-line", done ? "grid-cols-2 divide-x divide-line" : "grid-cols-1")}>
                  {done ? <Link href={`/orders/${o.id}#review`} className="py-3 text-center text-sm font-bold text-ink hover:bg-surface">Rate order</Link> : null}
                  <ReorderButton orderId={o.id} label="Order Again" variant="ghost" className="h-auto w-full rounded-none py-3 text-sm font-bold text-brand-700 hover:bg-surface" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
