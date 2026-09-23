import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { listAuditLogs, getAuditFacets, getAdminUsers, spGet, spPage, type SP } from "@/lib/data/admin";
import { ListToolbar, ListPagination } from "@/components/admin/list-controls";
import { AuditLogList } from "@/components/admin/audit-log-list";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Audit logs" };

export default async function AdminAuditLogsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [{ items, total, page, pageSize }, facets, admins] = await Promise.all([
    listAuditLogs({ entity: spGet(sp, "entity"), action: spGet(sp, "action"), actor: spGet(sp, "actor"), q: spGet(sp, "q"), page: spPage(sp) }), getAuditFacets(), getAdminUsers(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Audit logs" subtitle={`${total} entries · every admin change, dispatch decision and settings edit`} className="px-0" />
      <ListToolbar searchPlaceholder="Entity id (order, store, user…)" filters={[
        { key: "entity", label: "Entities", options: facets.entities.map((e) => ({ value: e, label: e })) },
        { key: "action", label: "Actions", options: facets.actions.map((a) => ({ value: a, label: a })) },
        { key: "actor", label: "Actors", placeholder: "Any actor", options: admins.map((a) => ({ value: a.id, label: `${a.full_name ?? a.id.slice(0, 8)} (${a.role})` })) },
      ]} />
      {items.length === 0 ? <EmptyState icon={<ScrollText className="h-7 w-7" />} title="No log entries match" /> : <AuditLogList rows={items} />}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
