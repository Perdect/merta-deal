"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, UserCheck, UserMinus } from "lucide-react";
import { Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { btn } from "@/components/admin/care/shared";
import { replyTicketAction } from "@/lib/actions/account";
import { updateTicketAction } from "@/lib/actions/admin";
import { TICKET_PRIORITY_OPTIONS } from "@/components/admin/constants";
import type { TicketRow } from "@/lib/data/admin";
import type { Enums } from "@/types/database";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [{ value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "resolved", label: "Resolved" }, { value: "closed", label: "Closed" }];
const MAX = 2000;

/** Staff reply box. Sending marks the ticket in progress (replyTicketAction). */
export function TicketReply({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  const send = async () => {
    if (busy) return;
    if (!text.trim()) { setError("Write a reply before sending."); return; }
    setBusy(true); const r = await replyTicketAction(ticketId, text); setBusy(false);
    if (r.ok) { setText(""); setError(null); toast.success("Reply sent", "The customer can see it on their ticket."); router.refresh(); }
    else { setError(r.error); toast.error("Reply not sent", r.error); }
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void send(); }} className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-ink-2">Reply as Merta Deal support</label>
      {closed ? <p className="text-xs text-[#8a6300]">This ticket is resolved or closed. Replying moves it back to in progress.</p> : null}
      <textarea id={id} value={text} maxLength={MAX} onChange={(e) => { setText(e.target.value); if (error) setError(null); }} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : undefined}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void send(); } }}
        placeholder="Type your reply…" className="min-h-24 w-full rounded-lg border border-line-2 bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger" />
      {error ? <p id={`${id}-err`} className="text-xs font-medium text-danger" role="alert">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">Ctrl/⌘ + Enter to send · {text.length}/{MAX}</p>
        <button type="submit" className={btn.primary} disabled={busy}>
          {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          {busy ? "Sending…" : "Send reply"}
        </button>
      </div>
    </form>
  );
}

/** Status, priority and assignee. Resolving or closing notifies the customer, so it asks first. */
export function TicketControls({ ticket, meId }: { ticket: Pick<TicketRow, "id" | "status" | "priority" | "assigned_to" | "ticket_number"> & { assignee: { full_name: string | null } | null }; meId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = React.useState<Enums<"ticket_status"> | null>(null);
  const run = async (key: string, input: Parameters<typeof updateTicketAction>[1], msg: string) => {
    setBusy(key); const r = await updateTicketAction(ticket.id, input); setBusy(null);
    if (r.ok) { toast.success(msg); router.refresh(); } else toast.error("Ticket not updated", r.error);
    return r.ok;
  };
  const changeStatus = (s: Enums<"ticket_status">) => {
    if (s === ticket.status) return;
    if (s === "resolved" || s === "closed") setPendingStatus(s);
    else void run("status", { status: s }, `Ticket ${ticket.ticket_number} is now ${s.replace("_", " ")}`);
  };
  const mine = ticket.assigned_to === meId;
  return (
    <div className="space-y-4">
      <Select label="Status" options={STATUS_OPTIONS} value={ticket.status} disabled={busy === "status"} onChange={(e) => changeStatus(e.target.value as Enums<"ticket_status">)} hint="Resolving or closing notifies the customer" />
      <Select label="Priority" options={TICKET_PRIORITY_OPTIONS} value={ticket.priority} disabled={busy === "priority"} onChange={(e) => void run("priority", { priority: e.target.value as Enums<"ticket_priority"> }, "Priority updated")} />
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink-2">Assignee</p>
        <p className="mb-2 text-sm text-ink">{ticket.assignee?.full_name ?? <span className="text-ink-3">Unassigned</span>}{mine ? <span className="ml-1 text-xs text-brand-700">(you)</span> : null}</p>
        {mine
          ? <button type="button" className={cn(btn.secondary, btn.small)} disabled={busy === "assign"} onClick={() => void run("assign", { unassign: true }, "Unassigned from you")}><UserMinus className="h-3.5 w-3.5" aria-hidden />{busy === "assign" ? "Saving…" : "Unassign me"}</button>
          : <button type="button" className={cn(btn.secondary, btn.small)} disabled={busy === "assign"} onClick={() => void run("assign", { assignToSelf: true, status: ticket.status === "open" ? "in_progress" : undefined }, "Assigned to you")}><UserCheck className="h-3.5 w-3.5" aria-hidden />{busy === "assign" ? "Saving…" : ticket.assigned_to ? "Take over" : "Assign to me"}</button>}
      </div>
      <ConfirmDialog open={pendingStatus !== null} onClose={() => busy !== "status" && setPendingStatus(null)} loading={busy === "status"}
        title={`Mark ticket ${pendingStatus === "closed" ? "closed" : "resolved"}?`} confirmLabel={pendingStatus === "closed" ? "Close ticket" : "Mark resolved"}
        description="The customer gets a notification that their ticket was updated. They can still reply if they need more help."
        onConfirm={async () => { if (pendingStatus && (await run("status", { status: pendingStatus }, `Ticket ${ticket.ticket_number} ${pendingStatus}`))) setPendingStatus(null); }} />
    </div>
  );
}
