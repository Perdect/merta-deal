"use client";
import * as React from "react";
import { Banknote, CheckCircle2, Search } from "lucide-react";
import { UpiQr } from "@/components/shared/upi-qr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { claimUpiPaymentAction, upiToCashAction } from "@/lib/actions/upi";
import type { UpiDetails } from "@/lib/upi";
import { formatINR, formatTime } from "@/lib/utils";

type Claim = { reference: string | null; claimed_at: string | null; checked_at: string | null };

/**
 * A placed order waiting for a direct UPI payment: the QR and app buttons, "I've paid" with an optional
 * reference, and a way out to cash on delivery. Nothing here confirms the order; the admin does that
 * once the money shows in the bank, and the page updates over Realtime when they do.
 */
export function UpiPayCard({ upi, orderId, orderNumber, amount, claim, onChanged }: { upi: UpiDetails; orderId: string; orderNumber: string; amount: number; claim: Claim | null; onChanged: () => void }) {
  const [ref, setRef] = React.useState(claim?.reference ?? "");
  const [claimedAt, setClaimedAt] = React.useState<string | null>(claim?.claimed_at ?? null);
  const [busy, setBusy] = React.useState<"claim" | "cash" | null>(null);
  const notFound = Boolean(claim?.checked_at && (!claimedAt || new Date(claim!.checked_at!).getTime() > new Date(claimedAt).getTime()));

  const said = async () => {
    if (busy) return; setBusy("claim");
    try {
      const r = await claimUpiPaymentAction(orderId, ref);
      if (!r.ok) { toast.error("Not saved", r.error); return; }
      setClaimedAt(r.data.claimed_at);
      toast.success("Thanks, we're checking your payment", "Your order is confirmed as soon as it shows in our bank.");
      onChanged();
    } catch { toast.error("Could not send that", "Check your connection and try again."); }
    finally { setBusy(null); }
  };
  const cash = async () => {
    if (busy) return; setBusy("cash");
    try {
      const r = await upiToCashAction(orderId);
      if (!r.ok) { toast.error("Could not switch", r.error); return; }
      toast.success("Switched to cash on delivery", `Keep ${formatINR(amount, { precise: true })} ready for the rider.`);
      onChanged();
    } catch { toast.error("Could not switch", "Check your connection and try again."); }
    finally { setBusy(null); }
  };

  return (
    <section className="rounded-lg border border-brand-600 bg-card p-4 shadow-card" aria-labelledby="upi-pay-title">
      <h2 id="upi-pay-title" className="font-display text-lg font-bold text-ink">Pay {formatINR(amount, { precise: true })} to confirm your order</h2>
      <p className="mt-1 text-sm text-ink-2">Open PhonePe, Google Pay or Paytm below, or scan the QR from another phone. The amount and order number are filled in. We start packing as soon as your payment is confirmed.</p>
      <div className="mt-3"><UpiQr upi={upi} amount={amount} note={orderNumber} /></div>
      <div className="mt-4 rounded-md bg-surface p-3">
        {claimedAt && !notFound ? <p className="mb-2 flex items-start gap-2 text-sm font-semibold text-success"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />You told us you paid at {formatTime(claimedAt)}. We&rsquo;re checking; this page updates on its own.</p> : null}
        {notFound ? <p className="mb-2 flex items-start gap-2 text-sm font-semibold text-[#8a6300]"><Search className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />We looked and couldn&rsquo;t find a payment yet. If you have paid, enter the UPI reference from the success screen; otherwise pay now or choose cash.</p> : null}
        <Input label="UPI reference / UTR (optional)" value={ref} onChange={(e) => setRef(e.target.value.slice(0, 40))} placeholder="12-digit number on the payment success screen" hint="Helps us find your payment faster." maxLength={40} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={said} loading={busy === "claim"} disabled={busy !== null}><CheckCircle2 className="h-4 w-4" /> {claimedAt ? "Update reference" : "I've paid"}</Button>
          <Button variant="outline" onClick={cash} loading={busy === "cash"} disabled={busy !== null}><Banknote className="h-4 w-4" /> Pay cash instead</Button>
        </div>
      </div>
    </section>
  );
}
