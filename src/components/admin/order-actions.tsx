"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Bike, RefreshCw, XCircle, RotateCcw, Wifi, WifiOff, MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/states";
import { Avatar, StarRating } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import { assignRiderAction, redispatchAction, adminCancelOrderAction, issueRefundAction, markRefundManualAction } from "@/lib/actions/admin";
import type { OrderTracking } from "@/types/app";
import type { LiveRider } from "@/lib/data/admin";
import { cn, formatINR, haversineKm, timeAgo } from "@/lib/utils";

const ASSIGNABLE = ["store_confirmed", "preparing", "ready_for_pickup"];
const CANCELLABLE = ["placed", "store_confirmed", "preparing", "ready_for_pickup", "rider_assigned", "out_for_delivery"];

/** Admin controls for one order. Subscribes to realtime so the page refreshes when the store/rider act. */
export function OrderAdminActions({ tracking: t, riders, razorpayConfigured, compact }: { tracking: OrderTracking; riders: LiveRider[]; razorpayConfigured: boolean; /** Single row of buttons (quick-view footer). */ compact?: boolean }) {
  const router = useRouter();
  const o = t.order;
  const [busy, setBusy] = React.useState<string | null>(null);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [manualOpen, setManualOpen] = React.useState(false);
  const [refundAmount, setRefundAmount] = React.useState(String(t.payment?.amount ?? o.total));
  const [reference, setReference] = React.useState("");
  const [riderQ, setRiderQ] = React.useState("");
  const connected = useOrderRealtime(o.id, t.assignment?.id ?? null, () => router.refresh());

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(key); const r = await fn(); setBusy(null);
    if (r.ok) { toast.success(okMsg); router.refresh(); return true; }
    toast.error(r.error ?? "Something went wrong"); return false;
  };

  const online = riders.filter((r) => !r.busy || r.current_order?.id === o.id).map((r) => ({ ...r, km: r.lat != null && r.lng != null ? haversineKm(r.lat, r.lng, t.store.lat, t.store.lng) : null })).sort((a, b) => (a.km ?? 999) - (b.km ?? 999));
  const visibleRiders = online.filter((r) => !riderQ || (r.name ?? "").toLowerCase().includes(riderQ.toLowerCase()) || (r.vehicle_number ?? "").toLowerCase().includes(riderQ.toLowerCase()));
  const canAssign = ASSIGNABLE.includes(o.status) && (!t.assignment || t.assignment.status === "offered");
  const canCancel = CANCELLABLE.includes(o.status);
  const refundable = t.payment && t.payment.provider === "razorpay" && ["paid", "authorized", "partially_refunded"].includes(t.payment.status);
  const refundPending = t.payment?.refund_required;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs"><span className="font-semibold text-ink-3">{compact ? "Actions for this order" : "Admin actions"}</span><span className={cn("inline-flex items-center gap-1 font-semibold", connected ? "text-success" : "text-ink-4")}>{connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{connected ? "Live updates" : "Refreshing every 20 s"}</span></div>

      {o.status === "ready_for_pickup" && !t.assignment ? <Alert tone="warning" title="No rider on this order">Auto-dispatch found nobody within range. Assign a rider manually or re-run dispatch.</Alert> : null}
      {refundPending ? <Alert tone="danger" title="Refund pending">{formatINR(Number(t.payment!.amount))} was paid online and the order is cancelled. Issue the refund below.</Alert> : null}

      <div className={cn(compact ? "flex flex-wrap gap-2 [&>button]:h-9 [&>button]:px-3 [&>button]:text-sm" : "grid gap-2")}>
        {canAssign ? <Button variant="primary" onClick={() => setAssignOpen(true)}><Bike className="h-4 w-4" /> Assign rider</Button> : null}
        {o.status === "ready_for_pickup" ? <Button variant="outline" loading={busy === "dispatch"} onClick={() => run("dispatch", async () => { const r = await redispatchAction(o.id); if (r.ok && !r.data.assignmentId) return { ok: false, error: "Still no eligible rider within the dispatch radius (online, active, free, not previously declined)." }; return r; }, "Dispatch offer sent to nearest rider")}><RefreshCw className="h-4 w-4" /> Re-run auto-dispatch</Button> : null}
        {canCancel ? <Button variant="outline" className="text-danger" onClick={() => setCancelOpen(true)}><XCircle className="h-4 w-4" /> Cancel order</Button> : null}
        {refundable ? <Button variant={refundPending ? "danger" : "outline"} onClick={() => setRefundOpen(true)}><RotateCcw className="h-4 w-4" /> Issue refund</Button> : null}
        {refundPending ? <Button variant="ghost" size="sm" onClick={() => setManualOpen(true)}>Mark refunded manually</Button> : null}
        {!canAssign && !canCancel && !refundable && !refundPending ? <p className="text-xs text-ink-3">No actions are available once an order is {o.status.replace(/_/g, " ")}.</p> : null}
      </div>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign a rider" description={`Online riders sorted by distance to ${t.store.name}. The rider gets an offer and must accept.`} size="lg">
        <Input placeholder="Filter by name or vehicle" value={riderQ} onChange={(e) => setRiderQ(e.target.value)} aria-label="Filter riders" />
        {visibleRiders.length === 0 ? <p className="py-8 text-center text-sm text-ink-3">{riders.length ? "No free online riders match." : "No riders are online right now."}</p> : (
          <ul className="mt-3 divide-y divide-line">
            {visibleRiders.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={r.name} src={r.avatar_url} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{r.name ?? "Rider"} <span className="ml-1 text-xs font-normal capitalize text-ink-3">{r.vehicle_type}{r.vehicle_number ? ` · ${r.vehicle_number}` : ""}</span></p>
                  <p className="flex items-center gap-2 text-xs text-ink-3"><StarRating value={r.rating_avg} size={11} />{r.km != null ? <span className="tabular">{r.km.toFixed(1)} km from store</span> : <span className="inline-flex items-center gap-1"><MapPinOff className="h-3 w-3" /> no GPS fix</span>}{r.last_location_at ? <span>· seen {timeAgo(r.last_location_at)}</span> : null}{r.busy ? <Badge tone="info" size="xs">on this order</Badge> : null}</p>
                </div>
                <Button size="sm" loading={busy === r.id} onClick={() => run(r.id, () => assignRiderAction(o.id, r.id), `Offer sent to ${r.name ?? "rider"}`).then((ok) => ok && setAssignOpen(false))}>Assign</Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this order" size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setCancelOpen(false)}>Keep order</Button><Button variant="danger" fullWidth loading={busy === "cancel"} onClick={() => run("cancel", () => adminCancelOrderAction(o.id, reason), "Order cancelled").then((ok) => ok && setCancelOpen(false))}>Cancel order</Button></div>}>
        <p className="mb-3 text-sm text-ink-2">Stock is restored, any live rider assignment is cancelled, the store is notified and online payments are flagged for refund.</p>
        <Textarea label="Reason (visible to customer & store)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Store could not fulfil — items unavailable" />
      </Modal>

      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title="Issue Razorpay refund" size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setRefundOpen(false)}>Cancel</Button><Button fullWidth disabled={!razorpayConfigured} loading={busy === "refund"} onClick={() => run("refund", () => issueRefundAction(o.id, Number(refundAmount)), "Refund issued").then((ok) => ok && setRefundOpen(false))}>Refund {formatINR(Number(refundAmount) || 0)}</Button></div>}>
        {!razorpayConfigured ? <Alert tone="warning" title="Razorpay is not configured" className="mb-3">Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and SUPABASE_SERVICE_ROLE_KEY to refund from here. Until then, refund from the Razorpay dashboard and use “Mark refunded manually”.</Alert> : null}
        <Input label="Amount (₹)" type="number" min={1} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} hint={`Paid ${formatINR(Number(t.payment?.amount ?? 0), { precise: true })}. Partial refunds allowed.`} />
      </Modal>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Mark refunded manually" description="Use when the money was returned outside Razorpay (bank transfer, UPI, cash)." size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setManualOpen(false)}>Cancel</Button><Button fullWidth loading={busy === "manual"} onClick={() => run("manual", () => markRefundManualAction(o.id, reference, Number(refundAmount)), "Marked as refunded").then((ok) => ok && setManualOpen(false))}>Mark refunded</Button></div>}>
        <div className="space-y-3">
          <Input label="Amount (₹)" type="number" min={1} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
          <Input label="Reference / UTR" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR or transaction id" required />
        </div>
      </Modal>
    </div>
  );
}
