import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Phone } from "lucide-react";
import { getMyStore, getStoreCustomers } from "@/lib/data/store";
import { OrderStatusBadge } from "@/components/shop/order-status";
import { PageHeader, Avatar } from "@/components/ui/misc";
import { Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatINR, formatNumber, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const PAGE = 30;

export default async function StoreCustomersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  const { customers, sampled, capped } = await getStoreCustomers(membership.store.id);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pages = Math.max(1, Math.ceil(customers.length / PAGE));
  const slice = customers.slice((page - 1) * PAGE, page * PAGE);
  const repeat = customers.filter((c) => c.orders > 1).length;
  return (
    <div className="space-y-4">
      <PageHeader title="Customers" subtitle={capped ? `Based on your last ${sampled} orders` : `From all ${sampled} orders`} className="px-0" />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Customers" value={formatNumber(customers.length)} tone="brand" />
        <Stat label="Repeat buyers" value={formatNumber(repeat)} hint={customers.length ? `${Math.round((repeat / customers.length) * 100)}% ordered again` : undefined} />
        <Stat label="Avg. spend" value={formatINR(customers.length ? customers.reduce((s, c) => s + c.spent, 0) / customers.length : 0)} hint="per customer" />
      </div>
      {slice.length === 0 ? <EmptyState icon={<Users className="h-7 w-7" />} title="No customers yet" description="People who order from your store appear here with their order history." /> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-card">
          {slice.map((c) => (
            <li key={c.user_id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <Avatar name={c.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-ink-3">{c.orders} order{c.orders === 1 ? "" : "s"} · last {timeAgo(c.last_order_at)} <OrderStatusBadge status={c.last_status} size="xs" /></p>
              </div>
              <div className="text-right"><p className="text-sm font-bold tabular text-ink">{formatINR(c.spent)}</p>{c.phone ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><Phone className="h-3 w-3" /> {c.phone}</a> : null}</div>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-ink-3">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">{page > 1 ? <Link href={`?page=${page - 1}`} className="rounded-sm border border-line-2 px-3 py-1.5 font-semibold text-ink">Previous</Link> : null}{page < pages ? <Link href={`?page=${page + 1}`} className="rounded-sm border border-line-2 px-3 py-1.5 font-semibold text-ink">Next</Link> : null}</div>
        </div>
      ) : null}
    </div>
  );
}
