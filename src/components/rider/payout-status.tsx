"use client";
import { Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDateTime } from "@/lib/utils";
import { useT, type TKey } from "@/lib/rider-i18n";

export type EarningRow = { amount: number; status: "pending" | "processing" | "paid" | "failed"; created_at: string; confirmed_via: string; kind?: string | null; note?: string | null; breakdown?: { lines?: { label: string; amount: number }[] } | null; order: { order_number: string } | null };
export type RiderPayoutRow = { amount: number; gross_amount?: number | null; cod_offset?: number | null; status: "pending" | "processing" | "paid" | "failed"; reference_no: string | null; failure_reason: string | null; created_at: string; settled_at: string | null };
const KIND_KEY: Record<string, TKey> = { delivery: "payout.kind.delivery", failed_attempt: "payout.kind.failedAttempt", cancelled_after_pickup: "payout.kind.cancelledAfterPickup", return_trip: "payout.kind.returnTrip", incentive: "payout.kind.incentive", adjustment: "payout.kind.adjustment" };

const META: Record<EarningRow["status"], { label: TKey; tone: "warning" | "info" | "success" | "danger"; hint: TKey }> = {
  pending: { label: "payout.pending", tone: "warning", hint: "payout.pendingHint" },
  processing: { label: "payout.processing", tone: "info", hint: "payout.processingHint" },
  paid: { label: "payout.paid", tone: "success", hint: "payout.paidHint" },
  failed: { label: "payout.failed", tone: "danger", hint: "payout.failedHint" },
};

/**
 * Where the rider's money is. "Paid" only appears once Merta Deal has marked the payout paid with a
 * transaction reference — crediting an earning after delivery is "Pending", never "Paid".
 */
export function PayoutStatus({ earnings, payouts }: { earnings: EarningRow[]; payouts: RiderPayoutRow[] }) {
  const { t } = useT();
  const total = (s: EarningRow["status"][]) => earnings.filter((e) => s.includes(e.status)).reduce((a, e) => a + Number(e.amount), 0);
  const kind = (k: string | null | undefined) => (k && KIND_KEY[k] ? t(KIND_KEY[k]) : k ?? t("payout.kind.delivery"));
  return (
    <section className="rounded-2xl bg-card p-4 shadow-card" aria-labelledby="payouts-head">
      <h2 id="payouts-head" className="flex items-center gap-2 font-display text-[16px] font-extrabold text-ink"><Wallet className="h-4 w-4 text-brand-700" /> {t("payout.title")}</h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[{ l: t("payout.toBePaid"), v: total(["pending", "failed"]) }, { l: t("payout.processing"), v: total(["processing"]) }, { l: t("payout.paid"), v: total(["paid"]) }].map((x) => (
          <div key={x.l} className="rounded-xl bg-surface p-2.5"><dt className="text-[11px] text-ink-3">{x.l}</dt><dd className="font-display text-base font-extrabold tabular text-ink">{formatINR(x.v)}</dd></div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink-3">{t("payout.note")}</p>
      {earnings.length ? (
        <ul className="mt-3 divide-y divide-line text-sm">
          {earnings.slice(0, 20).map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0"><span className="block truncate font-medium text-ink">{e.order?.order_number ?? kind(e.kind)}{e.kind && e.kind !== "delivery" ? <span className="text-xs font-normal text-ink-3"> · {kind(e.kind)}</span> : null}{e.confirmed_via === "support" ? <span className="text-xs font-normal text-ink-3"> · {t("payout.confirmedBySupport")}</span> : null}</span><span className="block text-xs text-ink-3">{formatDateTime(e.created_at)} · {t(META[e.status].hint)}</span>{e.breakdown?.lines?.length ? <span className="mt-0.5 block text-[11px] text-ink-3">{e.breakdown.lines.map((l) => `${l.label} ${formatINR(l.amount)}`).join(" · ")}</span> : e.note ? <span className="mt-0.5 block text-[11px] text-ink-3">{e.note}</span> : null}</span>
              <span className="flex shrink-0 flex-col items-end gap-1"><span className="tabular font-semibold">{formatINR(e.amount)}</span><Badge tone={META[e.status].tone} size="xs">{t(META[e.status].label)}</Badge></span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-sm text-ink-3">{t("payout.none")}</p>}
      {payouts.length ? (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-3">{t("payout.recent")}</h3>
          <ul className="mt-1 divide-y divide-line text-sm">
            {payouts.slice(0, 10).map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-xs text-ink-3">{formatDateTime(p.settled_at ?? p.created_at)}{p.reference_no ? ` · ${t("payout.ref")} ${p.reference_no}` : p.failure_reason ? ` · ${p.failure_reason}` : ""}{Number(p.cod_offset) > 0 ? ` · ${t("payout.setOff", { earned: formatINR(p.gross_amount ?? 0), cash: formatINR(p.cod_offset ?? 0) })}` : ""}</span>
                <span className="flex shrink-0 items-center gap-2"><span className="tabular font-semibold">{formatINR(p.amount)}</span><Badge tone={META[p.status].tone} size="xs">{t(META[p.status].label)}</Badge></span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
