import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { listOrders, getStoreOptions, spGet, spPage, type SP } from "@/lib/data/admin";
import { ListToolbar, ListPagination } from "@/components/admin/list-controls";
import { ORDER_STATUS_OPTIONS, PAYMENT_STATUS_OPTIONS, PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_TONE } from "@/components/admin/constants";
import { OrderStatusBadge } from "@/components/shop/order-status";
import { PageHeader, Table } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { PAYMENT_METHOD_LABEL } from "@/lib/order-status";
import { formatINR, formatDateTime, minutesUntil } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [{ items, total, page, pageSize }, stores] = await Promise.all([
    listOrders({ q: spGet(sp, "q"), status: spGet(sp, "status"), payment: spGet(sp, "payment"), method: spGet(sp, "method"), store: spGet(sp, "store"), from: spGet(sp, "from"), to: spGet(sp, "to"), page: spPage(sp) }),
    getStoreOptions(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Orders" subtitle={`${total} orders`} className="px-0" />
      <ListToolbar searchPlaceholder="Order no., short code, phone or name" dateRange filters={[
        { key: "status", label: "Statuses", options: ORDER_STATUS_OPTIONS },
        { key: "payment", label: "Payment status", placeholder: "Any payment status", options: PAYMENT_STATUS_OPTIONS },
        { key: "method", label: "Methods", placeholder: "Any method", options: PAYMENT_METHOD_OPTIONS },
        { key: "store", label: "Stores", options: stores.map((s) => ({ value: s.id, label: s.name })) },
      ]} />
      {items.length === 0 ? <EmptyState icon={<Package className="h-7 w-7" />} title="No orders match" description="Adjust the filters or date range." /> : (
        <Table rows={items as unknown as Record<string, unknown>[]} columns={[
          { key: "order_number", header: "Order", render: (r) => { const o = r as unknown as (typeof items)[number]; const addr = o.address_snapshot as { full_name?: string; phone?: string; area?: string } | null; return <Link href={`/admin/orders/${o.id}`} className="block"><span className="font-semibold text-brand-700">{o.order_number}</span><span className="block text-xs text-ink-3">{addr?.full_name ?? o.customer?.full_name ?? "—"} · {addr?.phone ?? o.customer?.phone ?? ""}</span></Link>; } },
          { key: "store", header: "Store", render: (r) => { const s = r.store as { id: string; name: string } | null; return s ? <Link href={`/admin/stores/${s.id}`} className="hover:underline">{s.name}</Link> : "—"; } },
          { key: "status", header: "Status", render: (r) => { const o = r as unknown as (typeof items)[number]; const eta = minutesUntil(o.promised_at); const late = eta != null && eta < 0 && !["delivered", "completed", "cancelled", "rejected"].includes(o.status); return <span className="inline-flex flex-col gap-1"><OrderStatusBadge status={o.status} />{late ? <span className="text-[10px] font-bold text-danger">{Math.abs(eta!)} min late</span> : null}</span>; } },
          { key: "payment", header: "Payment", render: (r) => <span className="inline-flex flex-col gap-1 text-xs"><span>{PAYMENT_METHOD_LABEL[r.payment_method as keyof typeof PAYMENT_METHOD_LABEL]}</span><Badge tone={PAYMENT_STATUS_TONE[r.payment_status as string]} size="xs">{String(r.payment_status).replace("_", " ")}</Badge></span> },
          { key: "total", header: "Total", className: "text-right", render: (r) => <span className="tabular font-semibold">{formatINR(r.total as number)}</span> },
          { key: "item_count", header: "Items", className: "text-right", render: (r) => <span className="tabular text-ink-3">{r.item_count as number}</span> },
          { key: "created_at", header: "Placed", render: (r) => <span className="text-xs text-ink-3">{formatDateTime(r.created_at as string)}{r.delivery_type !== "standard" ? <span className="block capitalize text-ink-4">{String(r.delivery_type)}</span> : null}</span> },
        ]} />
      )}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
