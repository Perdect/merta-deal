"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, UserCheck, UserMinus } from "lucide-react";
import { Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { btn } from "@/components/admin/care/shared";
import { replyTicketAction } from "@/lib/actions/account";
import { updateTicketAction } from "@/lib/actions/admin";
import { ticketAssistAction } from "@/lib/actions/ai";
import type { TicketAssistResult } from "@/lib/ai/ticket-assist";
import { TICKET_PRIORITY_OPTIONS } from "@/components/admin/constants";
import type { TicketRow } from "@/lib/data/admin";
import type { Enums } from "@/types/database";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [{ value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "resolved", label: "Resolved" }, { value: "closed", label: "Closed" }];
const MAX = 2000;

/**
 * Staff reply box. Sending marks the ticket in progress (replyTicketAction).
 *
 * "Draft with AI" asks Claude for a summary, a draft reply and next steps from this ticket's conversation
 * (personal details masked on the server). Nothing is sent or changed by it: the draft only reaches the
 * customer if a person puts it in the box, edits it and presses Send. Without an AI key the button is not
 * shown and the box says so.
 */
export function TicketReply({ ticketId, closed, aiConfigured = false }: { ticketId: string; closed: boolean; aiConfigured?: boolean }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  const [assist, setAssist] = React.useState<TicketAssistResult | null>(null);
  const [drafting, setDrafting] = React.useState(false);
  const draft = async () => {
    if (drafting) return;
    setDrafting(true);
    const r = await ticketAssistAction(ticketId).catch((): TicketAssistResult => ({ ok: false, reason: "failed", message: "The draft could not be made. Check your connection and try again." }));
    setDrafting(false); setAssist(r);
  };
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
      {closed ? <p className="text-xs text-warning">This ticket is resolved or closed. Replying moves it back to in progress.</p> : null}
      <textarea id={id} value={text} maxLength={MAX} onChange={(e) => { setText(e.target.value); if (error) setError(null); }} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : undefined}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void send(); } }}
        placeholder="Type your reply…" className="min-h-24 w-full rounded-lg border border-line-2 bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger" />
      {error ? <p id={`${id}-err`} className="text-xs font-medium text-danger" role="alert">{error}</p> : null}
      {assist ? (
        <section aria-label="AI suggestion" className="rounded-lg border border-brand-200 bg-brand-50/60 p-3 text-sm motion-safe:animate-fade-in">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-800"><Sparkles className="h-3.5 w-3.5" aria-hidden />AI suggestion · review before sending</p>
          {assist.ok ? (
            <>
              <p className="mt-2 text-xs font-semibold text-ink-2">Summary</p>
              <p className="text-ink">{assist.summary}</p>
              {assist.nextSteps.length ? (<><p className="mt-2 text-xs font-semibold text-ink-2">Check before you reply</p><ul className="list-disc space-y-0.5 pl-5 text-ink">{assist.nextSteps.map((n) => <li key={n}>{n}</li>)}</ul></>) : null}
              <p className="mt-2 text-xs font-semibold text-ink-2">Draft reply</p>
              <p className="whitespace-pre-wrap rounded-md border border-line bg-card px-3 py-2 text-ink">{assist.reply}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className={cn(btn.secondary, btn.small)} onClick={() => { setText(assist.reply.slice(0, MAX)); setError(null); document.getElementById(id)?.focus(); }}>{text.trim() ? "Replace my text with this draft" : "Put this draft in the reply box"}</button>
                <button type="button" className="h-8 rounded-md px-2 text-xs font-semibold text-ink-3 hover:text-ink pointer-coarse:h-11" onClick={() => setAssist(null)}>Dismiss</button>
              </div>
              <p className="mt-2 text-xs text-ink-3">Written by Claude ({assist.model}) from {assist.shared.messages} {assist.shared.messages === 1 ? "message" : "messages"} on this ticket{assist.shared.order ? " and the linked order's status" : ""}. Names, phone numbers, emails, addresses and order numbers were not shared. It cannot see your records, so check any fact before sending.</p>
            </>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2"><p className="text-ink-2" role="alert">{assist.message}</p><button type="button" className="h-8 rounded-md px-2 text-xs font-semibold text-ink-3 hover:text-ink pointer-coarse:h-11" onClick={() => setAssist(null)}>Dismiss</button></div>
          )}
        </section>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">Ctrl/⌘ + Enter to send · {text.length}/{MAX}{aiConfigured ? null : <span className="block sm:inline"> · AI drafting is not set up (needs ANTHROPIC_API_KEY)</span>}</p>
        {aiConfigured ? (
          <button type="button" className={cn(btn.secondary, "ml-auto")} disabled={drafting} aria-busy={drafting || undefined} onClick={() => void draft()}>
            {drafting ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700 motion-reduce:animate-none" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {drafting ? "Drafting…" : "Draft with AI"}
          </button>
        ) : null}
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
