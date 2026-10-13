import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Banknote, CheckCircle2, Clock, Loader, SearchX } from "lucide-react";
import { getPayoutTotals, getStoreOptions, spGet, spPage, type SP, type PayoutRow } from "@/lib/data/admin";
import { listPayoutsAdmin, countPayouts, getPayoutAdmin, PAYOUT_TABS } from "@/lib/data/admin-care";
import { AdminPageHeader, MetricCard, DataTable, CellStack, RowLink, EmptyBlock, ErrorBlock, DetailList, ListToolbar, StatusTabs, ListPagination, QuickView, StatusText, rupees, rupeesRounded } from "@/components/admin/kit";
import { GeneratePayouts, PayoutActions, type PayoutSummary } from "@/components/admin/payment-actions";
import { hrefWith } from "@/components/admin/care/shared";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Payouts" };

const TAB_LABEL: Record<string, string> = { "": "All", pending: "Pending", processing: "Processing", paid: "Paid", failed: "Failed" };
const day = (d: string) => formatDate(`${d}T00:00:00+05:30`, { day: "numeric", month: "short" });

function payTo(p: PayoutRow): string | null {
  const s = p.store;
  if (s?.bank_account_number) return [s.bank_account_name, `A/c ${s.bank_account_number}`, s.bank_ifsc].filter(Boolean).join(" · ");
  if (s?.upi_id) return `UPI ${s.upi_id}`;
  return null;
}
const summary = (p: PayoutRow): PayoutSummary => ({ id: p.id, status: p.status, net_amount: Number(p.net_amount), reference_no: p.reference_no, store: p.store?.name ?? "Store", period_start: p.period_start, period_end: p.period_end, payTo: payTo(p) });

export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = (PAYOUT_TABS as readonly string[]).includes(spGet(sp, "status")) ? spGet(sp, "status") : "";
  const store = spGet(sp, "store");
  const viewId = spGet(sp, "view");
  const validView = /^[0-9a-f-]{36}$/.test(viewId);
  const [list, totals, counts, stores, view] = await Promise.all([
    listPayoutsAdmin({ store, status, page: spPage(sp) }), getPayoutTotals(), countPayouts(store), getStoreOptions(),
    validView ? getPayoutAdmin(viewId) : Promise.resolve(null),
  ]);
  const viewHref = (id: string) => hrefWith("/admin/payouts", sp, { view: id });
  const t = (k: string) => totals[k] ?? { count: 0, amount: 0 };
  const n = (k: string) => `${formatNumber(t(k).count)} ${t(k).count === 1 ? "payout" : "payouts"}`;

  return (
    <>
      <AdminPageHeader title="Payouts" description="Settlements to stores for delivered orders. Generate them for a period, transfer the money, then mark each one paid." actions={<GeneratePayouts />} />

      <section aria-label="Totals" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Pending" period="All time" value={rupeesRounded(t("pending").amount)} icon={Clock} hint={n("pending")} tone={t("pending").count ? "attention" : "default"} href="/admin/payouts?status=pending" />
        <MetricCard label="Processing" period="All time" value={rupeesRounded(t("processing").amount)} icon={Loader} hint={n("processing")} href="/admin/payouts?status=processing" />
        <MetricCard label="Paid" period="All time" value={rupeesRounded(t("paid").amount)} icon={CheckCircle2} hint={n("paid")} href="/admin/payouts?status=paid" />
        <MetricCard label="Failed" period="All time" value={rupeesRounded(t("failed").amount)} icon={AlertTriangle} hint={n("failed")} tone={t("failed").count ? "attention" : "default"} href="/admin/payouts?status=failed" />
      </section>

      <StatusTabs items={PAYOUT_TABS.map((s) => ({ value: s, label: TAB_LABEL[s], count: counts[s] ?? null }))} />
      <ListToolbar searchKey={null} filters={stores.length ? [{ key: "store", label: "Store", options: stores.map((s) => ({ value: s.id, label: s.name })) }] : []} />

      {list.error ? <ErrorBlock title="Couldn't load payouts" description="The database didn't respond. Your filters are kept; try again." retryHref={hrefWith("/admin/payouts", sp, { view: null })} /> : (
      <DataTable caption="Payouts" rows={list.items} rowKey={(p) => p.id} selectedKey={validView ? viewId : null}
        empty={status || store
          ? <EmptyBlock icon={SearchX} title="No payouts match" description="Try another tab or remove the store filter." />
          : <EmptyBlock icon={Banknote} title="No payouts yet" description="Generate payouts to settle delivered orders with stores." action={<GeneratePayouts />} />}
        columns={[
          { key: "store", header: "Store", render: (p) => <CellStack primary={p.store?.name ?? "Store"} secondary={payTo(p) ?? "No bank or UPI details on file"} href={viewHref(p.id)} scroll={false} /> },
          { key: "period", header: "Period", hideBelow: "sm", render: (p) => <span className="whitespace-nowrap text-xs text-ink-2">{day(p.period_start)} – {day(p.period_end)}<span className="block text-ink-4">{formatNumber(p.order_count)} {p.order_count === 1 ? "order" : "orders"}</span></span> },
          { key: "gross", header: "Gross sales", align: "right", hideBelow: "lg", render: (p) => <span className="tabular text-ink-2">{rupees(p.gross_sales)}</span> },
          { key: "commission", header: "Commission", align: "right", hideBelow: "lg", render: (p) => <span className="tabular text-ink-3">− {rupees(p.commission_amount)}</span> },
          { key: "adjust", header: "Adjustments", align: "right", hideBelow: "xl", render: (p) => <span className="tabular text-ink-3">{Number(p.adjustments) ? rupees(p.adjustments) : "—"}</span> },
          { key: "net", header: "Net payout", align: "right", render: (p) => <span className="font-semibold tabular text-ink">{rupees(p.net_amount)}</span> },
          { key: "status", header: "Status", render: (p) => <span className="flex flex-col items-start gap-0.5"><StatusText value={p.status} />{p.reference_no ? <span className="hidden max-w-[140px] truncate font-mono text-[10px] text-ink-3 sm:block" title={p.reference_no}>{p.reference_no}</span> : null}</span> },
          { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (p) => (
            <span className="inline-flex items-center gap-1.5">
              <span className="hidden md:inline-flex"><PayoutActions payout={summary(p)} compact /></span>
              <RowLink href={viewHref(p.id)} scroll={false} label={`View payout to ${p.store?.name ?? "store"}`} />
            </span>
          ) },
        ]} />
      )}
      <ListPagination page={list.page} pageSize={list.pageSize} total={list.total} />

      {validView ? (
        view ? (
          <QuickView title={`Payout to ${view.store?.name ?? "store"}`} description={`${day(view.period_start)} – ${day(view.period_end)} · created ${formatDateTime(view.created_at)}`} fullHref={`/admin/stores/${view.store_id}`} fullLabel="Open store"
            footer={<PayoutActions payout={summary(view)} />}>
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Amount</h3>
                <DetailList items={[
                  { label: "Status", value: <StatusText value={view.status} /> },
                  { label: "Orders", value: formatNumber(view.order_count) },
                  { label: "Gross sales", value: rupees(view.gross_sales) },
                  { label: "Commission", value: `− ${rupees(view.commission_amount)}` },
                  { label: "Adjustments", value: Number(view.adjustments) ? rupees(view.adjustments) : "—" },
                  { label: "Net payout", value: rupees(view.net_amount), strong: true },
                ]} />
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Pay to</h3>
                <DetailList items={[
                  { label: "Account name", value: view.store?.bank_account_name ?? "—" },
                  { label: "Account number", value: view.store?.bank_account_number ? <span className="font-mono">{view.store.bank_account_number}</span> : "—" },
                  { label: "IFSC", value: view.store?.bank_ifsc ? <span className="font-mono">{view.store.bank_ifsc}</span> : "—" },
                  { label: "UPI", value: view.store?.upi_id ? <span className="font-mono">{view.store.upi_id}</span> : "—" },
                ]} />
                {!payTo(view) ? <p className="mt-2 text-xs text-danger">No bank or UPI details on file. <Link href={`/admin/stores/${view.store_id}`} className="font-semibold underline">Open the store</Link> to check before paying.</p> : null}
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Record</h3>
                <DetailList items={[
                  { label: "Reference", value: view.reference_no ? <span className="break-all font-mono text-xs">{view.reference_no}</span> : "—" },
                  { label: "Paid at", value: view.paid_at ? formatDateTime(view.paid_at) : "—" },
                  { label: "Note", value: view.note ?? "—" },
                  { label: "Last updated", value: formatDateTime(view.updated_at) },
                ]} />
              </section>
            </div>
          </QuickView>
        ) : (
          <QuickView title="Payout not found"><EmptyBlock title="This payout could not be loaded" description="It may have been removed, or the link is out of date." /></QuickView>
        )
      ) : null}
    </>
  );
}
