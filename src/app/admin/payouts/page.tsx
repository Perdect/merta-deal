import type { Metadata } from "next";
import Link from "next/link";
import { Banknote } from "lucide-react";
import { listPayouts, getPayoutTotals, getStoreOptions, spGet, spPage, type SP } from "@/lib/data/admin";
import { ListToolbar, ListPagination } from "@/components/admin/list-controls";
import { GeneratePayouts, PayoutStatusButton } from "@/components/admin/payment-actions";
import { PAYOUT_STATUS_OPTIONS, PAYOUT_STATUS_TONE } from "@/components/admin/constants";
import { PageHeader, Table } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatINR, formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Payouts" };

export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [{ items, total, page, pageSize }, totals, stores] = await Promise.all([
    listPayouts({ store: spGet(sp, "store"), status: spGet(sp, "status"), page: spPage(sp) }), getPayoutTotals(), getStoreOptions(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Payouts" subtitle="Weekly settlements to stores" className="px-0" action={<GeneratePayouts />} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Pending" value={formatINR(totals.pending?.amount ?? 0)} hint={`${totals.pending?.count ?? 0} payouts`} tone="saffron" />
        <Stat label="Processing" value={formatINR(totals.processing?.amount ?? 0)} hint={`${totals.processing?.count ?? 0} payouts`} />
        <Stat label="Paid" value={formatINR(totals.paid?.amount ?? 0)} hint={`${totals.paid?.count ?? 0} payouts`} tone="success" />
        <Stat label="Failed" value={formatINR(totals.failed?.amount ?? 0)} hint={`${totals.failed?.count ?? 0} payouts`} tone={totals.failed?.count ? "danger" : "neutral"} />
      </section>
      <ListToolbar searchKey={null} filters={[{ key: "store", label: "Stores", options: stores.map((s) => ({ value: s.id, label: s.name })) }, { key: "status", label: "Statuses", options: PAYOUT_STATUS_OPTIONS }]} />
      {items.length === 0 ? <EmptyState icon={<Banknote className="h-7 w-7" />} title="No payouts yet" description="Generate weekly payouts to settle delivered orders with stores." action={<GeneratePayouts />} /> : (
        <Table rows={items as unknown as Record<string, unknown>[]} columns={[
          { key: "store", header: "Store", render: (r) => { const p = r as unknown as (typeof items)[number]; return <Link href={`/admin/stores/${p.store_id}`} className="block"><span className="font-semibold text-brand-700">{p.store?.name ?? "Store"}</span><span className="block text-xs text-ink-3">{p.store?.bank_account_number ? `${p.store.bank_account_name ?? ""} · ${p.store.bank_account_number} · ${p.store.bank_ifsc ?? ""}` : p.store?.upi_id ? `UPI ${p.store.upi_id}` : "No bank details on file"}</span></Link>; } },
          { key: "period", header: "Period", render: (r) => <span className="text-xs tabular">{formatDate(r.period_start as string)} – {formatDate(r.period_end as string)}<span className="block text-ink-3">{r.order_count as number} orders</span></span> },
          { key: "gross_sales", header: "Gross", className: "text-right", render: (r) => <span className="tabular">{formatINR(r.gross_sales as number)}</span> },
          { key: "commission_amount", header: "Commission", className: "text-right", render: (r) => <span className="tabular text-ink-3">− {formatINR(r.commission_amount as number)}</span> },
          { key: "adjustments", header: "Adjust.", className: "text-right", render: (r) => <span className="tabular text-ink-3">{Number(r.adjustments) ? formatINR(r.adjustments as number) : "—"}</span> },
          { key: "net_amount", header: "Net", className: "text-right", render: (r) => <span className="tabular font-bold">{formatINR(r.net_amount as number, { precise: true })}</span> },
          { key: "status", header: "Status", render: (r) => <span className="inline-flex flex-col gap-0.5"><Badge tone={PAYOUT_STATUS_TONE[r.status as string]}>{String(r.status)}</Badge>{r.reference_no ? <span className="font-mono text-[10px] text-ink-3">{String(r.reference_no)}</span> : null}{r.paid_at ? <span className="text-[10px] text-ink-4">{formatDateTime(r.paid_at as string)}</span> : null}</span> },
          { key: "actions", header: "", render: (r) => <PayoutStatusButton payoutId={r.id as string} status={r.status as never} amount={Number(r.net_amount)} reference={(r.reference_no as string | null) ?? null} /> },
        ]} />
      )}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
