"use client";
import * as React from "react";
import { Check, X, Package, PackageCheck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { storeOrderAction, type StoreOrderAction } from "@/lib/actions/store";
import type { Enums } from "@/types/database";
import { cn } from "@/lib/utils";
import { isPaymentPending } from "./constants";

const REJECT_REASONS = ["Items out of stock", "Store is closing / too busy", "Cannot deliver to this address", "Customer unreachable"];

export type OrderActionTarget = { id: string; status: Enums<"order_status">; payment_method: Enums<"payment_method">; payment_status: Enums<"payment_status"> };

/**
 * Store-side lifecycle buttons. Only the transitions the DB allows are shown:
 * placed → accept/reject · store_confirmed → preparing/ready · preparing → ready.
 * "Delivered" is never offered here: only the rider's OTP verification can set it.
 */
export function OrderActions({ order, size = "md", compact, onDone, className }: { order: OrderActionTarget; size?: "sm" | "md"; compact?: boolean; onDone?: (status: Enums<"order_status">) => void; className?: string }) {
  const [busy, setBusy] = React.useState<StoreOrderAction | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reason, setReason] = React.useState(REJECT_REASONS[0]);
  const [note, setNote] = React.useState("");
  const unpaid = isPaymentPending(order);

  const run = async (action: StoreOrderAction, text?: string) => {
    setBusy(action);
    const r = await storeOrderAction(order.id, action, text);
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    setRejectOpen(false);
    toast.success(action === "accept" ? "Order accepted" : action === "reject" ? "Order rejected" : action === "preparing" ? "Marked as packing" : r.data.assignment_id ? "Ready · rider requested" : "Ready for pickup", action === "ready" && !r.data.assignment_id ? "No rider is online right now; dispatch will retry automatically." : undefined);
    onDone?.(r.data.status);
  };

  const s = order.status;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {s === "placed" ? (
        <>
          <Button size={size} variant="primary" loading={busy === "accept"} disabled={unpaid || busy !== null} onClick={() => run("accept")} title={unpaid ? "Waiting for online payment" : undefined}><Check className="h-4 w-4" /> Accept</Button>
          <Button size={size} variant="outline" className="text-danger" disabled={busy !== null} onClick={() => setRejectOpen(true)}><X className="h-4 w-4" /> Reject</Button>
          {unpaid ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#8a6300]"><CreditCard className="h-3.5 w-3.5" /> {compact ? "Payment pending" : "Accept unlocks once the online payment is received"}</span> : null}
        </>
      ) : s === "store_confirmed" ? (
        <>
          <Button size={size} variant="secondary" loading={busy === "preparing"} disabled={busy !== null} onClick={() => run("preparing")}><Package className="h-4 w-4" /> Start packing</Button>
          <Button size={size} variant="primary" loading={busy === "ready"} disabled={busy !== null} onClick={() => run("ready")}><PackageCheck className="h-4 w-4" /> Ready for pickup</Button>
        </>
      ) : s === "preparing" ? (
        <Button size={size} variant="primary" loading={busy === "ready"} disabled={busy !== null} onClick={() => run("ready")}><PackageCheck className="h-4 w-4" /> Ready for pickup</Button>
      ) : null}

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject this order?" description="The customer is notified with your reason and any online payment is refunded automatically." size="sm"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setRejectOpen(false)}>Keep order</Button><Button variant="danger" className="flex-1" loading={busy === "reject"} onClick={() => run("reject", note.trim() ? `${reason} — ${note.trim()}` : reason)}>Reject order</Button></div>}>
        <div className="space-y-2">
          {REJECT_REASONS.map((r) => (
            <label key={r} className={cn("flex cursor-pointer items-center gap-2.5 rounded-sm border px-3 py-2.5 text-sm", reason === r ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-2 text-ink")}>
              <input type="radio" name="reason" className="accent-brand-600" checked={reason === r} onChange={() => setReason(r)} />{r}
            </label>
          ))}
          <Textarea label="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Amul butter and bread finished for today" className="min-h-20" />
        </div>
      </Modal>
    </div>
  );
}
