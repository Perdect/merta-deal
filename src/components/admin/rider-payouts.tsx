"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { createRiderPayoutAction, settleRiderPayoutAction, adminConfirmDeliveryAction } from "@/lib/actions/admin-delivery";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { formatINR } from "@/lib/utils";

/** "Create payout": everything payable for this rider becomes one payout in Processing. */
export function CreateRiderPayout({ riderId, name, payable }: { riderId: string; name: string; payable: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    setBusy(true);
    const r = await createRiderPayoutAction(riderId);
    setBusy(false); setOpen(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Payout of ${formatINR(r.data.amount)} created`, `${r.data.earnings} deliveries · send the money, then mark it paid.`);
    router.refresh();
  };
  return (
    <>
      <Button size="sm" variant="outline" disabled={payable <= 0} onClick={() => setOpen(true)}>Create payout</Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={go} loading={busy} title={`Pay ${name} ${formatINR(payable)}?`} confirmLabel="Create payout"
        description="All payable earnings move to Processing. Transfer the money to the rider, then mark the payout Paid with the UPI/bank reference — or Failed to make them payable again." />
    </>
  );
}

/** Settle a Processing payout: Paid (reference required) or Failed (reason). */
export function SettleRiderPayout({ payoutId, amount, name }: { payoutId: string; amount: number; name: string }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<null | "paid" | "failed">(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    setBusy(true);
    const r = await settleRiderPayoutAction(payoutId, mode, mode === "paid" ? text : undefined, mode === "failed" ? text : undefined);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(mode === "paid" ? "Marked paid" : "Marked failed", mode === "failed" ? "The earnings are payable again." : undefined);
    setMode(null); setText(""); router.refresh();
  };
  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" onClick={() => setMode("paid")}>Mark paid</Button>
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setMode("failed")}>Failed</Button>
      </div>
      <Modal open={mode !== null} onClose={() => setMode(null)} title={mode === "paid" ? `Mark ${formatINR(amount)} to ${name} as paid` : "Mark payout as failed"}>
        <form onSubmit={submit} className="space-y-4">
          {mode === "paid"
            ? <Input label="UPI / bank transaction reference" required value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. UTR 4455667788" hint="Only mark paid after the money has actually reached the rider." />
            : <Textarea label="What went wrong?" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. UPI ID rejected by the bank" />}
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setMode(null)}>Cancel</Button><Button type="submit" className="flex-1" loading={busy} disabled={mode === "paid" && text.trim().length < 4}>Confirm</Button></div>
        </form>
      </Modal>
    </>
  );
}

/**
 * Support path for a customer who can't reach their delivery OTP: confirm with the customer (call
 * the registered number), then complete the handover. Audited; the rider can never do this.
 */
export function SupportConfirmDelivery({ orderId, cod, total }: { orderId: string; cod: boolean; total: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [cash, setCash] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await adminConfirmDeliveryAction(orderId, reason, cod && cash);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.data.already ? "Already delivered" : "Delivery confirmed", "Recorded in the audit log.");
    setOpen(false); router.refresh();
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Customer can&rsquo;t share OTP?</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Confirm delivery without OTP" description="Use only after confirming the handover with the customer on their registered number. This is recorded with your name in the audit log.">
        <form onSubmit={submit} className="space-y-4">
          <Textarea label="How did you confirm the handover?" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Called customer on registered number; phone with the app is off; confirmed items received" />
          {cod ? (
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-line p-3 text-sm font-medium text-ink">
              <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} className="h-5 w-5 accent-brand-600" />
              The rider confirmed collecting {formatINR(total)} in cash
            </label>
          ) : null}
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="flex-1" loading={busy} disabled={reason.trim().length < 10 || (cod && !cash)}>Confirm delivery</Button></div>
        </form>
      </Modal>
    </>
  );
}
