"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { DetailList, rupees } from "@/components/admin/kit";
import { Input } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { btn, Notice } from "@/components/admin/care/shared";
import { issueRefundAction, markRefundManualAction } from "@/lib/actions/admin";
import type { Enums } from "@/types/database";
import { cn } from "@/lib/utils";

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
