"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { confirmUpiOrderPaymentAction } from "@/lib/actions/upi";
import { formatINR, timeAgo } from "@/lib/utils";

export type PendingUpiOrder = { order_id: string; order_number: string; amount: number; customer: string | null; phone: string | null; placed_at: string; claimed_at: string | null; reference: string | null; checked_at: string | null };

function Row({ p }: { p: PendingUpiOrder }) {
  const router = useRouter();
  const [ref, setRef] = React.useState(p.reference ?? "");
  const [busy, setBusy] = React.useState(false);
  const act = async (received: boolean) => {
    if (busy) return; setBusy(true);
    try {
      const r = await confirmUpiOrderPaymentAction(p.order_id, received, ref);
      if (!r.ok) { toast.error("Not saved", r.error); return; }
      toast.success(received ? `Order ${p.order_number} confirmed` : "Marked as not received", received ? "Pack it, then tap Packed to call a rider." : "The customer has been told to pay or switch to cash.");
      router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <li className="flex flex-wrap items-end gap-2 px-4 py-3 sm:px-5">
      <span className="min-w-56 flex-1 text-sm">
        <Link href={`/admin/orders/${p.order_id}`} className="block font-semibold text-ink underline-offset-2 hover:underline">{p.order_number} · {formatINR(p.amount, { precise: true })}</Link>
        <span className="block text-xs text-ink-3">{p.customer ?? "Customer"}{p.phone ? ` · ${p.phone}` : ""} · placed {timeAgo(p.placed_at)}</span>
        <span className="block text-xs">{p.claimed_at ? <span className="font-semibold text-success">Customer says paid {timeAgo(p.claimed_at)}{p.reference ? ` · ref ${p.reference}` : ""}</span> : <span className="text-ink-3">Customer hasn&rsquo;t said paid yet</span>}{p.checked_at ? <span className="text-ink-3"> · you checked {timeAgo(p.checked_at)}: not found</span> : null}</span>
      </span>
      <Input label="UPI reference" value={ref} onChange={(e) => setRef(e.target.value.slice(0, 40))} maxLength={40} wrapperClassName="w-48" />
      <Button size="sm" disabled={busy || ref.trim().length < 4} onClick={() => act(true)}>Received · confirm order</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(false)}>Not received</Button>
    </li>
  );
}

/** Orders waiting for a direct UPI payment. Received confirms the order and starts packing; nothing happens until then. */
export function UpiOrdersPending({ items }: { items: PendingUpiOrder[] }) {
  if (!items.length) return null;
  return <Panel title={`UPI payments to confirm · ${items.length}`} description="These orders wait until you find the payment in your bank. Received (with the reference) confirms the order and starts packing. Not received tells the customer to pay or switch to cash." flush><ul className="divide-y divide-line border-t border-line">{items.map((p) => <Row key={p.order_id} p={p} />)}</ul></Panel>;
}
