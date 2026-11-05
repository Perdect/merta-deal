import type { Metadata } from "next";
import { Bike, Banknote, Clock, Loader, CheckCircle2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader, MetricCard, DataTable, CellStack, EmptyBlock, ErrorBlock, Panel, StatusPill, rupees, rupeesRounded } from "@/components/admin/kit";
import { CreateRiderPayout, SettleRiderPayout, RecordCashReceived, RiderAdjustment } from "@/components/admin/rider-payouts";
import Link from "next/link";
import type { RiderBalance } from "@/lib/actions/admin-delivery";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Rider payouts" };
export const dynamic = "force-dynamic";

type PayoutRow = { id: string; rider_id: string; amount: number; gross_amount: number | null; cod_offset: number; earning_count: number; status: "processing" | "paid" | "failed" | "pending"; reference_no: string | null; failure_reason: string | null; created_at: string; settled_at: string | null };
const TONE = { pending: "amber", processing: "blue", paid: "green", failed: "red" } as const;
const LABEL = { pending: "Pending", processing: "Processing", paid: "Paid", failed: "Failed" } as const;

/**
 * Rider earnings are credited when a delivery is confirmed (OTP or audited support handover) and
 * paid out manually: no payout integration is configured. Create a payout, transfer the money,
 * then mark it paid with the reference — or failed, which makes the earnings payable again.
 */
export default async function RiderPayoutsPage() {
  const supabase = await createClient();
  const [bal, pay] = await Promise.all([
    supabase.rpc("admin_rider_balances" as never),
    supabase.from("rider_payouts" as never).select("id, rider_id, amount, gross_amount, cod_offset, earning_count, status, reference_no, failure_reason, created_at, settled_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const balances = (bal.data ?? []) as unknown as RiderBalance[];
  const payouts = (pay.data ?? []) as unknown as PayoutRow[];
  const nameOf = new Map(balances.map((b) => [b.rider_id, b.name]));
  const sum = (k: keyof Pick<RiderBalance, "payable" | "processing" | "paid" | "failed" | "cash_due">) => balances.reduce((a, b) => a + Number(b[k] ?? 0), 0);

  return (
    <>
      <AdminPageHeader title="Rider payouts" back="/admin/payouts" actions={<Link href="/admin/riders/rates" className="text-sm font-semibold text-brand-700 hover:underline">Rider rates</Link>} description="Delivery earnings are credited after an OTP-confirmed (or support-confirmed) handover and paid out manually: create a payout, transfer the money, then mark it paid. Cash a rider collects on COD orders stays with them until you record receiving it." />
      {bal.error ? <ErrorBlock title="Couldn't load rider balances" description="The database didn't respond. Try again." retryHref="/admin/payouts/riders" /> : (
        <>
          <section aria-label="Totals" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <MetricCard label="Payable" period="Not yet in a payout" value={rupeesRounded(sum("payable"))} icon={Clock} tone={sum("payable") > 0 ? "attention" : "default"} />
            <MetricCard label="Processing" period="Being sent" value={rupeesRounded(sum("processing"))} icon={Loader} />
            <MetricCard label="Paid" period="All time" value={rupeesRounded(sum("paid"))} icon={CheckCircle2} />
            <MetricCard label="Failed" period="Payable again" value={rupeesRounded(sum("failed"))} icon={AlertTriangle} tone={sum("failed") > 0 ? "attention" : "default"} />
            <MetricCard label="Cash with riders" period="COD to hand over" value={rupeesRounded(sum("cash_due"))} icon={Banknote} tone={sum("cash_due") > 0 ? "attention" : "default"} />
          </section>

          <Panel title="Riders" flush className="mb-4">
            <DataTable caption="Rider balances" rows={balances} rowKey={(r) => r.rider_id} maxHeight={null}
              empty={<EmptyBlock icon={Bike} title="No riders yet" description="Riders appear here once they are approved." />}
              columns={[
                { key: "rider", header: "Rider", render: (r) => <CellStack primary={r.name} secondary={r.phone ? `+91 ${r.phone}` : undefined} /> },
                { key: "payable", header: "Payable", align: "right", render: (r) => <span className="tabular font-semibold text-ink">{rupees(r.payable)}</span> },
                { key: "processing", header: "Processing", align: "right", hideBelow: "sm", render: (r) => <span className="tabular text-ink-2">{rupees(r.processing)}</span> },
                { key: "paid", header: "Paid", align: "right", hideBelow: "md", render: (r) => <span className="tabular text-ink-2">{rupees(r.paid)}</span> },
                { key: "cash", header: "Cash held", align: "right", render: (r) => <CellStack primary={<span className="tabular font-semibold text-ink">{rupees(r.cash_due ?? 0)}</span>} secondary={`of ${rupees(r.cash_collected ?? 0)} COD`} /> },
                { key: "actions", header: "", align: "right", render: (r) => <span className="inline-flex flex-wrap justify-end gap-2"><RiderAdjustment riderId={r.rider_id} name={r.name} /><RecordCashReceived riderId={r.rider_id} name={r.name} due={Number(r.cash_due ?? 0)} /><CreateRiderPayout riderId={r.rider_id} name={r.name} payable={Number(r.payable)} cashDue={Number(r.cash_due ?? 0)} /></span> },
              ]} />
          </Panel>

          <Panel title="Payouts" description="Latest 50" flush>
            <DataTable caption="Rider payouts" rows={payouts} rowKey={(p) => p.id} maxHeight={null}
              empty={<EmptyBlock icon={Banknote} title="No rider payouts yet" description="Create a payout from a rider's payable balance above." />}
              columns={[
                { key: "rider", header: "Rider", render: (p) => <CellStack primary={nameOf.get(p.rider_id) ?? "Rider"} secondary={`${p.earning_count} ${p.earning_count === 1 ? "delivery" : "deliveries"} · ${formatDateTime(p.created_at)}`} /> },
                { key: "amount", header: "Amount", align: "right", render: (p) => <CellStack primary={<span className="tabular font-semibold text-ink">{rupees(p.amount)}</span>} secondary={Number(p.cod_offset) > 0 ? `${rupees(p.gross_amount ?? 0)} earnings − ${rupees(p.cod_offset)} cash set off` : undefined} /> },
                { key: "status", header: "Status", render: (p) => <StatusPill tone={TONE[p.status]}>{LABEL[p.status]}</StatusPill> },
                { key: "ref", header: "Reference", hideBelow: "md", render: (p) => <span className="text-xs text-ink-2">{p.reference_no ?? p.failure_reason ?? "—"}</span> },
                { key: "actions", header: "", align: "right", render: (p) => (p.status === "processing" ? <SettleRiderPayout payoutId={p.id} amount={Number(p.amount)} name={nameOf.get(p.rider_id) ?? "Rider"} /> : null) },
              ]} />
          </Panel>
        </>
      )}
    </>
  );
}
