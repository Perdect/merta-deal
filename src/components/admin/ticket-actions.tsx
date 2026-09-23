"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, UserCheck, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { replyTicketAction } from "@/lib/actions/account";
import { updateTicketAction } from "@/lib/actions/admin";
import { TICKET_PRIORITY_OPTIONS } from "@/components/admin/constants";
import type { TicketRow } from "@/lib/data/admin";
import type { Enums } from "@/types/database";

const STATUS_OPTIONS = [{ value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "resolved", label: "Resolved" }, { value: "closed", label: "Closed" }];

export function TicketReply({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const send = async () => { setBusy(true); const r = await replyTicketAction(ticketId, text); setBusy(false); if (r.ok) { setText(""); toast.success("Reply sent"); router.refresh(); } else toast.error(r.error); };
  return (
    <div className="space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={closed ? "This ticket is closed — replying reopens the conversation for the customer." : "Type your reply as Merta Deal support…"} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); }} />
      <div className="flex items-center justify-between"><p className="text-xs text-ink-3">Sent as staff · Ctrl/⌘+Enter to send</p><Button size="sm" disabled={!text.trim()} loading={busy} onClick={send}><Send className="h-4 w-4" /> Reply</Button></div>
    </div>
  );
}

export function TicketControls({ ticket, meId }: { ticket: TicketRow; meId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = async (key: string, input: Parameters<typeof updateTicketAction>[1], msg: string) => { setBusy(key); const r = await updateTicketAction(ticket.id, input); setBusy(null); if (r.ok) { toast.success(msg); router.refresh(); } else toast.error(r.error); };
  const mine = ticket.assigned_to === meId;
  return (
    <div className="space-y-3">
      <Select label="Status" options={STATUS_OPTIONS} value={ticket.status} disabled={busy === "status"} onChange={(e) => run("status", { status: e.target.value as Enums<"ticket_status"> }, "Status updated")} />
      <Select label="Priority" options={TICKET_PRIORITY_OPTIONS} value={ticket.priority} disabled={busy === "priority"} onChange={(e) => run("priority", { priority: e.target.value as Enums<"ticket_priority"> }, "Priority updated")} />
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink-2">Assignee</p>
        <p className="mb-2 text-sm text-ink">{ticket.assignee?.full_name ?? <span className="text-ink-3">Unassigned</span>}{mine ? <span className="ml-1 text-xs text-brand-700">(you)</span> : null}</p>
        {mine ? <Button size="sm" variant="outline" loading={busy === "assign"} onClick={() => run("assign", { unassign: true }, "Unassigned")}><UserMinus className="h-4 w-4" /> Unassign me</Button> : <Button size="sm" variant="secondary" loading={busy === "assign"} onClick={() => run("assign", { assignToSelf: true, status: ticket.status === "open" ? "in_progress" : undefined }, "Assigned to you")}><UserCheck className="h-4 w-4" /> Assign to me</Button>}
      </div>
    </div>
  );
}
