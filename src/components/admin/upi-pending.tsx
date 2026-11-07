"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { confirmUpiAction } from "@/lib/actions/upi";
import { formatDateTime, formatINR } from "@/lib/utils";

export type PendingUpi = { order_id: string; order_number: string; amount: number; rider: string | null; recorded_at: string };

function Row({ p }: { p: PendingUpi }) {
  const router = useRouter();
  const [ref, setRef] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const act = async (received: boolean) => {
    if (busy) return; setBusy(true);
    try {
      const r = await confirmUpiAction(p.order_id, received, ref);
      if (!r.ok) { toast.error("Not saved", r.error); return; }
      toast.success(received ? "UPI payment confirmed" : "Moved back to the rider's cash"); router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <li className="flex flex-wrap items-end gap-2 px-4 py-3 sm:px-5">
      <span className="min-w-44 flex-1 text-sm"><span className="block font-semibold text-ink">{p.order_number} · {formatINR(p.amount, { precise: true })}</span><span className="block text-xs text-ink-3">{p.rider ?? "Rider"} · {formatDateTime(p.recorded_at)}</span></span>
      <Input label="UPI reference" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} wrapperClassName="w-44" />
      <Button size="sm" disabled={busy} onClick={() => act(true)}>Received</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(false)}>Not received</Button>
    </li>
  );
}

/** Rider-recorded UPI payments waiting to be matched against the bank. Until then they stay on the rider's balance. */
export function UpiPending({ items }: { items: PendingUpi[] }) {
  if (!items.length) return null;
  return <Panel title={`UPI to confirm · ${items.length}`} description="Riders recorded these as paid by UPI. Check each one in your bank. Until you confirm, it stays on the rider's cash balance." flush><ul className="divide-y divide-line border-t border-line">{items.map((p) => <Row key={p.order_id} p={p} />)}</ul></Panel>;
}
