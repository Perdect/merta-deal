import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { listTickets, spGet, spPage, type SP } from "@/lib/data/admin";
import { ListToolbar, ListPagination } from "@/components/admin/list-controls";
import { TICKET_STATUS_OPTIONS, TICKET_STATUS_TONE, TICKET_PRIORITY_OPTIONS, TICKET_PRIORITY_TONE, TICKET_CATEGORY_OPTIONS } from "@/components/admin/constants";
import { PageHeader, Table } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Support" };

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = spGet(sp, "status") || "open_all";
  const { items, total, page, pageSize } = await listTickets({ q: spGet(sp, "q"), status: status === "all" ? "" : status, priority: spGet(sp, "priority"), category: spGet(sp, "category"), page: spPage(sp) });
  return (
    <div className="space-y-4">
      <PageHeader title="Support" subtitle={`${total} tickets`} className="px-0" />
      <ListToolbar searchPlaceholder="Ticket number or subject" filters={[{ key: "status", label: "Statuses", placeholder: "Open + in progress", options: TICKET_STATUS_OPTIONS.filter((o) => o.value !== "open_all").concat([{ value: "all", label: "All statuses" }]) }, { key: "priority", label: "Priorities", options: TICKET_PRIORITY_OPTIONS }, { key: "category", label: "Categories", options: TICKET_CATEGORY_OPTIONS }]} />
      {items.length === 0 ? <EmptyState icon={<LifeBuoy className="h-7 w-7" />} title="No tickets" description={status === "open_all" ? "Inbox zero. Resolved and closed tickets are under the status filter." : "Nothing matches these filters."} /> : (
        <Table rows={items as unknown as Record<string, unknown>[]} columns={[
          { key: "subject", header: "Ticket", render: (r) => { const t = r as unknown as (typeof items)[number]; return <Link href={`/admin/support/${t.id}`} className="block"><span className="font-semibold text-ink">{t.subject}</span><span className="block text-xs text-ink-3">{t.ticket_number} · {t.category}{t.order ? ` · ${t.order.order_number}` : ""}</span></Link>; } },
          { key: "user", header: "Customer", render: (r) => { const u = r.user as { full_name: string | null; phone: string | null } | null; return <span className="text-sm">{u?.full_name ?? "—"}<span className="block text-xs text-ink-3">{u?.phone ?? ""}</span></span>; } },
          { key: "status", header: "Status", render: (r) => <Badge tone={TICKET_STATUS_TONE[r.status as string]}>{String(r.status).replace("_", " ")}</Badge> },
          { key: "priority", header: "Priority", render: (r) => <Badge tone={TICKET_PRIORITY_TONE[r.priority as string]}>{String(r.priority)}</Badge> },
          { key: "assignee", header: "Assignee", render: (r) => <span className="text-xs">{(r.assignee as { full_name: string | null } | null)?.full_name ?? <span className="text-ink-4">—</span>}</span> },
          { key: "updated_at", header: "Updated", render: (r) => <span className="text-xs text-ink-3">{timeAgo(r.updated_at as string)}<span className="block text-ink-4">opened {formatDateTime(r.created_at as string)}</span></span> },
        ]} />
      )}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
