import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, Banknote } from "lucide-react";
import { getMyStore, getStorePayments, getStorePaymentSummary } from "@/lib/data/store";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { PageHeader } from "@/components/ui/misc";
import { Stat } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatINR, formatDateTime } from "@/lib/utils";
import type { Enums } from "@/types/database";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const TONE: Record<Enums<"payment_status">, BadgeTone> = { pending: "warning", authorized: "info", paid: "success", failed: "danger", refunded: "danger", partially_refunded: "warning", cod_pending: "neutral", cod_collected: "success" };

export default async function StorePaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [list, summary] = await Promise.all([getStorePayments(membership.store.id, { page, pageSize: 25 }), getStorePaymentSummary(membership.store.id, 30)]);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  return (
    <div className="space-y-4">
      <PageHeader title="Payments" subtitle={`Last ${summary.days} days · ${summary.count} payment${summary.count === 1 ? "" : "s"}`} className="px-0" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Online paid" value={formatINR(summary.online_paid)} icon={<CreditCard className="h-4 w-4" />} tone="brand" hint="UPI, cards, wallet" />
        <Stat label="COD collected" value={formatINR(summary.cod_collected)} icon={<Banknote className="h-4 w-4" />} tone="success" hint="Cash handed over by riders" />
        <Stat label="COD pending" value={formatINR(summary.cod_pending)} hint="Orders still out for delivery" />
        <Stat label="Refunded" value={formatINR(summary.refunded)} tone={summary.refunded > 0 ? "danger" : "neutral"} />
      </div>
      <p className="text-xs text-ink-3">Payments are collected by Merta Deal (online) or the rider (cash) and settled to you as payouts — see <Link href="/store/earnings" className="font-semibold text-brand-700">Earnings</Link>.</p>
      {list.payments.length === 0 ? <EmptyState icon={<CreditCard className="h-7 w-7" />} title="No payments yet" description="Every order payment — online or cash — is listed here." /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-3"><tr><th className="px-3 py-2.5 font-semibold sm:px-4">Order</th><th className="px-3 py-2.5 font-semibold sm:px-4">Method</th><th className="px-3 py-2.5 font-semibold sm:px-4">Status</th><th className="px-3 py-2.5 text-right font-semibold sm:px-4">Amount</th><th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Date</th></tr></thead>
            <tbody className="divide-y divide-line">
              {list.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2.5 sm:px-4"><Link href={`/store/orders/${p.order_id}`} className="font-semibold text-brand-700">{p.order?.order_number ?? "—"}</Link><p className="text-[11px] text-ink-3 sm:hidden">{formatDateTime(p.created_at)}</p></td>
                  <td className="px-3 py-2.5 sm:px-4">{PAYMENT_METHOD_LABEL[p.method]}{p.provider_payment_id ? <p className="font-mono text-[10px] text-ink-4">{p.provider_payment_id}</p> : null}</td>
                  <td className="px-3 py-2.5 sm:px-4"><Badge tone={TONE[p.status]} size="xs">{PAYMENT_STATUS_LABEL[p.status]}</Badge>{Number(p.refund_amount) > 0 ? <p className="text-[11px] text-ink-3">Refund {formatINR(p.refund_amount)}</p> : null}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular text-ink sm:px-4">{formatINR(p.amount, { precise: true })}</td>
                  <td className="hidden px-4 py-2.5 text-ink-3 sm:table-cell">{formatDateTime(p.collected_at ?? p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-ink-3">
          <span>Page {page} of {pages} · {list.total} payments</span>
          <div className="flex gap-2">{page > 1 ? <Link href={`?page=${page - 1}`} className="rounded-sm border border-line-2 px-3 py-1.5 font-semibold text-ink">Previous</Link> : null}{page < pages ? <Link href={`?page=${page + 1}`} className="rounded-sm border border-line-2 px-3 py-1.5 font-semibold text-ink">Next</Link> : null}</div>
        </div>
      ) : null}
    </div>
  );
}
