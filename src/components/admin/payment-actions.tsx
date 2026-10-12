"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import { DetailList, rupees } from "@/components/admin/kit";
import { Input, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { btn, Notice } from "@/components/admin/care/shared";
import { issueRefundAction, markRefundManualAction, generatePayoutsAction, setPayoutStatusAction } from "@/lib/actions/admin";
import type { Enums } from "@/types/database";
import { cn, formatDate } from "@/lib/utils";

/* ================================================================================================
 * Refunds
 * ============================================================================================== */

export function RazorpayNotice({ configured }: { configured: boolean }) {
  if (configured) return null;
  return (
    <Notice tone="amber" title="Razorpay refunds aren't available on this deployment" className="mb-3">
      Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and SUPABASE_SERVICE_ROLE_KEY to refund from here. Until then, refund from the Razorpay dashboard and use “Mark refunded manually”.
    </Notice>
  );
}

/**
 * Refund controls for a payment that is flagged refund-due. Only actions valid for its state are
 * shown, and each one asks for explicit confirmation before anything is recorded or sent.
 */
export function PaymentRefundActions({ orderId, orderNumber, customer, amount, refunded, provider, status, refundRequired, razorpayConfigured }: {
  orderId: string; orderNumber: string; customer: string | null; amount: number; refunded: number; provider: Enums<"payment_provider">;
  status: Enums<"payment_status">; refundRequired: boolean; razorpayConfigured: boolean;
}) {
  const router = useRouter();
  const outstanding = Math.max(0, Math.round((amount - refunded) * 100) / 100);
  const [confirmRzp, setConfirmRzp] = React.useState(false);
  const [manual, setManual] = React.useState<null | "form" | "confirm">(null);
  const [amt, setAmt] = React.useState(String(outstanding));
  const [ref, setRef] = React.useState("");
  const [errors, setErrors] = React.useState<{ amt?: string; ref?: string }>({});
  const [busy, setBusy] = React.useState(false);

  if (!refundRequired || status === "refunded") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-ink-3">{status === "refunded" ? "Fully refunded. No actions left." : "No refund is due on this payment. To refund a delivered order, open the order."}</p>
        <Link href={`/admin/orders/${orderId}`} className={btn.secondary}>Open order</Link>
      </div>
    );
  }

  const runRzp = async () => {
    setBusy(true); const r = await issueRefundAction(orderId, outstanding); setBusy(false);
    if (r.ok) { toast.success(`Refunded ${rupees(r.data.amount)} via Razorpay`, `Refund id ${r.data.refundId}`); setConfirmRzp(false); router.refresh(); }
    else toast.error("Refund not issued", r.error);
  };
  const review = () => {
    const e: typeof errors = {}; const n = Number(amt);
    if (!Number.isFinite(n) || n <= 0) e.amt = "Enter the amount you refunded.";
    else if (n > outstanding + 0.001) e.amt = `That's more than the ${rupees(outstanding)} still owed.`;
    if (ref.trim().length < 3) e.ref = "Enter the UTR or reference number (at least 3 characters).";
    setErrors(e); if (!Object.keys(e).length) setManual("confirm");
  };
  const runManual = async () => {
    setBusy(true); const r = await markRefundManualAction(orderId, ref.trim(), Number(amt)); setBusy(false);
    if (r.ok) { toast.success(`Recorded ${rupees(Number(amt))} as refunded`); setManual(null); setRef(""); router.refresh(); }
    else { toast.error("Couldn't record the refund", r.error); setManual("form"); }
  };
  const openManual = () => { setAmt(String(outstanding)); setErrors({}); setManual("form"); };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="mr-auto text-xs text-ink-3"><span className="font-semibold text-danger">Refund due:</span> {rupees(outstanding)}</p>
      {provider === "razorpay" ? (
        <button type="button" className={btn.primary} disabled={!razorpayConfigured} title={razorpayConfigured ? undefined : "Razorpay keys and the service role key aren't configured"} onClick={() => setConfirmRzp(true)}>
          <RotateCcw className="h-4 w-4" aria-hidden />Refund {rupees(outstanding)}
        </button>
      ) : null}
      <button type="button" className={btn.secondary} onClick={openManual}><CheckCircle2 className="h-4 w-4" aria-hidden />Mark refunded manually</button>

      <ConfirmDialog open={confirmRzp} onClose={() => !busy && setConfirmRzp(false)} loading={busy} tone="danger" confirmLabel={`Refund ${rupees(outstanding)}`} onConfirm={runRzp}
        title={`Refund ${rupees(outstanding)} via Razorpay?`}
        description={<>Order {orderNumber}{customer ? ` · ${customer}` : ""}. The money goes back to the customer&apos;s original payment method. This can&apos;t be undone.</>} />

      <Modal open={manual !== null} onClose={() => !busy && setManual(null)} size="sm"
        title={manual === "confirm" ? "Confirm manual refund" : "Mark refunded manually"}
        description={manual === "confirm" ? undefined : "For money returned outside Razorpay: bank transfer, UPI, cash, or wallet credit already given."}
        footer={manual === "confirm" ? (
          <div className="flex gap-2"><button type="button" className={cn(btn.secondary, "flex-1")} disabled={busy} onClick={() => setManual("form")}>Back</button><button type="button" className={cn(btn.primary, "flex-1")} disabled={busy} onClick={runManual}>{busy ? "Saving…" : `Mark ${rupees(Number(amt))} refunded`}</button></div>
        ) : (
          <div className="flex gap-2"><button type="button" className={cn(btn.secondary, "flex-1")} onClick={() => setManual(null)}>Cancel</button><button type="button" className={cn(btn.primary, "flex-1")} onClick={review}>Review</button></div>
        )}>
        {manual === "confirm" ? (
          <div className="space-y-3 text-sm">
            <DetailList items={[{ label: "Order", value: orderNumber }, { label: "Amount", value: rupees(Number(amt)), strong: true }, { label: "Reference", value: <span className="font-mono">{ref.trim()}</span> }]} />
            <p className="text-ink-2">This records the payment as refunded. It doesn&apos;t move any money, so only confirm once the customer has actually been paid.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Input label="Amount refunded (₹)" required type="number" inputMode="decimal" min={0} step="0.01" value={amt} error={errors.amt} onChange={(e) => { setAmt(e.target.value); setErrors((x) => ({ ...x, amt: undefined })); }} hint={`Still owed: ${rupees(outstanding)}`} />
            <Input label="UTR / reference" required value={ref} error={errors.ref} onChange={(e) => { setRef(e.target.value); setErrors((x) => ({ ...x, ref: undefined })); }} maxLength={120} placeholder="e.g. UPI ref 4183…" />
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================================================================================================
 * Payouts
 * ============================================================================================== */

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const istToday = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
const dayText = (d: string) => formatDate(`${d}T00:00:00+05:30`, { day: "numeric", month: "short", year: "numeric" });

/** Generate payouts for a date range: pick dates, review, then confirm. */
export function GeneratePayouts({ label = "Generate payouts" }: { label?: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState<null | "form" | "confirm">(null);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [maxDay, setMaxDay] = React.useState("");

  const open = () => {
    const today = istToday(); const lastMon = new Date(today); lastMon.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
    const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
    setStart(isoDay(lastMon)); setEnd(isoDay(lastSun)); setMaxDay(isoDay(today)); setError(null); setStep("form");
  };
  const review = () => {
    if (!start || !end) return setError("Choose both dates.");
    if (end < start) return setError("The end date must be on or after the start date.");
    if (end > maxDay) return setError("The end date can't be in the future.");
    setError(null); setStep("confirm");
  };
  const run = async () => {
    setBusy(true); const r = await generatePayoutsAction(start, end); setBusy(false);
    if (r.ok) {
      if (r.data.created) toast.success(`Created ${r.data.created} ${r.data.created === 1 ? "payout" : "payouts"}`, `Total ${rupees(r.data.total_amount)} for ${dayText(start)} – ${dayText(end)}`);
      else toast.info("No new payouts", "Every delivered order in this range is already covered by a payout.");
      setStep(null); router.refresh();
    } else { toast.error("Payouts not generated", r.error); setStep("form"); }
  };

  return (
    <>
      <button type="button" className={btn.primary} onClick={open}><Sparkles className="h-4 w-4" aria-hidden />{label}</button>
      <Modal open={step !== null} onClose={() => !busy && setStep(null)} size="sm" title={step === "confirm" ? "Generate these payouts?" : "Generate payouts"}
        description={step === "confirm" ? undefined : "One payout per store for delivered and completed orders in the range."}
        footer={step === "confirm" ? (
          <div className="flex gap-2"><button type="button" className={cn(btn.secondary, "flex-1")} disabled={busy} onClick={() => setStep("form")}>Back</button><button type="button" className={cn(btn.primary, "flex-1")} disabled={busy} onClick={run}>{busy ? "Generating…" : "Generate payouts"}</button></div>
        ) : (
          <div className="flex gap-2"><button type="button" className={cn(btn.secondary, "flex-1")} onClick={() => setStep(null)}>Cancel</button><button type="button" className={cn(btn.primary, "flex-1")} onClick={review}>Review</button></div>
        )}>
        {step === "confirm" ? (
          <div className="space-y-3 text-sm text-ink-2">
            <p>Create a pending payout for each store with delivered or completed orders from <strong className="text-ink">{dayText(start)}</strong> to <strong className="text-ink">{dayText(end)}</strong> (IST).</p>
            <p>Orders already covered by an existing payout are skipped, so running this again is safe. No money is sent; you mark each payout paid after transferring it.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="From" type="date" required value={start} max={maxDay} onChange={(e) => { setStart(e.target.value); setError(null); }} />
              <Input label="To" type="date" required value={end} max={maxDay} onChange={(e) => { setEnd(e.target.value); setError(null); }} />
            </div>
            {error ? <p className="text-xs font-medium text-danger" role="alert">{error}</p> : null}
            <p className="text-xs text-ink-3">Net = merchandise sales − commission − store-funded coupon discounts. Delivery, platform fees and GST stay with the platform.</p>
          </div>
        )}
      </Modal>
    </>
  );
}

type PayoutStatus = Enums<"payout_status">;
const TRANSITIONS: Record<PayoutStatus, { to: PayoutStatus; label: string; primary?: boolean }[]> = {
  pending: [{ to: "processing", label: "Start processing", primary: true }, { to: "paid", label: "Mark paid" }],
  processing: [{ to: "paid", label: "Mark paid", primary: true }, { to: "failed", label: "Mark failed" }],
  failed: [{ to: "processing", label: "Retry processing", primary: true }, { to: "pending", label: "Back to pending" }],
  paid: [],
};
const STATUS_WORD: Record<PayoutStatus, string> = { pending: "pending", processing: "processing", paid: "paid", failed: "failed" };

export type PayoutSummary = { id: string; status: PayoutStatus; net_amount: number; reference_no: string | null; store: string; period_start: string; period_end: string; payTo: string | null };

/** Status changes allowed from the payout's current state, each behind a confirm dialog. */
export function PayoutActions({ payout, compact }: { payout: PayoutSummary; compact?: boolean }) {
  const router = useRouter();
  const [next, setNext] = React.useState<PayoutStatus | null>(null);
  const [ref, setRef] = React.useState(payout.reference_no ?? "");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const options = TRANSITIONS[payout.status] ?? [];
  if (!options.length) return compact ? null : <p className="text-xs text-ink-3">Paid. No further changes.</p>;
  const shown = compact ? options.filter((o) => o.primary) : options;

  const open = (to: PayoutStatus) => { setNext(to); setRef(payout.reference_no ?? ""); setNote(""); setError(null); };
  const run = async () => {
    if (!next) return;
    if (next === "paid" && ref.trim().length < 3) { setError("Enter the bank or UPI reference (UTR). The store sees it in their notification."); return; }
    setBusy(true); const r = await setPayoutStatusAction(payout.id, next, ref.trim() || undefined, note.trim() || undefined); setBusy(false);
    if (r.ok) { toast.success(`Payout marked ${STATUS_WORD[next]}`, `${payout.store} · ${rupees(payout.net_amount)}`); setNext(null); router.refresh(); }
    else setError(r.error);
  };
  const confirmLabel = next === "paid" ? `Mark ${rupees(payout.net_amount)} paid` : next ? `Mark ${STATUS_WORD[next]}` : "Confirm";

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", !compact && "w-full")}>
      {shown.map((o) => (
        <button key={o.to} type="button" onClick={() => open(o.to)} className={cn(o.primary ? btn.primary : o.to === "failed" ? btn.dangerOutline : btn.secondary, compact && btn.small)}>
          {o.to === "paid" ? <Banknote className="h-3.5 w-3.5" aria-hidden /> : null}{o.label}
        </button>
      ))}
      <Modal open={next !== null} onClose={() => !busy && setNext(null)} size="sm" title={next === "paid" ? "Confirm payout sent" : `Mark payout ${next ? STATUS_WORD[next] : ""}?`}
        footer={<div className="flex gap-2"><button type="button" className={cn(btn.secondary, "flex-1")} disabled={busy} onClick={() => setNext(null)}>Cancel</button><button type="button" className={cn(next === "failed" ? btn.danger : btn.primary, "flex-1")} disabled={busy} onClick={run}>{busy ? "Saving…" : confirmLabel}</button></div>}>
        <div className="space-y-3 text-sm">
          <DetailList items={[
            { label: "Store", value: payout.store },
            { label: "Period", value: `${dayText(payout.period_start)} – ${dayText(payout.period_end)}` },
            { label: "Net amount", value: rupees(payout.net_amount), strong: true },
            { label: "Pay to", value: payout.payTo ?? <span className="text-danger">No bank or UPI details on file</span> },
          ]} />
          {next === "paid" ? <p className="text-ink-2">Only confirm after the transfer has gone through. The store is notified that {rupees(payout.net_amount)} was sent, with this reference.</p> : null}
          {next === "failed" ? <p className="text-ink-2">Use when the transfer bounced or was rejected. You can retry it later.</p> : null}
          <Input label={next === "paid" ? "Bank / UPI reference (UTR)" : "Reference (optional)"} required={next === "paid"} value={ref} onChange={(e) => { setRef(e.target.value); setError(null); }} maxLength={120} />
          <Textarea label={next === "failed" ? "What went wrong (optional)" : "Note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
          {error ? <p className="text-xs font-medium text-danger" role="alert">{error}</p> : null}
        </div>
      </Modal>
    </span>
  );
}
