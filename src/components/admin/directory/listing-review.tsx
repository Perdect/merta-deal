"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { reviewListingAction } from "@/lib/actions/directory";

/** Approve makes an unpublished draft; a change request only records the decision. */
export function ListingReview({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const review = async (approve: boolean) => {
    if (busy) return; setBusy(true);
    try {
      const r = await reviewListingAction(id, approve, note);
      if (!r.ok) { toast.error("Not saved", r.error); return; }
      toast.success(approve ? "Approved" : "Rejected");
      if (approve && r.data.businessId) router.push(`/admin/businesses/${r.data.businessId}`); else router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <Input label="Note (optional)" wrapperClassName="min-w-48 flex-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      <Button variant="outline" disabled={busy} onClick={() => review(false)}>Reject</Button>
      <Button disabled={busy} onClick={() => review(true)}>Approve</Button>
    </div>
  );
}
