import type { Metadata } from "next";
import Link from "next/link";
import { Package, ChevronRight } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyOrders } from "@/lib/data/orders";
import { OrderStatusBadge } from "@/components/shop/order-status";
import { ProductImage } from "@/components/shop/product-image";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { ReorderButton } from "@/components/shop/reorder-button";
import { formatINR, formatDateTime } from "@/lib/utils";
import { PAYMENT_METHOD_LABEL } from "@/lib/order-status";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "all" } = await searchParams;
  const user = await getSessionUser();
  if (!user) return <EmptyState title="Sign in to see your orders" action={<Button href="/login?next=/orders">Sign in</Button>} />;
  const { orders } = await getMyOrders({ status: tab === "active" ? "active" : tab === "past" ? "past" : "all", limit: 30 });
  const tabs = [{ v: "all", l: "All" }, { v: "active", l: "Active" }, { v: "past", l: "Past" }];
  return (
    <div className="pt-1">
      <PageHeader title="My orders" />
      <div className="mb-3 flex gap-1 rounded-full bg-surface-2 p-1 mx-4 sm:mx-0 w-fit">
        {tabs.map((t) => <Link key={t.v} href={`/orders?tab=${t.v}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === t.v ? "bg-card text-ink shadow-card" : "text-ink-3"}`}>{t.l}</Link>)}
      </div>
      {orders.length === 0 ? <EmptyState icon={<Package className="h-7 w-7" />} title="No orders yet" description="Your orders and live tracking will show up here." action={<Button href="/categories">Start shopping</Button>} /> : (
        <ul className="space-y-3 px-4 sm:px-0">
          {orders.map((o) => (
            <li key={o.id} className="rounded-lg border border-line bg-card shadow-card">
              <Link href={`/orders/${o.id}`} className="block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-sm font-bold text-ink">{o.store?.name}</p><p className="text-xs text-ink-3">{o.order_number} · {formatDateTime(o.created_at)}</p></div>
                  <OrderStatusBadge status={o.status} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex -space-x-2">{o.items.slice(0, 4).map((it, i) => <ProductImage key={i} image={it.image_url} productName={it.product_name} className="h-10 w-10 rounded-sm border-2 border-card" sizes="40px" />)}</div>
                  <p className="line-clamp-1 flex-1 text-xs text-ink-2">{o.items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}</p>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm"><span className="text-ink-3">{o.item_count} items · {PAYMENT_METHOD_LABEL[o.payment_method]}</span><span className="inline-flex items-center gap-1 font-bold text-ink">{formatINR(o.total)} <ChevronRight className="h-4 w-4 text-ink-4" /></span></div>
              </Link>
              {["delivered", "completed"].includes(o.status) ? <div className="flex gap-2 border-t border-line px-4 py-2.5"><ReorderButton orderId={o.id} /><Button variant="ghost" size="sm" href={`/orders/${o.id}#review`}>Rate order</Button></div> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
