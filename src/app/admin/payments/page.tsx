import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { listPayments, countPendingRefunds, spGet, spPage, type SP } from "@/lib/data/admin";
import { serverEnv } from "@/lib/env";
import { ListToolbar, ListPagination, ParamTabs } from "@/components/admin/list-controls";
import { RefundButtons, RazorpayNotice } from "@/components/admin/payment-actions";
import { PAYMENT_STATUS_OPTIONS, PAYMENT_STATUS_TONE, PAYMENT_METHOD_OPTIONS, PAYMENT_PROVIDER_OPTIONS } from "@/components/admin/constants";
import { PageHeader, Table } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { PAYMENT_METHOD_LABEL } from "@/lib/order-status";
import { formatINR, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = spGet(sp, "tab") || "all";
  const [{ items, total, page, pageSize }, pendingRefunds] = await Promise.all([
    listPayments({ q: spGet(sp, "q"), status: spGet(sp, "status"), provider: spGet(sp, "provider"), method: spGet(sp, "method"), from: spGet(sp, "from"), to: spGet(sp, "to"), refunds: tab === "refunds", page: spPage(sp) }),
    countPendingRefunds(),
  ]);
  const { razorpayKeyId, razorpayKeySecret, serviceRoleKey } = serverEnv();
  const rzp = Boolean(razorpayKeyId && razorpayKeySecret && serviceRoleKey);
  return (
    <div className="space-y-4">
      <PageHeader title="Payments" subtitle={`${total} records`} className="px-0" />
      <ParamTabs param="tab" defaultValue="all" items={[{ value: "all", label: "All payments" }, { value: "refunds", label: "Refunds pending", count: pendingRefunds }]} />
      {tab === "refunds" ? <RazorpayNotice configured={rzp} /> : null}
      <ListToolbar searchPlaceholder="Razorpay order / payment / refund id" dateRange filters={tab === "refunds" ? [] : [
        { key: "status", label: "Statuses", options: PAYMENT_STATUS_OPTIONS }, { key: "provider", label: "Providers", options: PAYMENT_PROVIDER_OPTIONS }, { key: "method", label: "Methods", options: PAYMENT_METHOD_OPTIONS },
      ]} />
      {items.length === 0 ? <EmptyState icon={<CreditCard className="h-7 w-7" />} title={tab === "refunds" ? "No refunds pending" : "No payments match"} description={tab === "refunds" ? "Cancelled online-paid orders appear here until refunded." : undefined} /> : (
        <Table rows={items as unknown as Record<string, unknown>[]} columns={[
          { key: "order", header: "Order", render: (r) => { const p = r as unknown as (typeof items)[number]; return <Link href={`/admin/orders/${p.order_id}`} className="block"><span className="font-semibold text-brand-700">{p.order?.order_number ?? p.order_id.slice(0, 8)}</span><span className="block text-xs text-ink-3">{p.order?.store?.name ?? ""} · {p.user?.full_name ?? ""}</span></Link>; } },
          { key: "method", header: "Method", render: (r) => <span className="text-xs">{PAYMENT_METHOD_LABEL[r.method as keyof typeof PAYMENT_METHOD_LABEL]}<span className="block text-ink-4">{String(r.provider)}</span></span> },
          { key: "status", header: "Status", render: (r) => <span className="inline-flex flex-col gap-1"><Badge tone={PAYMENT_STATUS_TONE[r.status as string]}>{String(r.status).replace("_", " ")}</Badge>{r.refund_required && r.status !== "refunded" ? <span className="text-[10px] font-bold text-danger">REFUND DUE</span> : null}</span> },
          { key: "amount", header: "Amount", className: "text-right", render: (r) => <span className="tabular"><span className="font-semibold">{formatINR(r.amount as number, { precise: true })}</span>{Number(r.refund_amount) ? <span className="block text-xs text-ink-3">refunded {formatINR(r.refund_amount as number, { precise: true })}</span> : null}</span> },
          { key: "provider_payment_id", header: "Provider ids", render: (r) => <span className="font-mono text-[11px] text-ink-3">{(r.provider_order_id as string) ?? "—"}<br />{(r.provider_payment_id as string) ?? ""}{r.refund_id ? <><br />{String(r.refund_id)}</> : null}</span> },
          { key: "created_at", header: "When", render: (r) => <span className="text-xs text-ink-3">{formatDateTime(r.created_at as string)}{r.collected_at ? <span className="block">collected {formatDateTime(r.collected_at as string)}</span> : null}</span> },
          ...(tab === "refunds" ? [{ key: "actions", header: "", render: (r: Record<string, unknown>) => <RefundButtons orderId={r.order_id as string} amount={Number(r.amount)} refunded={Number(r.refund_amount)} razorpayConfigured={rzp} provider={String(r.provider)} /> }] : []),
        ]} />
      )}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
