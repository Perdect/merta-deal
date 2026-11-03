import type { Metadata } from "next";
import { ScrollText, SearchX } from "lucide-react";
import { getAuditFacets, getAdminUsers, spGet, spPage, type SP } from "@/lib/data/admin";
import { listAuditAdmin, getAuditEntry } from "@/lib/data/admin-care";
import { AdminPageHeader, DataTable, CellStack, RowLink, EmptyBlock, ErrorBlock, DetailList, ListToolbar, ListPagination, QuickView } from "@/components/admin/kit";
import { ActionPill, AuditChanges, changedFields } from "@/components/admin/audit-log-list";
import { hrefWith } from "@/components/admin/care/shared";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit logs" };

const ROLE_LABEL: Record<string, string> = { customer: "Customer", rider: "Rider", admin: "Admin", super_admin: "Super admin" };

export default async function AdminAuditLogsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = { entity: spGet(sp, "entity"), action: spGet(sp, "action"), actor: spGet(sp, "actor"), q: spGet(sp, "q"), from: spGet(sp, "from"), to: spGet(sp, "to") };
  const viewId = spGet(sp, "view");
  const validView = /^\d{1,18}$/.test(viewId);
  const [list, facets, admins, view] = await Promise.all([
    listAuditAdmin({ ...f, page: spPage(sp) }), getAuditFacets(), getAdminUsers(),
    validView ? getAuditEntry(Number(viewId)) : Promise.resolve(null),
  ]);
  const viewHref = (id: number) => hrefWith("/admin/audit-logs", sp, { view: String(id) });
  const filtered = Object.values(f).some(Boolean);
  const actor = (r: { actor: { full_name: string | null } | null; actor_id: string | null; actor_role: string | null }) =>
    ({ name: r.actor?.full_name ?? (r.actor_id ? "Unknown user" : "System"), role: r.actor_role ? ROLE_LABEL[r.actor_role] ?? r.actor_role : r.actor_id ? undefined : "Automatic" });

  return (
    <>
      <AdminPageHeader title="Audit logs" description="Every admin change, dispatch decision and settings edit, newest first. Open an entry to see exactly what changed." />

      <ListToolbar searchPlaceholder="Record id (order, product, user…)" dateRange={{ label: "Logged between (IST)" }} filters={[
        { key: "entity", label: "Record type", options: facets.entities.map((e) => ({ value: e, label: e })) },
        { key: "action", label: "Action", options: facets.actions.map((a) => ({ value: a, label: a })) },
        { key: "actor", label: "Done by", options: [{ value: "system", label: "System (automatic)" }, ...admins.map((a) => ({ value: a.id, label: `${a.full_name ?? "Unnamed admin"} (${ROLE_LABEL[a.role] ?? a.role})` }))] },
      ]} />

      {list.error ? <ErrorBlock title="Couldn't load the audit log" description="The database didn't respond. Your filters are kept; try again." retryHref={hrefWith("/admin/audit-logs", sp, { view: null })} /> : (
        <DataTable caption="Audit log" rows={list.items} rowKey={(r) => String(r.id)} selectedKey={validView ? viewId : null}
          empty={filtered
            ? <EmptyBlock icon={SearchX} title="No entries match" description="Remove a filter chip or widen the date range." />
            : <EmptyBlock icon={ScrollText} title="No audit entries yet" description="Changes made in the admin, and automatic dispatch decisions, are logged here." />}
          columns={[
            { key: "when", header: "When", hideBelow: "sm", render: (r) => <span className="whitespace-nowrap text-xs text-ink-3" title={formatDateTime(r.created_at)}>{formatDateTime(r.created_at)}</span> },
            { key: "action", header: "Action", render: (r) => <span className="flex flex-col items-start gap-1"><ActionPill action={r.action} /><span className="text-[11px] text-ink-4 sm:hidden">{timeAgo(r.created_at)}</span></span> },
            { key: "entity", header: "Record", render: (r) => <CellStack primary={r.entity} secondary={r.entity_id ? <span className="font-mono">{r.entity_id}</span> : undefined} className="max-w-[200px]" /> },
            { key: "actor", header: "Done by", hideBelow: "md", render: (r) => { const a = actor(r); return <CellStack primary={a.name} secondary={a.role} />; } },
            { key: "changes", header: "Changes", hideBelow: "lg", render: (r) => { const c = changedFields(r.before_data, r.after_data); return <span className="block max-w-[220px] truncate text-xs text-ink-3" title={c.join(", ")}>{c.length ? c.slice(0, 3).join(", ") + (c.length > 3 ? ` +${c.length - 3}` : "") : r.before_data == null && r.after_data != null ? "Created / recorded" : r.after_data == null && r.before_data != null ? "Removed" : "—"}</span>; } },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (r) => <RowLink href={viewHref(r.id)} scroll={false} label={`View audit entry ${r.id}`} /> },
          ]} />
      )}
      <ListPagination page={list.page} pageSize={list.pageSize} total={list.total} />

      {validView ? (
        view ? (
          <QuickView title={view.action} description={`${view.entity} · ${formatDateTime(view.created_at)}`}>
            <div className="space-y-5">
              <DetailList items={[
                { label: "Action", value: <ActionPill action={view.action} /> },
                { label: "Record type", value: view.entity },
                { label: "Record id", value: view.entity_id ? <span className="break-all font-mono text-xs">{view.entity_id}</span> : "—" },
                { label: "Done by", value: `${actor(view).name}${actor(view).role ? ` (${actor(view).role})` : ""}` },
                { label: "When", value: formatDateTime(view.created_at) },
                ...(view.ip_address ? [{ label: "IP address", value: <span className="font-mono text-xs">{view.ip_address}</span> }] : []),
                { label: "Entry", value: <span className="font-mono text-xs">#{view.id}</span> },
              ]} />
              <AuditChanges before={view.before_data} after={view.after_data} />
            </div>
          </QuickView>
        ) : (
          <QuickView title="Entry not found"><EmptyBlock title="This audit entry could not be loaded" description="The link may be out of date." /></QuickView>
        )
      ) : null}
    </>
  );
}
