"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, CheckCircle2, Sparkles, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { issueRefundAction, markRefundManualAction, generatePayoutsAction, setPayoutStatusAction } from "@/lib/actions/admin";
import { PAYOUT_STATUS_OPTIONS } from "@/components/admin/constants";
import type { Enums } from "@/types/database";
import { formatINR } from "@/lib/utils";

/** Inline refund controls for a payment row (refunds tab). */
export function RefundButtons({ orderId, amount, refunded, razorpayConfigured, provider }: { orderId: string; amount: number; refunded: number; razorpayConfigured: boolean; provider: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState(false);
  const [ref, setRef] = React.useState("");
  const outstanding = Math.max(0, amount - refunded);
  const [amt, setAmt] = React.useState(String(outstanding));
  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => { setBusy(key); const r = await fn(); setBusy(null); if (r.ok) { toast.success(okMsg); setManual(false); router.refresh(); } else toast.error(r.error ?? "Failed"); };
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {provider === "razorpay" ? <Button size="xs" disabled={!razorpayConfigured} title={razorpayConfigured ? undefined : "Razorpay keys + service role not configured"} loading={busy === "rzp"} onClick={() => run("rzp", () => issueRefundAction(orderId, outstanding), `Refunded ${formatINR(outstanding)}`)}><RotateCcw className="h-3.5 w-3.5" /> Refund {formatINR(outstanding)}</Button> : null}
      <Button size="xs" variant="outline" onClick={() => setManual(true)}><CheckCircle2 className="h-3.5 w-3.5" /> Mark refunded</Button>
      <Modal open={manual} onClose={() => setManual(false)} title="Mark refunded manually" description="Money returned outside Razorpay (bank/UPI/cash, or wallet already re-credited)." size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setManual(false)}>Cancel</Button><Button fullWidth loading={busy === "manual"} onClick={() => run("manual", () => markRefundManualAction(orderId, ref, Number(amt)), "Marked as refunded")}>Confirm</Button></div>}>
        <div className="space-y-3">
          <Input label="Amount (₹)" type="number" min={1} step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <Input label="Reference / UTR" value={ref} onChange={(e) => setRef(e.target.value)} required />
        </div>
      </Modal>
    </span>
  );
}

export function RazorpayNotice({ configured }: { configured: boolean }) {
  if (configured) return null;
  return <Alert tone="warning" title="Razorpay refunds unavailable on this deployment">Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and SUPABASE_SERVICE_ROLE_KEY to issue refunds from here. Until then refund from the Razorpay dashboard and use “Mark refunded”.</Alert>;
}

/** "Generate weekly payouts" for a date range. */
export function GeneratePayouts() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lastMon = new Date(today); lastMon.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
  const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
  const [start, setStart] = React.useState(iso(lastMon));
  const [end, setEnd] = React.useState(iso(lastSun));
  const run = async () => { setBusy(true); const r = await generatePayoutsAction(start, end); setBusy(false); if (r.ok) { toast.success(r.data.created ? `Created ${r.data.created} payouts totalling ${formatINR(r.data.total_amount)}` : "Nothing new — all delivered orders in this range are already covered by a payout"); setOpen(false); router.refresh(); } else toast.error(r.error); };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Sparkles className="h-4 w-4" /> Generate weekly payouts</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Generate payouts" description="One payout per store for delivered/completed orders in the range. Orders already covered by an existing payout are skipped, so re-running is safe." size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setOpen(false)}>Cancel</Button><Button fullWidth loading={busy} onClick={run}>Generate</Button></div>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="From" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="To" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <p className="mt-3 text-xs text-ink-3">Net = merchandise sales − commission − coupon discounts (store-funded). Delivery, platform fees and GST stay with the platform.</p>
      </Modal>
    </>
  );
}

export function PayoutStatusButton({ payoutId, status, amount, reference }: { payoutId: string; status: Enums<"payout_status">; amount: number; reference: string | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [next, setNext] = React.useState<Enums<"payout_status">>(status === "pending" ? "processing" : status === "processing" ? "paid" : status);
  const [ref, setRef] = React.useState(reference ?? "");
  const [note, setNote] = React.useState("");
  const run = async () => { setBusy(true); const r = await setPayoutStatusAction(payoutId, next, ref, note); setBusy(false); if (r.ok) { toast.success(`Payout marked ${next}`); setOpen(false); router.refresh(); } else toast.error(r.error); };
  if (status === "paid") return null;
  return (
    <>
      <Button size="xs" variant={status === "processing" ? "primary" : "outline"} onClick={() => setOpen(true)}><Banknote className="h-3.5 w-3.5" /> {status === "pending" ? "Start processing" : "Mark paid"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Update payout" description={`${formatINR(amount)} to the store's bank / UPI`} size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setOpen(false)}>Cancel</Button><Button fullWidth loading={busy} onClick={run}>Save</Button></div>}>
        <div className="space-y-3">
          <Select label="Status" options={PAYOUT_STATUS_OPTIONS} value={next} onChange={(e) => setNext(e.target.value as Enums<"payout_status">)} />
          <Input label="Reference / UTR" value={ref} onChange={(e) => setRef(e.target.value)} required={next === "paid"} hint={next === "paid" ? "Required — the store is notified with this reference." : undefined} />
          <Textarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
