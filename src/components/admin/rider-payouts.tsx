"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { settleRiderPayoutAction, adminConfirmDeliveryAction, recordCashRemittanceAction } from "@/lib/actions/admin-delivery";
import { createRiderPayoutWithOffsetAction, riderAdjustmentAction } from "@/lib/actions/finance";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { formatINR } from "@/lib/utils";

/**
 * "Create payout": everything payable for this rider becomes one payout in Processing. Cash the rider
 * still holds can be set off, but only explicitly: both amounts are shown and recorded, and the cash
 * side gets its own hand-over entry. Earnings and COD cash are never mixed silently.
 */
export function CreateRiderPayout({ riderId, name, payable, cashDue = 0 }: { riderId: string; name: string; payable: number; cashDue?: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [offset, setOffset] = React.useState("0");
  const [note, setNote] = React.useState("");
  const off = Math.max(0, Number(offset) || 0);
  const maxOffset = Math.min(cashDue, payable);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (off > maxOffset) { toast.error(`At most ${formatINR(maxOffset)} can be set off`); return; }
    setBusy(true);
    const r = await createRiderPayoutWithOffsetAction(riderId, off, note);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setOpen(false); setOffset("0"); setNote("");
    toast.success(`Payout of ${formatINR(r.data.amount)} created`, `${r.data.earnings} entries${r.data.cod_offset ? ` · ${formatINR(r.data.cod_offset)} cash set off` : ""} · send the money, then mark it paid.`);
    router.refresh();
  };
  return (
    <>
      <Button size="sm" variant="outline" disabled={payable <= 0} onClick={() => setOpen(true)}>Create payout</Button>
      <Modal open={open} onClose={() => (busy ? undefined : setOpen(false))} title={`Pay ${name}`} size="sm" description="All payable earnings move to Processing. Transfer the money, then mark the payout Paid with the reference, or Failed to make them payable again.">
        <form onSubmit={go} className="space-y-3">
          <dl className="grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded-md bg-surface p-2"><dt className="text-[11px] text-ink-3">Earnings payable</dt><dd className="font-bold tabular">{formatINR(payable)}</dd></div>
            <div className="rounded-md bg-surface p-2"><dt className="text-[11px] text-ink-3">COD cash held</dt><dd className="font-bold tabular">{formatINR(cashDue)}</dd></div>
          </dl>
          {cashDue > 0 ? <Input label="Set off cash held against earnings (₹)" type="number" inputMode="decimal" min={0} max={maxOffset} step="0.01" value={offset} onChange={(e) => setOffset(e.target.value)} hint={`Up to ${formatINR(maxOffset)}. The rider then hands over ${formatINR(Math.max(0, cashDue - off))} in cash and receives ${formatINR(Math.max(0, payable - off))}.`} /> : null}
          <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Week 45" />
          <p className="rounded-md bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">Pay out {formatINR(Math.max(0, payable - off))}{off ? ` (${formatINR(payable)} earnings − ${formatINR(off)} cash set off)` : ""}</p>
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="flex-1" loading={busy}>Create payout</Button></div>
        </form>
      </Modal>
    </>
  );
}

/** A manual plus or minus with a reason: its own earnings row, never a change to a delivery's pay. */
export function RiderAdjustment({ riderId, name }: { riderId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await riderAdjustmentAction(riderId, Number(amount), reason);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Adjustment recorded", `${formatINR(Number(amount))} for ${name}`); setOpen(false); setAmount(""); setReason(""); router.refresh();
  };
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Adjust</Button>
      <Modal open={open} onClose={() => (busy ? undefined : setOpen(false))} title={`Adjust ${name}'s earnings`} size="sm" description="Use a negative amount for a deduction. The reason is shown to the rider and kept in the audit log.">
        <form onSubmit={submit} className="space-y-3">
          <Input label="Amount (₹, negative to deduct)" type="number" inputMode="decimal" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Festival bonus · Late by 40 min" />
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="flex-1" loading={busy} disabled={!amount || reason.trim().length < 3}>Record</Button></div>
        </form>
      </Modal>
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
    if (!mode || busy) return;
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
      <Modal open={mode !== null} onClose={() => (busy ? undefined : setMode(null))} title={mode === "paid" ? `Mark ${formatINR(amount)} to ${name} as paid` : "Mark payout as failed"}>
        <form onSubmit={submit} className="space-y-4">
          {mode === "paid"
            ? <Input label="UPI / bank transaction reference" required value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. UTR 4455667788" hint="Only mark paid after the money has actually reached the rider." />
            : <Textarea label="What went wrong?" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. UPI ID rejected by the bank" />}
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setMode(null)}>Cancel</Button><Button type="submit" className="flex-1" loading={busy} disabled={mode === "paid" && text.trim().length < 4}>Confirm</Button></div>
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
    if (busy) return;
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
      <Modal open={open} onClose={() => (busy ? undefined : setOpen(false))} title="Confirm delivery without OTP" description="Use only after confirming the handover with the customer on their registered number. This is recorded with your name in the audit log.">
        <form onSubmit={submit} className="space-y-4">
          <Textarea label="How did you confirm the handover?" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Called customer on registered number; phone with the app is off; confirmed items received" />
          {cod ? (
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-line p-3 text-sm font-medium text-ink">
              <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} className="h-5 w-5 accent-brand-600" disabled={busy} />
              The rider confirmed collecting {formatINR(total)} in cash
            </label>
          ) : null}
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="flex-1" loading={busy} disabled={reason.trim().length < 10 || (cod && !cash)}>Confirm delivery</Button></div>
        </form>
      </Modal>
    </>
  );
}

/** "Record cash received": the rider hands over COD cash; the amount can't exceed what they hold. */
export function RecordCashReceived({ riderId, name, due }: { riderId: string; name: string; due: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const n = Number(amount);
  const fieldError = amount.trim() === "" ? undefined : !(n > 0) ? "Enter an amount above zero." : n > due + 0.001 ? `At most ${formatINR(due)} is due.` : undefined;
  const save = async () => {
    if (busy || fieldError || !(n > 0)) return;
    setBusy(true); setError(null);
    const r = await recordCashRemittanceAction(riderId, n, reference, note);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast.success(`${formatINR(n)} received from ${name}`, r.data.due > 0 ? `${formatINR(r.data.due)} still to hand over.` : "Nothing left to hand over.");
    setOpen(false); setAmount(""); setReference(""); setNote(""); router.refresh();
  };
  return (
    <>
      <Button size="sm" variant="outline" disabled={due <= 0} onClick={() => { setAmount(String(due)); setOpen(true); }}>Record cash</Button>
      <Modal open={open} onClose={() => (busy ? undefined : setOpen(false))} title={`Cash received from ${name}`} description={`${formatINR(due)} of cash-on-delivery money is with this rider.`}
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button className="flex-1" loading={busy} disabled={Boolean(fieldError) || !(n > 0)} onClick={save}>Record {n > 0 ? formatINR(n) : ""}</Button></div>}>
        <div className="space-y-3">
          <Input label="Amount received (₹)" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} error={fieldError} required />
          <Input label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UPI ref, or 'cash in hand'" maxLength={80} />
          <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" maxLength={200} />
          {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
        </div>
      </Modal>
    </>
  );
}
