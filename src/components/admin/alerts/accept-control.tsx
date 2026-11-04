"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { acceptOrderAction } from "@/lib/actions/alerts";
import { formatDateTime } from "@/lib/utils";

/**
 * Who accepted this order, or the button to accept it. Accepting claims the order for the team (every
 * dashboard stops ringing) and, for a 'placed' order, confirms it under the payment rules.
 */
export function AcceptControl({ orderId, status, acceptedAt, acceptedByName }: { orderId: string; status: string; acceptedAt: string | null; acceptedByName: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  if (acceptedAt) {
    return <p className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-xs font-semibold text-success"><UserCheck className="h-3.5 w-3.5" aria-hidden />Accepted by {acceptedByName ?? "an admin"} · {formatDateTime(acceptedAt)}</p>;
  }
  if (["cancelled", "rejected", "delivered", "completed"].includes(status)) return null;
  const accept = async () => {
    setBusy(true);
    try {
      const r = await acceptOrderAction(orderId);
      if (!r.ok) { toast.error("Could not accept", r.error); return; }
      toast.success(r.data.already ? `Already accepted by ${r.data.accepted_by_name ?? "another admin"}` : "Order accepted");
      router.refresh();
    } finally { setBusy(false); }
  };
  return <Button size="sm" onClick={accept} loading={busy}><Check className="h-4 w-4" /> Accept order</Button>;
}
