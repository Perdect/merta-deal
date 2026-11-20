import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, IndianRupee, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { AdminShell } from "@/components/admin/kit/shell";
import { PortalTheme } from "@/components/shared/portal-theme";
import { AdminPageHeader, ActionRow, CellStack, DataTable, DetailList, EmptyBlock, ListPagination, ListToolbar, MetricCard, OrderStatusPill, Panel, PaymentStatusPill, QuickView, RowLink, StatusPill, StatusTabs, StatusText } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";

/**
 * Development only: the admin frame and its shared pieces with made-up rows, so the look can be checked
 * without an admin sign-in (404 in production). `?view=1` opens the side panel; nothing here reads or
 * writes the database.
 */
const ROWS = [
  { id: "1", number: "MD0000000101", who: "Sample customer A", status: "ready_for_pickup", pay: "cod_pending", total: "₹676.00", placed: "4 min ago", flag: "No rider in range" },
  { id: "2", number: "MD0000000102", who: "Sample customer B", status: "preparing", pay: "cod_pending", total: "₹1,240.00", placed: "9 min ago", flag: null },
  { id: "3", number: "MD0000000103", who: "Sample customer C", status: "out_for_delivery", pay: "paid", total: "₹318.00", placed: "22 min ago", flag: null },
  { id: "4", number: "MD0000000104", who: "Sample customer D", status: "delivered", pay: "cod_collected", total: "₹95.00", placed: "1 hr ago", flag: null },
  { id: "5", number: "MD0000000105", who: "Sample customer E", status: "cancelled", pay: "refunded", total: "₹450.00", placed: "2 hr ago", flag: null },
] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view } = await searchParams;
  const open = ROWS.find((r) => r.id === view);
  return (
    <div className="theme-admin contents">
      <PortalTheme portal="admin" />
      <AdminShell user={{ name: "Sample Admin", email: "admin@example.test", role: "admin" }} userId="00000000-0000-4000-8000-000000000000" unread={3} counts={{ orders: 11, requests: 1, payments: 0, wholesale: 2 }} push={{ configured: false, vapidPublicKey: "" }}>
        <div className="motion-safe:animate-page-in">
          <AdminPageHeader title="Orders" description="Search, filter and act on every order. Sample rows for checking the design." actions={<><Button variant="outline" size="sm">Export</Button><Button size="sm">New order</Button></>} />
          <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="Orders" period="Today so far" value="42" icon={ShoppingBag} change={{ pct: 12, label: "vs same time yesterday" }} />
            <MetricCard label="Sales" period="Today so far" value="₹18,240" icon={IndianRupee} change={{ pct: -4, label: "vs same time yesterday" }} />
            <MetricCard label="Active deliveries" period="Right now" value="3" icon={Truck} href="#" hint="4 packed, awaiting rider" />
            <MetricCard label="Needs attention" period="Right now" value="2" icon={AlertTriangle} tone="attention" href="#" hint="Late or unassigned" />
          </section>
          <Suspense fallback={null}>
            <StatusTabs items={[{ value: "", label: "All", count: 14 }, { value: "new", label: "New", count: 5 }, { value: "picking", label: "Picking", count: 6 }, { value: "packed", label: "Packed · awaiting rider", count: 4 }, { value: "way", label: "On the way", count: 1 }]} />
            <ListToolbar searchPlaceholder="Order number, customer name or phone" filters={[{ key: "method", label: "Payment method", options: [{ value: "cod", label: "Cash" }, { value: "upi", label: "UPI" }] }]} dateRange />
          </Suspense>
          <DataTable caption="Orders" rows={[...ROWS]} rowKey={(r) => r.id} selectedKey={view ?? null} maxHeight={null}
            columns={[
              { key: "order", header: "Order", render: (r) => <span className="flex items-center gap-2"><CellStack primary={r.number} secondary={r.placed} href={`?view=${r.id}`} />{r.flag ? <StatusPill tone="red">{r.flag}</StatusPill> : null}</span> },
              { key: "customer", header: "Customer", hideBelow: "sm", render: (r) => <CellStack primary={r.who} secondary="Sample area" /> },
              { key: "status", header: "Order status", render: (r) => <OrderStatusPill status={r.status} /> },
              { key: "pay", header: "Payment", hideBelow: "md", render: (r) => <PaymentStatusPill status={r.pay} /> },
              { key: "total", header: "Total", align: "right", render: (r) => <span className="font-semibold tabular">{r.total}</span> },
              { key: "view", header: <span className="sr-only">Actions</span>, align: "right", render: (r) => <RowLink href={`?view=${r.id}`} label={`View order ${r.number}`} /> },
            ]} />
          <Suspense fallback={null}><ListPagination page={1} pageSize={5} total={14} /></Suspense>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Panel title="Needs attention" description="Sample rows">
              <ActionRow href="#" icon={Truck} title="Packed orders with no rider" detail="Assign a rider or re-run dispatch" tone="red" count={2} />
              <ActionRow href="#" icon={PackageCheck} title="Low stock" detail="Products at or under their reorder level" count={7} />
            </Panel>
            <Panel title="Details" footer={<span className="text-xs text-ink-3">Footer note</span>}>
              <DetailList items={[{ label: "Status", value: <StatusText value="active" /> }, { label: "Zone", value: "Sample zone" }, { label: "Total", value: "₹676.00", strong: true }]} />
            </Panel>
          </div>
          <Panel className="mt-4" title="Empty state"><EmptyBlock icon={ShoppingBag} title="No orders match these filters" description="Clear a filter or widen the dates." /></Panel>
          {open ? (
            <Suspense fallback={null}>
              <QuickView title={`Order ${open.number}`} description={`Placed ${open.placed}`} fullHref="#"
                footer={<div className="flex flex-wrap gap-2"><Button size="sm">Assign rider</Button><Button size="sm" variant="outline">Re-run auto-dispatch</Button></div>}>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2"><OrderStatusPill status={open.status} /><PaymentStatusPill status={open.pay} /></div>
                  <DetailList items={[{ label: "Customer", value: open.who }, { label: "Deliver to", value: "Sample address, Merta City" }, { label: "Total", value: open.total, strong: true }]} />
                </div>
              </QuickView>
            </Suspense>
          ) : null}
        </div>
      </AdminShell>
    </div>
  );
}
