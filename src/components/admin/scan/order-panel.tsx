"use client";
import * as React from "react";
import Link from "next/link";
import { Banknote, Bike, Check, ExternalLink, Minus, PackageCheck, Printer, ScanLine, Truck, AlertTriangle } from "lucide-react";
import { BottomSheet, ConfirmDialog } from "@/components/ui/overlay";
import { Alert, LoadingState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { ProductImage } from "@/components/shop/product-image";
import { OrderStatusPill } from "@/components/admin/kit/status";
import { assignRiderAction, confirmDispatchAction, listRidersAction, packCompleteAction, packStartAction, packUndoAction, type RiderOption } from "@/lib/actions/scan";
import type { PackResult, ScanOrder } from "@/lib/scan/types";
import type { OrderStatus } from "@/types/app";
import { cn, formatINR, formatDateTime, timeAgo } from "@/lib/utils";
import { newKey, BigButton } from "./shared";

export type LastScan = { result: PackResult | "pending"; message: string; at: number } | null;
const FLAG_LABEL: Record<string, string> = { wrong_product: "Wrong product", wrong_weight: "Wrong weight", extra: "Extra scan", unknown: "Unknown label", undo: "Taken out", packed: "Packed" };

/**
 * What a scanned order label opens. Packing: start it, scan each product label against the order
 * (the server counts and flags; nothing here touches stock), take one out, then confirm. Dispatch:
 * assign a rider or confirm the handover. Delivered is never set from here — only the rider's OTP.
 */
export function OrderPanel({ order: o, onOrder, packing, setPacking, lastScan, pendingScans }: {
  order: ScanOrder; onOrder: (o: ScanOrder) => void; packing: boolean; setPacking: (on: boolean) => void; lastScan: LastScan; /** Pack scans for this order waiting for the server. */ pendingScans: number;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmPack, setConfirmPack] = React.useState(false);
  const [missing, setMissing] = React.useState<{ name: string; pack_label: string | null; missing: number }[] | null>(null);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [dispatchOpen, setDispatchOpen] = React.useState(false);
  const [packKey, setPackKey] = React.useState(newKey);
  const total = o.lines.reduce((n, l) => n + l.quantity, 0);
  const packed = o.lines.reduce((n, l) => n + l.packed_qty, 0);
  const complete = o.lines.every((l) => l.packed_qty >= l.quantity);
  const packable = o.status === "preparing";
  const cod = o.payment_method === "cod";

  const run = async <T,>(key: string, fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, after: (d: T) => void) => {
    if (busy) return;
    setBusy(key);
    try { const r = await fn(); if (r.ok) after(r.data); else toast.error(r.error); }
    catch { toast.error("No connection. Try again when you're back online."); }
    finally { setBusy(null); }
  };

  const start = () => run("start", () => packStartAction(o.id), (d) => { onOrder(d); setPacking(true); toast.success("Packing started", "Scan each product label as it goes in the bag."); });
  const undo = (itemId: string) => run(`undo:${itemId}`, () => packUndoAction(newKey(), o.id, itemId), (d) => onOrder(d));
  const finish = () => run("complete", () => packCompleteAction(packKey, o.id, true), (d) => {
    setConfirmPack(false);
    onOrder(d.order);
    if (!d.ok) { setMissing(d.missing ?? []); setPackKey(newKey()); return; }
    setPacking(false);
    toast.success(d.already ? "Already packed" : d.assignment_id ? "Packed · rider requested" : "Packed", d.assignment_id || d.already ? undefined : "No rider is online right now; the request goes out as soon as one comes online.");
  });
  const assign = (riderId: string) => run("assign", () => assignRiderAction(o.id, riderId), (d) => { setAssignOpen(false); onOrder(d.order); toast.success(d.already ? "Rider already on this order" : "Offer sent to the rider"); });
  const dispatch = () => run("dispatch", () => confirmDispatchAction(o.id), (d) => { setDispatchOpen(false); onOrder(d.order); toast.success(d.already ? "Already out for delivery" : "Handed over · out for delivery"); });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold text-ink">Order {o.order_number}</h2>
        <OrderStatusPill status={o.status as OrderStatus} />
        <span className="ml-auto flex gap-1">
          <a href={`/admin/print/slip/${o.id}`} target="_blank" rel="noopener" className="tap inline-flex h-9 items-center gap-1 rounded-lg border border-line-2 px-2.5 text-xs font-semibold text-ink-2 hover:bg-surface-2"><Printer className="h-3.5 w-3.5" aria-hidden />Slip</a>
          <Link href={`/admin/orders/${o.id}`} className="tap inline-flex h-9 items-center gap-1 rounded-lg border border-line-2 px-2.5 text-xs font-semibold text-ink-2 hover:bg-surface-2"><ExternalLink className="h-3.5 w-3.5" aria-hidden />Order</Link>
        </span>
      </div>
      <p className="-mt-2 text-sm text-ink-2">
        {o.customer_name ?? "Customer"}{o.area ? ` · ${o.area}` : ""} · placed {timeAgo(o.created_at)} · {o.item_count} item{o.item_count === 1 ? "" : "s"} · <span className="tabular">{formatINR(Number(o.total))}</span>
        {cod ? <Badge tone="warning" size="xs" className="ml-1.5"><Banknote className="h-3 w-3" aria-hidden /> COD {formatINR(Number(o.total))}</Badge> : <Badge tone="success" size="xs" className="ml-1.5">Prepaid</Badge>}
      </p>
      {o.delivery_instructions ? <p className="rounded-lg bg-saffron-50 px-3 py-2 text-xs text-ink-2">Customer note: {o.delivery_instructions}</p> : null}

      {/* ---- Packing ---- */}
      {["placed", "confirmed", "preparing"].includes(o.status) || o.packed_at ? (
        <section aria-labelledby="pack-title" className="rounded-xl border border-line bg-card">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <PackageCheck className="h-4 w-4 text-ink-3" aria-hidden />
            <h3 id="pack-title" className="text-sm font-bold text-ink">Packing</h3>
            <span className={cn("ml-auto text-sm font-bold tabular", complete ? "text-success" : "text-ink-2")}>{packed} / {total}</span>
          </div>
          {o.packed_at ? <p className="px-3 pt-2 text-xs text-success">Packed {formatDateTime(o.packed_at)}{o.packed_by_name ? ` by ${o.packed_by_name}` : ""}</p> : null}
          {pendingScans ? <p className="px-3 pt-2 text-xs font-semibold text-saffron-700">{pendingScans} scan{pendingScans === 1 ? "" : "s"} pending — not counted until the server confirms.</p> : null}
          <ul className="divide-y divide-line">
            {o.lines.map((l) => {
              const done = l.packed_qty >= l.quantity;
              return (
                <li key={l.id} className={cn("flex items-center gap-3 px-3 py-2.5", done && "bg-success-50/60")}>
                  <ProductImage image={l.image_url} productName={l.name} packSize={l.pack_label} className="h-11 w-11 shrink-0" rounded="rounded-lg" sizes="44px" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-tight text-ink">{l.name}</p>
                    <p className="text-xs text-ink-3">{[l.pack_label, l.sku].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className={cn("text-base font-bold tabular", done ? "text-success" : l.packed_qty ? "text-saffron-700" : "text-ink-3")}>{l.packed_qty}<span className="text-xs font-semibold text-ink-3">/{l.quantity}</span></span>
                  {packable && l.packed_qty > 0 ? <button type="button" onClick={() => undo(l.id)} disabled={busy !== null} aria-label={`Take one ${l.name} out`} className="tap flex h-11 w-11 items-center justify-center rounded-lg border border-line-2 text-ink-2 hover:bg-surface-2 disabled:opacity-50"><Minus className="h-4 w-4" /></button> : null}
                </li>
              );
            })}
          </ul>
          {lastScan && packable ? (
            <div className={cn("mx-3 my-2 rounded-lg px-3 py-2 text-sm font-semibold", lastScan.result === "ok" ? "bg-success-50 text-success" : lastScan.result === "extra" || lastScan.result === "pending" ? "bg-saffron-50 text-saffron-700" : "bg-danger-50 text-danger")}>{lastScan.message}</div>
          ) : null}
          {o.flags.length ? (
            <details className="border-t border-line px-3 py-2 text-xs">
              <summary className="cursor-pointer font-semibold text-ink-2"><AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-saffron-700" aria-hidden />{o.flags.length} flagged scan{o.flags.length === 1 ? "" : "s"} on this order</summary>
              <ul className="mt-1.5 space-y-1 text-ink-3">{o.flags.map((f, i) => <li key={i}><strong className="text-ink-2">{FLAG_LABEL[f.result] ?? f.result}</strong> · {f.message} <span className="text-ink-4">· {f.by ?? "staff"}, {timeAgo(f.at)}</span></li>)}</ul>
            </details>
          ) : null}
          <div className="space-y-2 border-t border-line p-3">
            {o.status === "placed" ? <p className="text-xs text-ink-3">Waiting to be accepted (online payment pending or auto-accept off). Accept it from <Link href={`/admin/orders/${o.id}`} className="font-semibold underline">the order page</Link>.</p> : null}
            {o.status === "confirmed" ? <BigButton onClick={start} disabled={busy !== null} className="bg-brand-600 text-white hover:bg-brand-700"><ScanLine className="h-5 w-5" aria-hidden />{busy === "start" ? "Starting…" : "Start packing"}</BigButton> : null}
            {packable ? (
              <>
                {!packing ? <BigButton onClick={() => setPacking(true)} className="border border-brand-600 bg-brand-50 text-brand-800"><ScanLine className="h-5 w-5" aria-hidden />Scan products into the bag</BigButton> : <p className="text-center text-xs font-semibold text-brand-700">Scanning — hold each label up to the camera as it goes in.</p>}
                <BigButton onClick={() => { setMissing(null); setConfirmPack(true); }} disabled={busy !== null || pendingScans > 0} className={cn(complete ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-line-2 bg-card text-ink-2")}><Check className="h-5 w-5" aria-hidden />Confirm packed{complete ? "" : ` (${total - packed} missing)`}</BigButton>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ---- Dispatch ---- */}
      {["ready_for_pickup", "rider_assigned", "out_for_delivery", "delivered", "completed"].includes(o.status) ? (
        <section aria-labelledby="dispatch-title" className="rounded-xl border border-line bg-card">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5"><Truck className="h-4 w-4 text-ink-3" aria-hidden /><h3 id="dispatch-title" className="text-sm font-bold text-ink">Delivery</h3></div>
          <div className="space-y-2 p-3 text-sm">
            {o.assignment ? (
              <p className="flex items-center gap-2"><Bike className="h-4 w-4 text-ink-3" aria-hidden /><span><strong>{o.assignment.rider_name ?? "Rider"}</strong> · {o.assignment.status === "offered" ? "offer sent, waiting for the rider to accept" : o.assignment.status === "accepted" ? "accepted, on the way to collect" : o.assignment.status === "picked_up" ? "has the order, out for delivery" : "delivered"}</span></p>
            ) : ["ready_for_pickup", "rider_assigned"].includes(o.status) ? <p className="text-ink-2">No rider on this order yet.</p> : null}
            {o.cod ? <p className="flex items-center gap-2 text-success"><Banknote className="h-4 w-4" aria-hidden />Cash {formatINR(Number(o.cod.amount))} collected ({o.cod.via === "otp" ? "OTP handover" : o.cod.via}), {formatDateTime(o.cod.at)}</p> : cod && ["delivered", "completed"].includes(o.status) ? <p className="text-ink-3">No cash entry recorded for this COD order.</p> : null}
            {["ready_for_pickup", "rider_assigned"].includes(o.status) && (!o.assignment || o.assignment.status === "offered") ? <BigButton onClick={() => setAssignOpen(true)} disabled={busy !== null} className="bg-brand-600 text-white hover:bg-brand-700"><Bike className="h-5 w-5" aria-hidden />{o.assignment ? "Offer to a different rider" : "Assign a rider"}</BigButton> : null}
            {o.assignment?.status === "accepted" ? <BigButton onClick={() => setDispatchOpen(true)} disabled={busy !== null} className="bg-brand-600 text-white hover:bg-brand-700"><Truck className="h-5 w-5" aria-hidden />Confirm handed to {o.assignment.rider_name ?? "rider"}</BigButton> : null}
            {o.status === "out_for_delivery" ? <p className="text-xs text-ink-3">Delivered is confirmed only by the rider with the customer&rsquo;s OTP, never by a scan.</p> : null}
          </div>
        </section>
      ) : null}
      {["cancelled", "rejected"].includes(o.status) ? <Alert tone="danger" title={`This order is ${o.status}`}>Nothing can be packed or dispatched. The stock it reserved has been released back to the shelf.</Alert> : null}

      <ConfirmDialog open={confirmPack} onClose={() => (busy ? undefined : setConfirmPack(false))} onConfirm={finish} loading={busy === "complete"} confirmLabel={complete ? "Mark packed · call rider" : "Check again"}
        title={complete ? "Everything scanned. Mark this order packed?" : "Items are still missing"}
        description={complete ? <>{total} item{total === 1 ? "" : "s"} were scanned against order {o.order_number}. It becomes ready for pickup and the nearest online rider gets an offer. Stock was already deducted when the order was placed; nothing changes again.</>
          : <>{o.lines.filter((l) => l.packed_qty < l.quantity).map((l) => <span key={l.id} className="block">• {l.quantity - l.packed_qty} × {l.name} {l.pack_label ?? ""}</span>)}<span className="mt-2 block">Scan the missing items first. If something is out of stock, reject the order from the order page so the customer is told and refunded.</span></>} />
      {missing ? <Alert tone="warning" title="Still missing">{missing.map((m, i) => <span key={i} className="block">{m.missing} × {m.name} {m.pack_label ?? ""}</span>)}</Alert> : null}

      <ConfirmDialog open={dispatchOpen} onClose={() => (busy ? undefined : setDispatchOpen(false))} onConfirm={dispatch} loading={busy === "dispatch"} confirmLabel="Handed over"
        title={`Hand ${o.order_number} to ${o.assignment?.rider_name ?? "the rider"}?`}
        description={<>The order goes out for delivery with this rider.{cod ? <> They collect <strong>{formatINR(Number(o.total))}</strong> in cash at the door.</> : null} Delivery itself is completed by the rider with the customer&rsquo;s OTP.</>} />
      <RiderSheet open={assignOpen} onClose={() => setAssignOpen(false)} onPick={assign} busy={busy === "assign"} currentRiderId={o.assignment?.rider_id ?? null} />
    </div>
  );
}

function RiderSheet({ open, onClose, onPick, busy, currentRiderId }: { open: boolean; onClose: () => void; onPick: (id: string) => void; busy: boolean; currentRiderId: string | null }) {
  const [riders, setRiders] = React.useState<RiderOption[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<string | null>(null);
  // Each opening starts with a fresh list (adjusted during render, so no extra effect pass).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) { setRiders(null); setError(null); setPicked(null); } }
  React.useEffect(() => {
    if (!open) return;
    let on = true;
    listRidersAction().then((r) => { if (!on) return; if (r.ok) setRiders(r.data); else setError(r.error); }).catch(() => on && setError("Could not load riders (offline?)"));
    return () => { on = false; };
  }, [open]);
  const free = (riders ?? []).filter((r) => !r.busy || r.id === currentRiderId);
  return (
    <BottomSheet open={open} onClose={onClose} title="Assign a rider" description="Online riders who are free right now. The rider must accept the offer.">
      {error ? <Alert tone="danger">{error}</Alert> : riders === null ? <LoadingState rows={3} /> : free.length === 0 ? <p className="py-6 text-center text-sm text-ink-3">{riders.length ? "Every online rider is busy." : "No riders are online right now."}</p> : (
        <ul className="divide-y divide-line">
          {free.map((r) => (
            <li key={r.id}>
              <button type="button" disabled={busy} onClick={() => { setPicked(r.id); onPick(r.id); }} className="tap flex min-h-14 w-full items-center gap-3 px-1 text-left disabled:opacity-60">
                <span className={cn("h-2.5 w-2.5 rounded-full", r.is_online ? "bg-success" : "bg-ink-4")} aria-hidden />
                <span className="flex-1 text-sm font-semibold text-ink">{r.name ?? "Rider"}{r.id === currentRiderId ? <span className="ml-2 text-xs font-normal text-ink-3">offer already sent</span> : null}</span>
                {busy && picked === r.id ? <span className="text-xs text-ink-3">Sending…</span> : <Bike className="h-4 w-4 text-ink-3" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
