"use client";
import * as React from "react";
import type { OrderTracking } from "@/types/app";
import { submitReviewAction } from "@/lib/actions/account";
import { BottomSheet } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { StarPicker } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

export function ReviewSheet({ open, onClose, tracking, onDone }: { open: boolean; onClose: () => void; tracking: OrderTracking; onDone: () => void }) {
  const existing = (t: string, pid?: string) => tracking.reviews.find((r) => r.target === t && (t !== "product" || r.product_id === pid));
  const [delivery, setDelivery] = React.useState(existing("delivery")?.rating ?? 0);
  const [products, setProducts] = React.useState<Record<string, number>>(Object.fromEntries(tracking.items.map((i) => [i.product_id, existing("product", i.product_id)?.rating ?? 0])));
  const [busy, setBusy] = React.useState(false);
  const hasRider = tracking.assignment?.status === "delivered";

  const submit = async () => {
    if (busy) return;
    const tasks: Promise<unknown>[] = [];
    if (delivery && hasRider) tasks.push(submitReviewAction({ orderId: tracking.order.id, target: "delivery", rating: delivery }));
    for (const [pid, r] of Object.entries(products)) if (r) tasks.push(submitReviewAction({ orderId: tracking.order.id, target: "product", rating: r, productId: pid }));
    if (!tasks.length) { toast.warning("Pick at least one rating"); return; }
    setBusy(true);
    try {
      const results = await Promise.all(tasks) as { ok: boolean; error?: string }[];
      const failed = results.find((r) => !r.ok);
      // Picked stars stay as they are on failure so the customer can simply tap Submit again.
      if (failed) toast.error(failed.error ?? "Could not submit review"); else { toast.success("Thanks for your review!", "It will appear after a quick moderation check."); onDone(); onClose(); }
    } catch {
      toast.error("Could not submit your review", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Rate your order" description="Your feedback helps Merta Deal and our riders improve." footer={<Button fullWidth loading={busy} disabled={busy} onClick={submit}>Submit review</Button>}>
      <div className="space-y-5 pt-2">
        {hasRider ? <div><p className="mb-1.5 text-sm font-semibold text-ink">Delivery by {tracking.assignment?.rider.name ?? "rider"}</p><StarPicker value={delivery} onChange={setDelivery} /></div> : null}
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink">Products</p>
          <ul className="space-y-2">{tracking.items.map((i) => <li key={i.id} className="flex items-center justify-between gap-3"><span className="line-clamp-1 text-sm text-ink-2">{i.product_name}</span><StarPicker value={products[i.product_id] ?? 0} onChange={(v) => setProducts((p) => ({ ...p, [i.product_id]: v }))} size={22} /></li>)}</ul>
        </div>
      </div>
    </BottomSheet>
  );
}
