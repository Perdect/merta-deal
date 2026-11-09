import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getTicket } from "@/lib/data/account";
import { TicketThread } from "@/components/account/ticket-thread";
import { TICKET_CATEGORY_LABEL } from "@/components/account/ticket-form";
import { PageHeader } from "@/components/ui/misc";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import type { Enums } from "@/types/database";

export const metadata: Metadata = { title: "Support ticket", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS: Record<Enums<"ticket_status">, { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "info" }, in_progress: { label: "In progress", tone: "warning" }, resolved: { label: "Resolved", tone: "success" }, closed: { label: "Closed", tone: "neutral" },
};

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return null; // the account layout shows the login prompt
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getTicket(id);
  if (!data) notFound();
  const { ticket, messages } = data;
  const s = STATUS[ticket.status];
  return (
    <div className="pt-1">
      <PageHeader title={ticket.subject} back="/account/support" subtitle={`${ticket.ticket_number} · ${TICKET_CATEGORY_LABEL[ticket.category] ?? ticket.category} · ${formatDateTime(ticket.created_at)}`} action={<Badge tone={s.tone}>{s.label}</Badge>} />
      <div className="space-y-4 px-4 sm:px-0">
        {ticket.order_id ? (
          <Link href={`/orders/${ticket.order_id}`} className="flex items-center gap-3 rounded-lg border border-line bg-card px-4 py-3 shadow-card transition-colors hover:bg-surface">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Package className="h-4.5 w-4.5" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">Linked order</span><span className="block text-xs text-ink-3">Open the order to see items, status and tracking</span></span>
          </Link>
        ) : null}
        <TicketThread ticketId={ticket.id} status={ticket.status} initial={messages} userName={user.fullName} userAvatar={user.avatarUrl} />
      </div>
    </div>
  );
}
