"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { btn } from "@/components/admin/care/shared";
import { moderateReviewAction } from "@/lib/actions/admin";
import { cn } from "@/lib/utils";

/**
 * Approve publishes the review and updates ratings; reject hides it and takes an internal note.
 * Only the moves valid from the current status are offered.
 */
export function ReviewModerationButtons({ reviewId, status, who }: { reviewId: string; status: string; who?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"approved" | "rejected" | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const run = async (s: "approved" | "rejected", n?: string) => {
    setBusy(s); const r = await moderateReviewAction(reviewId, s, n); setBusy(null);
    if (r.ok) { toast.success(s === "approved" ? "Review approved" : "Review rejected", s === "approved" ? "It now shows publicly and counts towards the rating." : "It's hidden from customers."); setRejecting(false); setNote(""); router.refresh(); }
    else toast.error("Review not updated", r.error);
  };
  return (
    <span className="inline-flex flex-wrap justify-end gap-1.5">
      {status !== "approved" ? (
        <button type="button" className={cn(btn.primary, btn.small)} disabled={busy !== null} onClick={() => run("approved")} aria-label={who ? `Approve review by ${who}` : "Approve review"}>
          <Check className="h-3.5 w-3.5" aria-hidden />{busy === "approved" ? "Approving…" : status === "rejected" ? "Approve instead" : "Approve"}
        </button>
      ) : null}
      {status !== "rejected" ? (
        <button type="button" className={cn(btn.dangerOutline, btn.small)} disabled={busy !== null} onClick={() => setRejecting(true)} aria-label={who ? `Reject review by ${who}` : "Reject review"}>
          <X className="h-3.5 w-3.5" aria-hidden />{status === "approved" ? "Unpublish" : "Reject"}
        </button>
      ) : null}
      <Modal open={rejecting} onClose={() => busy === null && setRejecting(false)} size="sm" title={status === "approved" ? "Unpublish this review?" : "Reject this review?"}
        description="It's hidden from the product page and stops counting towards the rating."
        footer={<div className="flex gap-2"><button type="button" className={cn(btn.secondary, "flex-1")} disabled={busy !== null} onClick={() => setRejecting(false)}>Cancel</button><button type="button" className={cn(btn.danger, "flex-1")} disabled={busy !== null} onClick={() => run("rejected", note.trim() || undefined)}>{busy === "rejected" ? "Rejecting…" : status === "approved" ? "Unpublish review" : "Reject review"}</button></div>}>
        <Textarea label="Internal note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Contains a phone number, abusive language" hint="Only admins see this note." />
      </Modal>
    </span>
  );
}
