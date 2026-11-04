"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Clock, PackageX, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { Panel } from "@/components/admin/kit/ui";
import { raiseItemExceptionAction, adminResolveExceptionAction } from "@/lib/actions/exceptions";
import type { PackLine } from "@/lib/scan/types";
import { cn, formatINR, timeAgo } from "@/lib/utils";

type Row = PackLine & { exception?: { id: string; status: string; available_qty: number; kind: string } | null };

const STATUS: Record<string, { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  pending: { label: "Waiting for customer", tone: "warning" }, approved: { label: "Customer approved", tone: "success" }, declined: { label: "Customer declined", tone: "danger" },
  expired: { label: "No reply · decide", tone: "danger" }, withdrawn: { label: "Withdrawn", tone: "neutral" },
};

/**
 * Admin order page: flag a line that cannot be packed in full. The customer is asked to approve the
 * reduced quantity (or removal) before the bill or the pick list changes; an expired request is decided
 * here. Only orders that are still being packed can be changed.
 */
export function ItemExceptions({ orderId, status, lines }: { orderId: string; status: string; lines: Row[] }) {
  const router = useRouter();
  const [target, setTarget] = React.useState<Row | null>(null);
  const [qty, setQty] = React.useState("0");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const packing = ["placed", "confirmed", "preparing"].includes(status);
  const flagged = lines.filter((l) => l.exception && l.exception.status !== "withdrawn");
  if (!packing && !flagged.length) return null;

  const raise = async () => {
    if (!target || busy) return;
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 0 || n >= target.quantity) { toast.error(`Enter a whole number below ${target.quantity}`); return; }
    setBusy(target.id);
    try {
      const r = await raiseItemExceptionAction(target.id, n, note.trim() || undefined);
      if (!r.ok) { toast.error("Could not flag the item", r.error); return; }
      toast.success("Customer asked to approve", "Packing stays blocked for this order until they answer or the window runs out.");
      setTarget(null); setQty("0"); setNote(""); router.refresh();
    } finally { setBusy(null); }
  };
  const decide = async (id: string, action: "apply" | "withdraw") => {
    if (busy) return;
    setBusy(id);
    try {
      const r = await adminResolveExceptionAction(id, orderId, action);
      if (!r.ok) { toast.error("Could not update", r.error); return; }
      toast.success(action === "apply" ? "Order updated with the available quantity" : "Flag withdrawn");
      router.refresh();
    } finally { setBusy(null); }
  };

  return (
    <Panel title={<span className="inline-flex items-center gap-1.5"><PackageX className="h-4 w-4 text-ink-3" aria-hidden />Unavailable items</span>}
      description={packing ? "If something is missing or short, flag it: the customer approves the change before the bill moves." : "Decisions recorded on this order."} flush>
      <ul className="divide-y divide-line border-t border-line text-sm">
        {lines.map((l) => {
          const x = l.exception; const st = x ? STATUS[x.status] : null;
          return (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-5">
              <span className="min-w-0 flex-1 truncate text-ink">{l.name} <span className="text-xs text-ink-3">{l.pack_label ?? ""} · {l.quantity} × {formatINR(l.unit_price)}</span></span>
              {x && st ? <Badge tone={st.tone} size="sm">{st.label}{x.status === "pending" || x.status === "expired" ? ` · ${x.available_qty} of ${l.quantity}` : ""}</Badge> : null}
              {x && (x.status === "pending" || x.status === "expired") ? (
                <span className="flex gap-1">
                  {x.status === "expired" ? <Button size="xs" loading={busy === x.id} disabled={busy !== null} onClick={() => decide(x.id, "apply")}><Check className="h-3.5 w-3.5" /> Pack {x.available_qty}</Button> : <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Clock className="h-3.5 w-3.5" aria-hidden />asked</span>}
                  <Button size="xs" variant="ghost" loading={busy === x.id} disabled={busy !== null} onClick={() => decide(x.id, "withdraw")}><Undo2 className="h-3.5 w-3.5" /> Withdraw</Button>
                </span>
              ) : packing && !x ? (
                <Button size="xs" variant="outline" onClick={() => { setTarget(l); setQty("0"); }} className="text-danger"><AlertTriangle className="h-3.5 w-3.5" /> Not available</Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Modal open={Boolean(target)} onClose={() => (busy ? undefined : setTarget(null))} title={target ? `${target.name} ${target.pack_label ?? ""}` : ""} description="How many can you actually pack? The customer is asked to approve this; 0 removes the item." size="sm"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={busy !== null} onClick={() => setTarget(null)}>Cancel</Button><Button className={cn("flex-1")} loading={busy !== null} onClick={raise}>Ask the customer</Button></div>}>
        <div className="space-y-3">
          <Input label={`Available quantity (ordered ${target?.quantity ?? 0})`} type="number" inputMode="numeric" min={0} max={(target?.quantity ?? 1) - 1} value={qty} onChange={(e) => setQty(e.target.value)} />
          <Input label="Note for your records (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. last pack damaged" />
          {target?.exception ? <p className="text-xs text-ink-3">Last decision: {STATUS[target.exception.status]?.label} · {timeAgo(new Date().toISOString())}</p> : null}
        </div>
      </Modal>
    </Panel>
  );
}
