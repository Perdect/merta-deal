"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { adminReviewBuyerAction } from "@/lib/actions/wholesale";
import type { BuyerStatus } from "@/lib/wholesale";

/** Pause or resume a buyer's wholesale ordering; the note is sent to them. Buyers need no approval to start. */
export function BuyerControls({ buyerId, status }: { buyerId: string; status: BuyerStatus }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const act = async (next: "approved" | "suspended") => {
    setBusy(next);
    const r = await adminReviewBuyerAction(buyerId, next, note);
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(next === "suspended" ? "Wholesale ordering paused" : "Wholesale ordering resumed"); setNote(""); router.refresh();
  };
  return (
    <div className="space-y-2">
      <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Note to the buyer (optional, sent with the change)" aria-label="Note to the buyer" />
      <div className="flex flex-wrap gap-2">
        {status === "approved" ? <Button size="sm" variant="outline" onClick={() => act("suspended")} loading={busy === "suspended"}>Pause ordering</Button>
          : <Button size="sm" onClick={() => act("approved")} loading={busy === "approved"}>Resume ordering</Button>}
      </div>
    </div>
  );
}
