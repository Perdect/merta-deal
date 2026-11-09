"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { adminReviewShopAction } from "@/lib/actions/wholesale";
import type { ShopStatus } from "@/lib/wholesale";

export function ShopControls({ shopId, status }: { shopId: string; status: ShopStatus }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const act = async (next: "approved" | "rejected" | "suspended" | "pending") => {
    setBusy(next);
    const r = await adminReviewShopAction(shopId, next, note);
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Shop ${next}`); setNote(""); router.refresh();
  };
  return (
    <div className="space-y-2">
      <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Note to the shop (optional, sent with the decision)" aria-label="Note to the shop" />
      <div className="flex flex-wrap gap-2">
        {status !== "approved" ? <Button size="sm" onClick={() => act("approved")} loading={busy === "approved"}>Approve</Button> : null}
        {status === "pending" ? <Button size="sm" variant="outline" onClick={() => act("rejected")} loading={busy === "rejected"}>Reject</Button> : null}
        {status === "approved" ? <Button size="sm" variant="outline" onClick={() => act("suspended")} loading={busy === "suspended"}>Pause ordering</Button> : null}
        {status === "rejected" || status === "suspended" ? <Button size="sm" variant="ghost" onClick={() => act("pending")} loading={busy === "pending"}>Back to review</Button> : null}
      </div>
    </div>
  );
}
