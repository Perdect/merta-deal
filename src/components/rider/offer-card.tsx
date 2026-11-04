"use client";
import * as React from "react";
import { Store as StoreIcon, MapPin, Package, Route, Timer, Banknote } from "lucide-react";
import type { RiderAssignment } from "@/types/app";
import { respondAssignmentAction } from "@/lib/actions/rider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { cn, formatINR } from "@/lib/utils";
import { customerOf, formatKm, mmss } from "./rider-utils";
import { useNow } from "./use-now";

/** A new delivery request with a live countdown to `expires_at` and big ACCEPT / REJECT targets. */
export function OfferCard({ offer, onChanged }: { offer: RiderAssignment; onChanged: () => void }) {
  const now = useNow();
  const msLeft = now ? new Date(offer.expires_at).getTime() - now : Infinity;
  const [busy, setBusy] = React.useState<"accept" | "reject" | null>(null);
  const [confirmReject, setConfirmReject] = React.useState(false);
  const expired = msLeft <= 0;
  const expiredRef = React.useRef(false);
  React.useEffect(() => {
    if (expired && !expiredRef.current) { expiredRef.current = true; onChanged(); }
  }, [expired, onChanged]);

  const respond = async (accept: boolean) => {
    setBusy(accept ? "accept" : "reject");
    const r = await respondAssignmentAction(offer.id, accept);
    setBusy(null); setConfirmReject(false);
    if (!r.ok) { toast.error(r.error); onChanged(); return; }
    if (accept) toast.success("Delivery accepted", `Head to ${offer.pickup.name} for pickup.`); else toast.info("Request declined");
    onChanged();
  };

  const urgent = msLeft > 0 && msLeft < 30_000;
  const customer = customerOf(offer);
  const cod = offer.order.payment_method === "cod" && Number(offer.cod_amount) > 0;

  return (
    <article className={cn("rounded-lg border bg-card p-4 shadow-card animate-slide-up", urgent ? "border-danger/40" : "border-saffron-300")} aria-labelledby={`offer-${offer.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><StoreIcon className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h3 id={`offer-${offer.id}`} className="truncate text-base font-bold text-ink">{offer.pickup.name}</h3>
            <p className="truncate text-xs text-ink-3">{[offer.pickup.area, offer.order.order_number].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <span className={cn("inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-bold tabular", expired ? "bg-surface-2 text-ink-3" : urgent ? "bg-danger-50 text-danger" : "bg-saffron-100 text-saffron-700")} aria-live="polite" aria-label={expired ? "Expired" : now ? `Expires in ${mmss(msLeft)}` : "Expires soon"}>
          <Timer className="h-4 w-4" />{expired ? "Expired" : now ? mmss(msLeft) : "--:--"}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-brand-50 px-2 py-2.5"><dt className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">You earn</dt><dd className="text-xl font-extrabold tabular text-brand-800">{formatINR(offer.earning)}</dd></div>
        <div className="rounded-md bg-surface-2 px-2 py-2.5"><dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3"><Route className="mr-0.5 inline h-3 w-3" />Distance</dt><dd className={cn("font-extrabold tabular text-ink", offer.distance_km != null && Number(offer.distance_km) > 0 ? "text-xl" : "text-xs leading-7")}>{offer.distance_km != null && Number(offer.distance_km) > 0 ? formatKm(offer.distance_km) : "No map pin"}</dd></div>
        <div className="rounded-md bg-surface-2 px-2 py-2.5"><dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3"><Package className="mr-0.5 inline h-3 w-3" />Items</dt><dd className="text-xl font-extrabold tabular text-ink">{offer.order.item_count}</dd></div>
      </dl>

      <div className="mt-3 space-y-1.5 text-sm">
        <p className="flex items-center gap-2 text-ink-2"><MapPin className="h-4 w-4 shrink-0 text-ink-3" /><span className="truncate">Deliver to <span className="font-semibold text-ink">{customer.area || "customer address"}</span></span></p>
        <p className="flex items-center gap-2">
          <Banknote className="h-4 w-4 shrink-0 text-ink-3" />
          {cod ? <span className="text-ink-2">Collect <Badge tone="saffron" size="sm">{formatINR(offer.cod_amount)} cash</Badge> from customer</span> : <span className="text-ink-2">Prepaid <Badge tone="success" size="sm">nothing to collect</Badge></span>}
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="lg" className="flex-1" disabled={expired || busy != null} loading={busy === "reject"} onClick={() => setConfirmReject(true)}>Reject</Button>
        <Button size="lg" className="flex-[2]" disabled={expired || busy != null} loading={busy === "accept"} onClick={() => respond(true)}>Accept</Button>
      </div>
      <ConfirmDialog open={confirmReject} onClose={() => setConfirmReject(false)} onConfirm={() => respond(false)} title="Decline this request?" description="It will be offered to another rider right away." confirmLabel="Decline" tone="danger" loading={busy === "reject"} />
    </article>
  );
}
