import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTicketAdmin } from "@/lib/data/admin";
import { getSessionUser } from "@/lib/supabase/server";
import { TicketReply, TicketControls } from "@/components/admin/ticket-actions";
import { TICKET_STATUS_TONE, TICKET_PRIORITY_TONE } from "@/components/admin/constants";
import { PageHeader, Avatar, KeyValue } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Ticket" };

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, me] = await Promise.all([getTicketAdmin(id), getSessionUser()]);
  if (!detail || !me) notFound();
  const { ticket: t, messages } = detail;
  return (
    <div className="space-y-4">
      <PageHeader back="/admin/support" title={t.subject} subtitle={<span className="inline-flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{t.ticket_number}</span><Badge tone={TICKET_STATUS_TONE[t.status]}>{t.status.replace("_", " ")}</Badge><Badge tone={TICKET_PRIORITY_TONE[t.priority]}>{t.priority}</Badge><span className="text-ink-3">{t.category} · opened {formatDateTime(t.created_at)}</span></span>} className="px-0" />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Conversation" subtitle={`${messages.length} messages`} />
          <CardBody>
            <ol className="space-y-3">
              {messages.map((m) => (
                <li key={m.id} className={cn("flex gap-3", m.is_staff && "flex-row-reverse")}>
                  <Avatar name={m.sender?.full_name} size={32} />
                  <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", m.is_staff ? "bg-brand-600 text-white" : "bg-surface-2 text-ink")}>
                    <p className="whitespace-pre-wrap">{m.message}</p>
                    <p className={cn("mt-1 text-[10px]", m.is_staff ? "text-white/70" : "text-ink-4")}>{m.sender?.full_name ?? (m.is_staff ? "Support" : "Customer")}{m.is_staff ? " · staff" : ""} · {formatDateTime(m.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 border-t border-line pt-4"><TicketReply ticketId={t.id} closed={t.status === "closed" || t.status === "resolved"} /></div>
          </CardBody>
        </Card>
        <aside className="space-y-4">
          <Card><CardHeader title="Manage" /><CardBody><TicketControls ticket={t} meId={me.id} /></CardBody></Card>
          <Card><CardHeader title="Customer" /><CardBody>
            <KeyValue items={[
              { label: "Name", value: <Link href={`/admin/users/${t.user_id}`} className="font-semibold text-brand-700">{t.user?.full_name ?? "—"}</Link> }, { label: "Phone", value: t.user?.phone ?? "—" }, { label: "Email", value: t.user?.email ?? "—" },
              { label: "Order", value: t.order_id ? <Link href={`/admin/orders/${t.order_id}`} className="font-semibold text-brand-700">{t.order?.order_number ?? "View"}</Link> : "—" },
            ]} />
          </CardBody></Card>
        </aside>
      </div>
    </div>
  );
}
