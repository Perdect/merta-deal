import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, SearchX } from "lucide-react";
import { spGet, spPage, type SP } from "@/lib/data/admin";
import { listPaymentsAdmin, countPayments, getPaymentAdmin, PAYMENT_TABS, type PaymentFilters } from "@/lib/data/admin-care";
import { serverEnv } from "@/lib/env";
import { AdminPageHeader, DataTable, CellStack, RowLink, EmptyBlock, ErrorBlock, DetailList, ListToolbar, StatusTabs, ListPagination, QuickView, PaymentStatusPill, StatusPill, paymentMethodLabel, rupees } from "@/components/admin/kit";
import { RazorpayNotice, PaymentRefundActions } from "@/components/admin/payment-actions";
import { hrefWith } from "@/components/admin/care/shared";
import { UpiPending, type PendingUpi } from "@/components/admin/upi-pending";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_PROVIDER_OPTIONS } from "@/components/admin/constants";
import { ORDER_STATUS_META } from "@/lib/order-status";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };

const TAB_LABEL: Record<string, string> = { "": "All", refunds: "Refunds pending", failed: "Failed", due: "Awaiting payment", paid: "Paid", refunded: "Refunded" };
const PROVIDER_LABEL: Record<string, string> = { cod: "Cash on delivery", razorpay: "Razorpay", wallet: "Wallet" };

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = (PAYMENT_TABS as readonly string[]).includes(spGet(sp, "tab")) ? spGet(sp, "tab") : "";
  const filters: PaymentFilters = { q: spGet(sp, "q"), method: spGet(sp, "method"), provider: spGet(sp, "provider"), from: spGet(sp, "from"), to: spGet(sp, "to") };
  const viewId = spGet(sp, "view");
  const validView = /^[0-9a-f-]{36}$/.test(viewId);
  const supabase = await createClient();
  const [list, counts, view, pendingUpi] = await Promise.all([
    listPaymentsAdmin({ ...filters, tab, page: spPage(sp) }),
    countPayments(filters),
    validView ? getPaymentAdmin(viewId) : Promise.resolve(null),
    // Absent until migration 0041 is applied, which simply shows nothing.
    (supabase.rpc as unknown as (fn: string) => PromiseLike<{ data: PendingUpi[] | null }>).call(supabase, "admin_pending_upi"),
  ]);
  const { razorpayKeyId, razorpayKeySecret, serviceRoleKey } = serverEnv();
  const rzp = Boolean(razorpayKeyId && razorpayKeySecret && serviceRoleKey);
  const viewHref = (id: string) => hrefWith("/admin/payments", sp, { view: id });
  const filtered = Boolean(filters.q || filters.method || filters.provider || filters.from || filters.to);
  const refundDue = (p: { refund_required: boolean; status: string }) => p.refund_required && p.status !== "refunded";

  return (
    <>
      <AdminPageHeader title="Payments" description="Every payment attempt, with refunds that still need to be paid back. Method and payment status are shown separately." />

      <UpiPending items={pendingUpi.data ?? []} />
      <StatusTabs param="tab" items={PAYMENT_TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: counts[t] ?? null }))} />
      {tab === "refunds" ? <RazorpayNotice configured={rzp} /> : null}

      <ListToolbar searchPlaceholder="Order number, or Razorpay order / payment / refund id" dateRange={{ label: "Created between (IST)" }} filters={[
        { key: "method", label: "Payment method", options: PAYMENT_METHOD_OPTIONS },
        { key: "provider", label: "Provider", options: PAYMENT_PROVIDER_OPTIONS },
      ]} />

      {list.error ? <ErrorBlock title="Couldn't load payments" description="The database didn't respond. Your filters are kept; try again." retryHref={hrefWith("/admin/payments", sp, { view: null })} /> : (
        <DataTable caption="Payments" rows={list.items} rowKey={(p) => p.id} selectedKey={validView ? viewId : null}
          empty={tab === "refunds" && !filtered
            ? <EmptyBlock icon={CreditCard} title="No refunds pending" description="Cancelled orders that were paid online appear here until the money is returned." />
            : filtered || tab
              ? <EmptyBlock icon={SearchX} title="No payments match" description="Try another tab, remove a filter chip, or search by a different order number or id." />
              : <EmptyBlock icon={CreditCard} title="No payments yet" description="A payment record is created when a customer checks out." />}
          columns={[
            { key: "order", header: "Order", render: (p) => <CellStack primary={p.order?.order_number ?? "Order"} secondary={p.user?.full_name ?? undefined} href={viewHref(p.id)} scroll={false} /> },
            { key: "method", header: "Method", hideBelow: "md", render: (p) => <CellStack primary={paymentMethodLabel(p.method)} secondary={PROVIDER_LABEL[p.provider] ?? p.provider} /> },
            { key: "status", header: "Payment status", render: (p) => <span className="flex flex-col items-start gap-1"><PaymentStatusPill status={p.status} />{refundDue(p) ? <StatusPill tone="red">Refund due</StatusPill> : null}</span> },
            { key: "amount", header: "Amount", align: "right", render: (p) => <span className="block text-right"><span className="font-semibold tabular text-ink">{rupees(p.amount)}</span>{Number(p.refund_amount) ? <span className="block text-xs tabular text-ink-3">Refunded {rupees(p.refund_amount)}</span> : null}</span> },
            { key: "ids", header: "Provider reference", hideBelow: "xl", render: (p) => <span className="block max-w-[220px] truncate font-mono text-[11px] text-ink-3" title={[p.provider_order_id, p.provider_payment_id, p.refund_id].filter(Boolean).join("\n")}>{p.provider_payment_id ?? p.provider_order_id ?? "—"}</span> },
            { key: "when", header: "Created", hideBelow: "lg", render: (p) => <span className="whitespace-nowrap text-xs text-ink-3" title={formatDateTime(p.created_at)}>{timeAgo(p.created_at)}{p.collected_at ? <span className="block">Collected {formatDateTime(p.collected_at)}</span> : null}</span> },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (p) => <RowLink href={viewHref(p.id)} scroll={false} label={`${refundDue(p) ? "Review refund for" : "View payment for"} ${p.order?.order_number ?? "order"}`}>{refundDue(p) ? "Refund" : "View"}</RowLink> },
          ]} />
      )}
      <ListPagination page={list.page} pageSize={list.pageSize} total={list.total} />

      {validView ? (
        view ? (
          <QuickView title={`Payment for ${view.order?.order_number ?? "order"}`} description={`Created ${formatDateTime(view.created_at)}`} fullHref={`/admin/orders/${view.order_id}`} fullLabel="Open order"
            footer={<PaymentRefundActions orderId={view.order_id} orderNumber={view.order?.order_number ?? "order"} customer={view.user?.full_name ?? null} amount={Number(view.amount)} refunded={Number(view.refund_amount)} provider={view.provider} status={view.status} refundRequired={view.refund_required} razorpayConfigured={rzp} />}>
            <div className="space-y-5">
              {refundDue(view) && view.provider === "razorpay" && !rzp ? <RazorpayNotice configured={false} /> : null}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Payment</h3>
                <DetailList items={[
                  { label: "Payment status", value: <span className="inline-flex flex-wrap justify-end gap-1"><PaymentStatusPill status={view.status} />{refundDue(view) ? <StatusPill tone="red">Refund due</StatusPill> : null}</span> },
                  { label: "Method", value: paymentMethodLabel(view.method, true) },
                  { label: "Provider", value: PROVIDER_LABEL[view.provider] ?? view.provider },
                  { label: "Amount", value: rupees(view.amount), strong: true },
                  { label: "Refunded", value: rupees(view.refund_amount) },
                  ...(refundDue(view) ? [{ label: "Still owed", value: <span className="font-semibold text-danger">{rupees(Math.max(0, Number(view.amount) - Number(view.refund_amount)))}</span> }] : []),
                  ...(view.failure_reason ? [{ label: "Failure reason", value: <span className="text-danger">{view.failure_reason}</span> }] : []),
                  ...(view.collected_at ? [{ label: "Cash collected", value: formatDateTime(view.collected_at) }] : []),
                  { label: "Last updated", value: formatDateTime(view.updated_at) },
                ]} />
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Order</h3>
                <DetailList items={[
                  { label: "Order", value: <Link href={`/admin/orders/${view.order_id}`} className="font-semibold text-brand-700 hover:underline">{view.order?.order_number ?? "View order"}</Link> },
                  { label: "Order status", value: view.order ? ORDER_STATUS_META[view.order.status]?.label ?? view.order.status : "—" },
                  { label: "Order total", value: view.order ? rupees(view.order.total) : "—" },
                  { label: "Customer", value: view.user?.full_name ? <Link href={`/admin/users/${view.user_id}`} className="text-brand-700 hover:underline">{view.user.full_name}</Link> : "—" },
                  { label: "Phone", value: view.user?.phone ?? "—" },
                ]} />
              </section>
              {view.provider_order_id || view.provider_payment_id || view.refund_id ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Provider references</h3>
                  <DetailList items={[
                    ...(view.provider_order_id ? [{ label: "Order id", value: <span className="break-all font-mono text-xs">{view.provider_order_id}</span> }] : []),
                    ...(view.provider_payment_id ? [{ label: "Payment id", value: <span className="break-all font-mono text-xs">{view.provider_payment_id}</span> }] : []),
                    ...(view.refund_id ? [{ label: "Refund id", value: <span className="break-all font-mono text-xs">{view.refund_id}</span> }] : []),
                  ]} />
                </section>
              ) : null}
            </div>
          </QuickView>
        ) : (
          <QuickView title="Payment not found"><EmptyBlock title="This payment could not be loaded" description="It may have been removed, or the link is out of date." /></QuickView>
        )
      ) : null}
    </>
  );
}
