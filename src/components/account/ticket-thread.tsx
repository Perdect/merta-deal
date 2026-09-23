"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, LifeBuoy } from "lucide-react";
import type { Tables, Enums } from "@/types/database";
import { replyTicketAction } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { Avatar } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { cn, formatDateTime } from "@/lib/utils";

type Message = Tables<"support_messages">;

/** Chat-style ticket conversation with a reply box (disabled once the ticket is closed). */
export function TicketThread({ ticketId, status, initial, userName, userAvatar }: { ticketId: string; status: Enums<"ticket_status">; initial: Message[]; userName: string | null; userAvatar: string | null }) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<Message[]>(initial);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  // Replace the optimistic list once the server re-renders with the saved messages.
  const [prevInitial, setPrevInitial] = React.useState(initial);
  if (prevInitial !== initial) { setPrevInitial(initial); setMessages(initial); }
  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  const closed = status === "closed";

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    const r = await replyTicketAction(ticketId, body);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setMessages((cur) => [...cur, { id: `tmp-${Date.now()}`, ticket_id: ticketId, sender_id: "me", message: body, is_staff: false, created_at: new Date().toISOString() }]);
    setText(""); router.refresh();
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {messages.map((m) => (
          <li key={m.id} className={cn("flex items-end gap-2", m.is_staff ? "justify-start" : "justify-end")}>
            {m.is_staff ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"><LifeBuoy className="h-4 w-4" /></span> : null}
            <div className={cn("max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm shadow-card", m.is_staff ? "rounded-bl-sm border border-line bg-card text-ink" : "rounded-br-sm bg-brand-600 text-white")}>
              <p className={cn("mb-0.5 text-[11px] font-semibold", m.is_staff ? "text-brand-700" : "text-white/80")}>{m.is_staff ? "Merta Deal Support" : "You"}</p>
              <p className="whitespace-pre-wrap break-words">{m.message}</p>
              <p className={cn("mt-1 text-[10px]", m.is_staff ? "text-ink-3" : "text-white/70")}>{formatDateTime(m.created_at)}</p>
            </div>
            {!m.is_staff ? <Avatar name={userName} src={userAvatar} size={32} className="shrink-0" /> : null}
          </li>
        ))}
        <div ref={endRef} />
      </ol>
      {closed ? (
        <Alert tone="neutral">This ticket is closed. If the problem is back, raise a new ticket from Help &amp; Support.</Alert>
      ) : (
        <form onSubmit={send} className="rounded-lg border border-line bg-card p-3 shadow-card">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" maxLength={2000} className="min-h-20" aria-label="Reply" />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-3">{status === "resolved" ? "Marked resolved — replying reopens the conversation for our team." : "We usually reply within a few hours."}</p>
            <Button type="submit" size="sm" loading={busy} disabled={!text.trim()}><Send className="h-4 w-4" /> Send</Button>
          </div>
        </form>
      )}
    </div>
  );
}
