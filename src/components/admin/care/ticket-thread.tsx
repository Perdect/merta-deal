import * as React from "react";
import { MessagesSquare } from "lucide-react";
import { EmptyBlock } from "@/components/admin/kit";
import { Avatar } from "@/components/ui/misc";
import type { TicketMessage } from "@/lib/data/admin";
import { cn, formatDateTime } from "@/lib/utils";

/** Conversation bubbles: customer on the left, staff on the right; sender and time in words. */
export function TicketThread({ messages, compact }: { messages: TicketMessage[]; compact?: boolean }) {
  if (!messages.length) return <EmptyBlock icon={MessagesSquare} title="No messages yet" description="Write the first reply below." />;
  return (
    <ol className={cn("space-y-3", compact && "space-y-2")} aria-label="Conversation">
      {messages.map((m) => (
        <li key={m.id} className={cn("flex gap-2.5", m.is_staff && "flex-row-reverse")}>
          {!compact ? <Avatar name={m.sender?.full_name ?? (m.is_staff ? "Support" : "Customer")} size={30} className="mt-0.5 shrink-0" /> : null}
          <div className={cn("max-w-[85%] rounded-xl px-3 py-2 text-sm", m.is_staff ? "bg-brand-50 text-ink ring-1 ring-inset ring-brand-100" : "bg-surface-2 text-ink")}>
            <p className="mb-0.5 text-[11px] font-semibold text-ink-3">{m.sender?.full_name ?? (m.is_staff ? "Support" : "Customer")} · {m.is_staff ? "Staff" : "Customer"}</p>
            <p className="whitespace-pre-wrap break-words">{m.message}</p>
            <p className="mt-1 text-[11px] text-ink-4">{formatDateTime(m.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
