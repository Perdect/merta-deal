"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { moderateReviewAction } from "@/lib/actions/admin";

export function ReviewModerationButtons({ reviewId, status }: { reviewId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<"approved" | "rejected" | null>(null);
  const [note, setNote] = React.useState("");
  const run = async (s: "approved" | "rejected", n?: string) => { setBusy(s); const r = await moderateReviewAction(reviewId, s, n); setBusy(null); if (r.ok) { toast.success(s === "approved" ? "Review approved" : "Review rejected"); setOpen(null); setNote(""); router.refresh(); } else toast.error(r.error); };
  return (
    <span className="inline-flex gap-1.5">
      {status !== "approved" ? <Button size="xs" loading={busy === "approved"} onClick={() => run("approved")}><Check className="h-3.5 w-3.5" /> Approve</Button> : null}
      {status !== "rejected" ? <Button size="xs" variant="outline" className="text-danger" onClick={() => setOpen("rejected")}><X className="h-3.5 w-3.5" /> Reject</Button> : null}
      <Modal open={open === "rejected"} onClose={() => setOpen(null)} title="Reject review" size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setOpen(null)}>Cancel</Button><Button variant="danger" fullWidth loading={busy === "rejected"} onClick={() => run("rejected", note)}>Reject</Button></div>}>
        <Textarea label="Moderation note (internal)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Contains phone number / abusive language" />
      </Modal>
    </span>
  );
}
