import { Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDateTime } from "@/lib/utils";

export type EarningRow = { amount: number; status: "pending" | "processing" | "paid" | "failed"; created_at: string; confirmed_via: string; order: { order_number: string } | null };
export type RiderPayoutRow = { amount: number; status: "pending" | "processing" | "paid" | "failed"; reference_no: string | null; failure_reason: string | null; created_at: string; settled_at: string | null };

const META = {
  pending: { label: "Pending", tone: "warning", hint: "Credited — waiting for the next payout" },
  processing: { label: "Processing", tone: "info", hint: "In a payout being sent to you" },
  paid: { label: "Paid", tone: "success", hint: "Money sent" },
  failed: { label: "Failed", tone: "danger", hint: "Payout failed — it will be retried" },
} as const;

/**
 * Where the rider's money is. "Paid" only appears once Merta Deal has marked the payout paid with a
 * transaction reference — crediting an earning after delivery is "Pending", never "Paid".
 */
export function PayoutStatus({ earnings, payouts }: { earnings: EarningRow[]; payouts: RiderPayoutRow[] }) {
  const total = (s: EarningRow["status"][]) => earnings.filter((e) => s.includes(e.status)).reduce((a, e) => a + Number(e.amount), 0);
  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-card" aria-labelledby="payouts-head">
      <h2 id="payouts-head" className="flex items-center gap-2 text-sm font-bold text-ink"><Wallet className="h-4 w-4 text-brand-700" /> Payouts</h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[{ l: "To be paid", v: total(["pending", "failed"]) }, { l: "Processing", v: total(["processing"]) }, { l: "Paid", v: total(["paid"]) }].map((x) => (
          <div key={x.l} className="rounded-md bg-surface p-2.5"><dt className="text-[11px] text-ink-3">{x.l}</dt><dd className="font-display text-base font-extrabold tabular text-ink">{formatINR(x.v)}</dd></div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink-3">Earnings are added after each OTP-confirmed delivery and sent to you by Merta Deal in payouts. Cash you collect for COD orders is separate (see above).</p>
      {earnings.length ? (
        <ul className="mt-3 divide-y divide-line text-sm">
          {earnings.slice(0, 20).map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0"><span className="block truncate font-medium text-ink">{e.order?.order_number ?? "Delivery"}{e.confirmed_via === "support" ? <span className="text-xs font-normal text-ink-3"> · confirmed by support</span> : null}</span><span className="block text-xs text-ink-3">{formatDateTime(e.created_at)} · {META[e.status].hint}</span></span>
              <span className="flex shrink-0 flex-col items-end gap-1"><span className="tabular font-semibold">{formatINR(e.amount)}</span><Badge tone={META[e.status].tone} size="xs">{META[e.status].label}</Badge></span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-sm text-ink-3">No earnings recorded yet. They appear here after each confirmed delivery.</p>}
      {payouts.length ? (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-3">Recent payouts</h3>
          <ul className="mt-1 divide-y divide-line text-sm">
            {payouts.slice(0, 10).map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-xs text-ink-3">{formatDateTime(p.settled_at ?? p.created_at)}{p.reference_no ? ` · Ref ${p.reference_no}` : p.failure_reason ? ` · ${p.failure_reason}` : ""}</span>
                <span className="flex shrink-0 items-center gap-2"><span className="tabular font-semibold">{formatINR(p.amount)}</span><Badge tone={META[p.status].tone} size="xs">{META[p.status].label}</Badge></span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
