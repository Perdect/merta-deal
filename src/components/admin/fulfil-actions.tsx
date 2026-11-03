"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, PackageCheck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { fulfilOrderAction, type FulfilAction } from "@/lib/actions/admin";
import type { OrderTracking } from "@/types/app";
import { cn } from "@/lib/utils";

const REJECT_REASONS = ["Items out of stock", "Too busy right now", "Cannot deliver to this address", "Customer unreachable"];

/**
 * Packing controls for one order (quick-commerce flow). Orders confirm automatically; "Accept" only
 * appears while an online payment is pending or auto-confirm is switched off. "Packed · call rider"
 * requests a rider. Delivery itself is only ever completed by the rider's OTP check.
 */
export function FulfilActions({ tracking: t, compact, className }: { tracking: OrderTracking; compact?: boolean; className?: string }) {
  const router = useRouter();
  const o = t.order;
  const [busy, setBusy] = React.useState<FulfilAction | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reason, setReason] = React.useState(REJECT_REASONS[0]);
  const [note, setNote] = React.useState("");
  const unpaid = o.payment_method !== "cod" && !["paid", "authorized"].includes(o.payment_status);
  const size = compact ? "sm" : "md";

  const run = async (action: FulfilAction, text?: string) => {
    if (busy) return;
    setBusy(action);
    const r = await fulfilOrderAction(o.id, action, text);
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    setRejectOpen(false);
    toast.success(action === "accept" ? "Order accepted" : action === "reject" ? "Order rejected" : r.data.assignment_id ? "Packed · rider requested" : "Packed",
      action === "ready" && !r.data.assignment_id ? "No rider is online right now; the request goes out as soon as one comes online." : undefined);
    router.refresh();
  };

  const s = o.status;
  if (!["placed", "confirmed", "preparing"].includes(s)) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {s === "placed" ? (
        <>
          <Button size={size} variant="primary" loading={busy === "accept"} disabled={unpaid || busy !== null} onClick={() => run("accept")} title={unpaid ? "Waiting for online payment" : undefined}><Check className="h-4 w-4" /> Accept</Button>
          {unpaid ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#8a6300]"><CreditCard className="h-3.5 w-3.5" /> Payment pending{compact ? "" : " — confirmed automatically once paid"}</span> : null}
        </>
      ) : (
        <Button size={size} variant="primary" loading={busy === "ready"} disabled={busy !== null} onClick={() => run("ready")}><PackageCheck className="h-4 w-4" /> Packed · call rider</Button>
      )}
      <Button size={size} variant="outline" className="text-danger" disabled={busy !== null} onClick={() => setRejectOpen(true)}><X className="h-4 w-4" /> Can&apos;t fulfil</Button>

      <Modal open={rejectOpen} onClose={() => (busy ? undefined : setRejectOpen(false))} title="Can't fulfil this order?" description="The customer is told why, stock is restored and any online payment is refunded automatically." size="sm"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={busy !== null} onClick={() => setRejectOpen(false)}>Keep order</Button><Button variant="danger" className="flex-1" loading={busy === "reject"} disabled={busy !== null} onClick={() => run("reject", note.trim() ? `${reason} — ${note.trim()}` : reason)}>Reject order</Button></div>}>
        <div className="space-y-2">
          {REJECT_REASONS.map((r) => (
            <label key={r} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm border px-3 py-2.5 text-sm", reason === r ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-2 text-ink")}>
              <input type="radio" name="reject-reason" className="accent-brand-600" checked={reason === r} onChange={() => setReason(r)} />{r}
            </label>
          ))}
          <Textarea label="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Amul butter and bread finished for today" className="min-h-20" />
        </div>
      </Modal>
    </div>
  );
}
