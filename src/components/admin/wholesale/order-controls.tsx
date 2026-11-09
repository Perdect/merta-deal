"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { adminCancelWholesaleOrderAction, adminConfirmWholesaleOrderAction } from "@/lib/actions/wholesale";
import { formatINR } from "@/lib/utils";
import type { WholesaleOrder } from "@/lib/wholesale";

/** Confirm (creates the real order; stock is checked and deducted) or cancel an approved/proposed wholesale order. */
export function OrderControls({ order }: { order: WholesaleOrder }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState<"confirm" | "cancel" | null>(null);
  const confirm = async () => {
    setBusy("confirm");
    const r = await adminConfirmWholesaleOrderAction(order.id, note);
    setBusy(null); setConfirming(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Order ${r.data.order_number} placed`, `${r.data.item_count} units · ${formatINR(r.data.total)} · pay on delivery. It is in Orders now.`);
    router.refresh();
  };
  const cancel = async () => {
    setBusy("cancel");
    const r = await adminCancelWholesaleOrderAction(order.id, note);
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Wholesale order cancelled"); router.refresh();
  };
  if (!["proposed", "approved"].includes(order.status)) return null;
  return (
    <div className="space-y-2">
      <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Internal note (optional)" aria-label="Note" />
      <div className="flex flex-wrap gap-2">
        {order.status === "approved" ? <Button size="sm" onClick={() => setConfirming(true)} loading={busy === "confirm"}>Place order</Button> : <span className="text-xs text-ink-3">Waiting for the shop to approve it.</span>}
        <Button size="sm" variant="outline" onClick={cancel} loading={busy === "cancel"}>Cancel</Button>
      </div>
      <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={confirm} title="Place this wholesale order?" confirmLabel="Place order" loading={busy === "confirm"}
        description={`Creates a real order for ${order.shop_name ?? "the shop"}: ${order.items.reduce((a, i) => a + i.units, 0)} units, ${formatINR(order.subtotal)} + delivery. Stock is deducted now and the order goes to packing. Payment is collected on delivery.`} />
    </div>
  );
}
