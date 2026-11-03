import type { Metadata } from "next";
import { ShoppingBag, SearchX } from "lucide-react";
import { listOrders, countOrdersByTab, getOrderAdmin, getLiveRiders, spGet, spPage, type SP, type OrderFilters } from "@/lib/data/admin";
import { serverEnv } from "@/lib/env";
import { AdminPageHeader, DataTable, CellStack, RowLink, EmptyBlock, ListToolbar, StatusTabs, ListPagination, QuickView, OrderStatusPill, PaymentStatusPill, paymentMethodLabel, StatusPill, rupees } from "@/components/admin/kit";
import { OrderFacts } from "@/components/admin/order-summary";
import { OrderAdminActions } from "@/components/admin/order-actions";
import { PAYMENT_STATUS_OPTIONS, PAYMENT_METHOD_OPTIONS } from "@/components/admin/constants";
import { formatDateTime, minutesUntil, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders" };

const TABS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "packing", label: "To pack" },
  { value: "ready", label: "Packed" },
  { value: "on_the_way", label: "On the way" },
  { value: "done", label: "Delivered" },
  { value: "cancelled_all", label: "Cancelled" },
];
const TERMINAL = ["delivered", "completed", "cancelled", "rejected"];

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters: OrderFilters = { q: spGet(sp, "q"), status: spGet(sp, "status"), payment: spGet(sp, "payment"), method: spGet(sp, "method"), from: spGet(sp, "from"), to: spGet(sp, "to"), late: spGet(sp, "late"), delivery: spGet(sp, "delivery") };
  const viewId = spGet(sp, "view");
  const validView = /^[0-9a-f-]{36}$/.test(viewId);
  const [{ items, total, page, pageSize }, counts, view, riders] = await Promise.all([
    listOrders({ ...filters, page: spPage(sp) }),
    countOrdersByTab(filters, TABS.map((t) => t.value)),
    validView ? getOrderAdmin(viewId) : Promise.resolve(null),
    validView ? getLiveRiders() : Promise.resolve([]),
  ]);
  const tabIsKnown = !filters.status || TABS.some((t) => t.value === filters.status);
  const { razorpayKeyId, razorpayKeySecret, serviceRoleKey } = serverEnv();
  const viewHref = (id: string) => { const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "view" ? [[k, v]] : []))); q.set("view", id); return `/admin/orders?${q}`; };
  const filtered = Boolean(filters.q || filters.payment || filters.method || filters.from || filters.to || filters.late || filters.delivery);

  return (
    <>
      <AdminPageHeader title="Orders" description="Search, filter and act on every order. Click View for a quick look without leaving the list." />

      <StatusTabs items={TABS.map((t) => ({ ...t, count: counts[t.value] ?? null }))} />
      {!tabIsKnown ? <p className="-mt-1 mb-3 text-xs text-ink-3">Showing status: <span className="font-medium text-ink">{filters.status!.replace(/_/g, " ")}</span></p> : null}

      <ListToolbar searchPlaceholder="Order number, customer name or phone" dateRange={{ label: "Placed between (IST)" }} filters={[
        { key: "payment", label: "Payment status", options: PAYMENT_STATUS_OPTIONS },
        { key: "method", label: "Payment method", options: PAYMENT_METHOD_OPTIONS },
        { key: "delivery", label: "Delivery type", options: [{ value: "standard", label: "Standard" }, { value: "express", label: "Express" }, { value: "scheduled", label: "Scheduled" }] },
        { key: "late", label: "Timing", options: [{ value: "1", label: "Past promised time" }] },
      ]} />

      <DataTable caption="Orders" rows={items} rowKey={(o) => o.id} selectedKey={validView ? viewId : null}
        empty={filtered || filters.status
          ? <EmptyBlock icon={SearchX} title="No orders match" description="Try another tab, clear a filter chip, or search by a different order number or phone." />
          : <EmptyBlock icon={ShoppingBag} title="No orders yet" description="Orders appear here the moment a customer checks out." />}
        columns={[
          { key: "order", header: "Order", render: (o) => <CellStack primary={o.order_number} secondary={o.short_code ? `Code ${o.short_code}` : undefined} href={viewHref(o.id)} scroll={false} /> },
          { key: "customer", header: "Customer", hideBelow: "md", render: (o) => { const a = o.address_snapshot as { full_name?: string; phone?: string } | null; return <CellStack primary={a?.full_name ?? o.customer?.full_name ?? "—"} secondary={a?.phone ?? o.customer?.phone ?? undefined} />; } },
          { key: "status", header: "Order status", render: (o) => { const eta = minutesUntil(o.promised_at); const late = eta != null && eta < 0 && !TERMINAL.includes(o.status); return <span className="flex flex-col items-start gap-1"><OrderStatusPill status={o.status} />{late ? <StatusPill tone="red">{Math.abs(eta!)} min late</StatusPill> : null}</span>; } },
          { key: "method", header: "Method", hideBelow: "lg", render: (o) => <span className="text-ink-2">{paymentMethodLabel(o.payment_method)}</span> },
          { key: "paystatus", header: "Payment", hideBelow: "sm", render: (o) => <PaymentStatusPill status={o.payment_status} /> },
          { key: "items", header: "Items", align: "right", hideBelow: "xl", render: (o) => <span className="tabular text-ink-3">{o.item_count}</span> },
          { key: "total", header: "Total", align: "right", render: (o) => <span className="font-semibold tabular">{rupees(o.total)}</span> },
          { key: "placed", header: "Placed", hideBelow: "lg", render: (o) => <span className="whitespace-nowrap text-xs text-ink-3" title={formatDateTime(o.created_at)}>{timeAgo(o.created_at)}{o.delivery_type !== "standard" ? <span className="block capitalize">{o.delivery_type}</span> : null}</span> },
          { key: "act", header: <span className="sr-only">Actions</span>, align: "right", hideBelow: "sm", render: (o) => <RowLink href={viewHref(o.id)} label={`View order ${o.order_number}`} scroll={false} /> },
        ]} />
      <ListPagination page={page} pageSize={pageSize} total={total} />

      {validView ? (
        view ? (
          <QuickView title={`Order ${view.order.order_number}`} description={`Placed ${formatDateTime(view.order.created_at)}`} fullHref={`/admin/orders/${view.order.id}`}
            footer={<OrderAdminActions tracking={view} riders={riders} razorpayConfigured={Boolean(razorpayKeyId && razorpayKeySecret && serviceRoleKey)} compact />}>
            <OrderFacts t={view} compact />
          </QuickView>
        ) : (
          <QuickView title="Order not found"><EmptyBlock title="This order could not be loaded" description="It may have been removed, or you may not have access." /></QuickView>
        )
      ) : null}
    </>
  );
}
