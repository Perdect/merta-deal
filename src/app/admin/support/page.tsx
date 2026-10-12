import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy, SearchX } from "lucide-react";
import { getTicketAdmin, spGet, spPage, type SP } from "@/lib/data/admin";
import { listTicketsAdmin, countTickets, TICKET_TABS } from "@/lib/data/admin-care";
import { getSessionUser } from "@/lib/supabase/server";
import { AdminPageHeader, DataTable, CellStack, RowLink, EmptyBlock, ErrorBlock, DetailList, ListToolbar, StatusTabs, ListPagination, QuickView, StatusText } from "@/components/admin/kit";
import { TicketControls } from "@/components/admin/ticket-actions";
import { TicketThread } from "@/components/admin/care/ticket-thread";
import { hrefWith } from "@/components/admin/care/shared";
import { TICKET_PRIORITY_OPTIONS, TICKET_CATEGORY_OPTIONS } from "@/components/admin/constants";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Support" };

const TAB_LABEL: Record<string, string> = { open_all: "Needs reply", open: "Open", in_progress: "In progress", resolved: "Resolved", closed: "Closed", all: "All" };
const categoryLabel = (c: string) => TICKET_CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = (TICKET_TABS as readonly string[]).includes(spGet(sp, "status")) ? spGet(sp, "status") : "open_all";
  const f = { q: spGet(sp, "q"), priority: spGet(sp, "priority"), category: spGet(sp, "category") };
  const viewId = spGet(sp, "view");
  const validView = /^[0-9a-f-]{36}$/.test(viewId);
  const [list, counts, view, me] = await Promise.all([
    listTicketsAdmin({ ...f, status, page: spPage(sp) }),
    countTickets(f),
    validView ? getTicketAdmin(viewId) : Promise.resolve(null),
    validView ? getSessionUser() : Promise.resolve(null),
  ]);
  const viewHref = (id: string) => hrefWith("/admin/support", sp, { view: id });
  const filtered = Boolean(f.q || f.priority || f.category);

  return (
    <>
      <AdminPageHeader title="Support" description="Customer tickets. Open one to read the conversation, reply, and set status, priority or assignee." />

      <StatusTabs defaultValue="open_all" items={TICKET_TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: counts[t] ?? null }))} />
      <ListToolbar searchPlaceholder="Ticket number or subject" filters={[
        { key: "priority", label: "Priority", options: TICKET_PRIORITY_OPTIONS },
        { key: "category", label: "Category", options: TICKET_CATEGORY_OPTIONS },
      ]} />

      {list.error ? <ErrorBlock title="Couldn't load tickets" description="The database didn't respond. Your filters are kept; try again." retryHref={hrefWith("/admin/support", sp, { view: null })} /> : (
      <DataTable caption="Support tickets" rows={list.items} rowKey={(t) => t.id} selectedKey={validView ? viewId : null}
        empty={filtered
          ? <EmptyBlock icon={SearchX} title="No tickets match" description="Try another tab, remove a filter chip, or search a different ticket number." />
          : status === "open_all"
            ? <EmptyBlock icon={LifeBuoy} title="Nothing waiting for a reply" description="Resolved and closed tickets are under their own tabs." />
            : <EmptyBlock icon={LifeBuoy} title={`No ${TAB_LABEL[status].toLowerCase()} tickets`} description="Tickets appear here when customers contact support from their account." />}
        columns={[
          { key: "subject", header: "Ticket", render: (t) => <CellStack primary={t.subject} secondary={`${t.ticket_number} · ${categoryLabel(t.category)}${t.order ? ` · ${t.order.order_number}` : ""}`} href={`/admin/support/${t.id}`} /> },
          { key: "customer", header: "Customer", hideBelow: "md", render: (t) => <CellStack primary={t.user?.full_name ?? "Customer"} secondary={t.user?.phone ?? t.user?.email ?? undefined} /> },
          { key: "status", header: "Status", render: (t) => <span className="flex flex-col items-start gap-1"><StatusText value={t.status} /><span className="sm:hidden"><StatusText value={t.priority} label={`${t.priority[0].toUpperCase()}${t.priority.slice(1)} priority`} /></span></span> },
          { key: "priority", header: "Priority", hideBelow: "sm", render: (t) => <StatusText value={t.priority} /> },
          { key: "assignee", header: "Assignee", hideBelow: "lg", render: (t) => <span className="text-xs text-ink-2">{t.assignee?.full_name ?? <span className="text-ink-4">Unassigned</span>}</span> },
          { key: "updated", header: "Updated", hideBelow: "lg", render: (t) => <span className="whitespace-nowrap text-xs text-ink-3" title={`Opened ${formatDateTime(t.created_at)}`}>{timeAgo(t.updated_at)}</span> },
          { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (t) => <span className="inline-flex gap-1.5"><span className="hidden sm:inline-flex"><RowLink href={viewHref(t.id)} scroll={false} label={`Quick look at ${t.ticket_number}`}>Quick look</RowLink></span><RowLink href={`/admin/support/${t.id}`} label={`Open ticket ${t.ticket_number}`}>Open</RowLink></span> },
        ]} />
      )}
      <ListPagination page={list.page} pageSize={list.pageSize} total={list.total} />

      {validView ? (
        view ? (
          <QuickView title={view.ticket.subject} description={`${view.ticket.ticket_number} · opened ${formatDateTime(view.ticket.created_at)}`} fullHref={`/admin/support/${view.ticket.id}`} fullLabel="Open ticket"
            footer={<Link href={`/admin/support/${view.ticket.id}`} className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">Open ticket to reply</Link>}>
            <div className="space-y-5">
              <DetailList items={[
                { label: "Status", value: <StatusText value={view.ticket.status} /> },
                { label: "Priority", value: <StatusText value={view.ticket.priority} /> },
                { label: "Category", value: categoryLabel(view.ticket.category) },
                { label: "Customer", value: <Link href={`/admin/users/${view.ticket.user_id}`} className="text-brand-700 hover:underline">{view.ticket.user?.full_name ?? "Customer"}</Link> },
                { label: "Phone", value: view.ticket.user?.phone ?? "—" },
                { label: "Order", value: view.ticket.order_id ? <Link href={`/admin/orders/${view.ticket.order_id}`} className="text-brand-700 hover:underline">{view.ticket.order?.order_number ?? "View order"}</Link> : "—" },
              ]} />
              {me ? <section className="rounded-xl border border-line p-3"><h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Manage</h3><TicketControls ticket={view.ticket} meId={me.id} /></section> : null}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Latest messages{view.messages.length > 4 ? ` (4 of ${view.messages.length})` : ""}</h3>
                <TicketThread messages={view.messages.slice(-4)} compact />
              </section>
            </div>
          </QuickView>
        ) : (
          <QuickView title="Ticket not found"><EmptyBlock title="This ticket could not be loaded" description="It may have been removed, or the link is out of date." /></QuickView>
        )
      ) : null}
    </>
  );
}
