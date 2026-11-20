import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTicketAdmin } from "@/lib/data/admin";
import { getSessionUser } from "@/lib/supabase/server";
import { AdminPageHeader, Panel, DetailList, StatusText } from "@/components/admin/kit";
import { TicketReply, TicketControls } from "@/components/admin/ticket-actions";
import { TicketThread } from "@/components/admin/care/ticket-thread";
import { TICKET_CATEGORY_OPTIONS } from "@/components/admin/constants";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { isClaudeConfigured } from "@/lib/ai/client";

export const metadata: Metadata = { title: "Ticket" };

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, me] = await Promise.all([getTicketAdmin(id), getSessionUser()]);
  if (!detail || !me) notFound();
  const { ticket: t, messages } = detail;
  const closed = t.status === "closed" || t.status === "resolved";
  const last = messages[messages.length - 1];

  return (
    <>
      <AdminPageHeader back="/admin/support" title={t.subject}
        meta={<>
          <span className="font-mono text-xs text-ink-3">{t.ticket_number}</span>
          <StatusText value={t.status} />
          <StatusText value={t.priority} label={`${t.priority[0].toUpperCase()}${t.priority.slice(1)} priority`} />
          <span className="text-xs text-ink-3">{TICKET_CATEGORY_OPTIONS.find((o) => o.value === t.category)?.label ?? t.category} · opened {formatDateTime(t.created_at)}</span>
        </>} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Conversation" description={`${messages.length} ${messages.length === 1 ? "message" : "messages"}${last ? ` · last ${timeAgo(last.created_at)} from ${last.is_staff ? "support" : "the customer"}` : ""}`}
          footer={<TicketReply ticketId={t.id} closed={closed} aiConfigured={isClaudeConfigured()} />}>
          <TicketThread messages={messages} />
        </Panel>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Panel title="Manage"><TicketControls ticket={t} meId={me.id} /></Panel>
          <Panel title="Customer">
            <DetailList items={[
              { label: "Name", value: <Link href={`/admin/users/${t.user_id}`} className="font-medium text-brand-700 hover:underline">{t.user?.full_name ?? "Customer"}</Link> },
              { label: "Phone", value: t.user?.phone ? <a href={`tel:${t.user.phone}`} className="hover:underline">{t.user.phone}</a> : "—" },
              { label: "Email", value: t.user?.email ? <a href={`mailto:${t.user.email}`} className="break-all hover:underline">{t.user.email}</a> : "—" },
              { label: "Order", value: t.order_id ? <Link href={`/admin/orders/${t.order_id}`} className="font-medium text-brand-700 hover:underline">{t.order?.order_number ?? "View order"}</Link> : "—" },
              { label: "Last updated", value: formatDateTime(t.updated_at) },
            ]} />
          </Panel>
        </aside>
      </div>
    </>
  );
}
