"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PackageX, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { resolveExceptionAction, type OrderException } from "@/lib/actions/exceptions";
import { useNow } from "@/components/rider/use-now";
import { formatINR } from "@/lib/utils";

export type ExceptionView = OrderException & { product_name: string; pack_label: string | null; unit_price: number };

/**
 * The customer's decision on an unavailable item: approve the reduced quantity (the order carries on,
 * any prepaid difference is refunded) or decline (the whole order is cancelled and refunded). Nothing
 * changes until they answer; after the window an admin decides.
 */
export function ExceptionCard({ exceptions, orderId }: { exceptions: ExceptionView[]; orderId: string }) {
  const router = useRouter();
  const now = useNow();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [declining, setDeclining] = React.useState<ExceptionView | null>(null);
  const pending = exceptions.filter((x) => x.status === "pending");
  if (!pending.length) return null;

  const answer = async (x: ExceptionView, approve: boolean) => {
    if (busy) return;
    setBusy(x.id);
    try {
      const r = await resolveExceptionAction(x.id, orderId, approve);
      setDeclining(null);
      if (!r.ok) { toast.error(r.error); return; }
      if (r.data.already) toast.info("This was already answered");
      else if (approve) toast.success("Thanks, we'll pack the rest", r.data.refund_amount ? `${formatINR(r.data.refund_amount)} will be refunded to your payment method.` : undefined);
      else toast.warning("Order cancelled", "Any payment is refunded in full.");
      router.refresh();
    } catch { toast.error("Could not send your answer", "Check your connection and try again."); }
    finally { setBusy(null); }
  };

  return (
    <section className="rounded-lg border-2 border-saffron-300 bg-card p-4 shadow-card animate-slide-up" aria-labelledby="exception-title">
      <h2 id="exception-title" className="flex items-center gap-2 text-base font-bold text-ink"><PackageX className="h-5 w-5 text-saffron-700" aria-hidden />We need your okay</h2>
      <ul className="mt-2 space-y-3">
        {pending.map((x) => {
          const msLeft = now ? new Date(x.expires_at).getTime() - now : 0;
          const minsLeft = Math.max(0, Math.ceil(msLeft / 60000));
          const diff = (x.requested_qty - x.available_qty) * Number(x.unit_price);
          return (
            <li key={x.id} className="rounded-md bg-surface p-3">
              <p className="text-sm text-ink">
                {x.available_qty === 0
                  ? <><span className="font-semibold">{x.product_name}{x.pack_label ? ` ${x.pack_label}` : ""}</span> is not available right now.</>
                  : <>Only <span className="font-semibold">{x.available_qty} of {x.requested_qty}</span> {x.product_name}{x.pack_label ? ` ${x.pack_label}` : ""} available.</>}
              </p>
              <p className="mt-1 text-xs text-ink-2">Approve and we pack the rest; your bill drops by {formatINR(diff)}{x.refund_amount === 0 ? "" : ""}. Decline and the whole order is cancelled with a full refund.</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-3"><Clock className="h-3 w-3" aria-hidden />{now ? (minsLeft > 0 ? `${minsLeft} min to answer` : "Window closed; our team will call you") : "…"}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button size="md" loading={busy === x.id} disabled={busy !== null || (now > 0 && msLeft <= 0)} onClick={() => answer(x, true)}><Check className="h-4 w-4" /> Approve</Button>
                <Button size="md" variant="outline" className="text-danger" disabled={busy !== null || (now > 0 && msLeft <= 0)} onClick={() => setDeclining(x)}><X className="h-4 w-4" /> Decline</Button>
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog open={Boolean(declining)} onClose={() => setDeclining(null)} onConfirm={() => declining && answer(declining, false)} title="Cancel the whole order?" description="Declining cancels this order. Anything already paid is refunded in full to the original method." confirmLabel="Yes, cancel my order" tone="danger" loading={busy !== null} />
    </section>
  );
}
