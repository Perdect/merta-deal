import type { Metadata } from "next";
import Link from "next/link";
import { Bike, SearchX } from "lucide-react";
import { getLiveRiders, getRiderDetail, getCities, spGet, spPage, type SP } from "@/lib/data/admin";
import { listRidersOps, countRidersByStatus, listHref, type RiderFilters } from "@/lib/data/admin-ops";
import { AdminPageHeader, Panel, DataTable, CellStack, RowLink, EmptyBlock, ErrorBlock, ListToolbar, StatusTabs, ListPagination, QuickView, DetailList, StatusText, rupees, rupeesRounded } from "@/components/admin/kit";
import { RidersLiveBoard } from "@/components/admin/riders-map";
import { RiderStatusActions } from "@/components/admin/rider-actions";
import { RiderStatusPill, OnlinePill, ActivePill, VEHICLE_LABEL } from "@/components/admin/ops/pills";
import { VEHICLE_OPTIONS } from "@/components/admin/constants";
import { Avatar, StarRating } from "@/components/ui/misc";
import { formatDate, formatDateTime, formatNumber, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Riders" };

const TABS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending approval" },
  { value: "suspended", label: "Suspended" },
];

export default async function AdminRidersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters: RiderFilters = { q: spGet(sp, "q"), status: spGet(sp, "status"), online: spGet(sp, "online"), vehicle: spGet(sp, "vehicle") };
  const viewId = spGet(sp, "view");
  const validView = /^[0-9a-f-]{36}$/.test(viewId);
  const [list, counts, live, view, cities] = await Promise.all([
    listRidersOps({ ...filters, page: spPage(sp) }),
    countRidersByStatus(filters),
    getLiveRiders(),
    validView ? getRiderDetail(viewId) : Promise.resolve(null),
    validView ? getCities() : Promise.resolve([]),
  ]);
  const { items, total, page, pageSize, error } = list;
  const here = listHref("/admin/riders", sp);
  const viewHref = (id: string) => listHref("/admin/riders", sp, { view: id });
  const filtered = Boolean(filters.q || filters.online || filters.vehicle);
  const vName = view ? view.rider.user?.full_name ?? "Rider" : "";

  return (
    <>
      <AdminPageHeader title="Riders" description="Approve and manage delivery partners, and see who is online right now." />

      <Panel title="Live now" description="Approved riders who are online, with their last GPS fix" className="mb-5">
        <RidersLiveBoard initial={live} />
      </Panel>

      <h2 className="mb-2 text-[15px] font-semibold text-ink">All riders</h2>
      <StatusTabs items={TABS.map((t) => ({ ...t, count: counts[t.value] ?? null }))} />
      <ListToolbar searchPlaceholder="Name, phone, vehicle or licence number" filters={[
        { key: "online", label: "Availability", options: [{ value: "1", label: "Online" }, { value: "0", label: "Offline" }] },
        { key: "vehicle", label: "Vehicle", options: VEHICLE_OPTIONS },
      ]} />

      {error ? (
        <ErrorBlock title="Couldn't load riders" description="The rider list didn't load. Check your connection, then retry." retryHref={here} />
      ) : (
        <DataTable caption="Riders" rows={items} rowKey={(r) => r.id} selectedKey={validView ? viewId : null}
          empty={filtered || filters.status
            ? <EmptyBlock icon={SearchX} title="No riders match" description="Try another tab, remove a filter chip, or search by phone or vehicle number." />
            : <EmptyBlock icon={Bike} title="No riders yet" description="People sign up as delivery partners from the customer site; new sign-ups appear here under Pending approval." />}
          columns={[
            { key: "rider", header: "Rider", render: (r) => (
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={r.user?.full_name} src={r.user?.avatar_url} size={34} className="shrink-0" />
                <CellStack primary={r.user?.full_name ?? "Unnamed rider"} secondary={r.user?.phone ?? "No phone"} href={viewHref(r.id)} scroll={false} />
              </span>
            ) },
            { key: "status", header: "Status", render: (r) => (
              <span className="flex flex-col items-start gap-1">
                <RiderStatusPill status={r.status} />
                {r.status === "active" ? <span className="text-xs text-ink-3">{r.is_online ? "Online" : "Offline"}</span> : null}
              </span>
            ) },
            { key: "vehicle", header: "Vehicle", hideBelow: "md", render: (r) => <CellStack primary={VEHICLE_LABEL[r.vehicle_type] ?? r.vehicle_type} secondary={r.vehicle_number ?? undefined} /> },
            { key: "rating", header: "Rating", hideBelow: "lg", render: (r) => <StarRating value={r.rating_avg} count={r.rating_count} /> },
            { key: "deliveries", header: "Deliveries", align: "right", hideBelow: "sm", render: (r) => <span className="tabular">{formatNumber(r.total_deliveries)}</span> },
            { key: "earned", header: "Earned", align: "right", hideBelow: "lg", render: (r) => <span className="tabular">{rupeesRounded(r.total_earnings)}</span> },
            { key: "gps", header: "Last GPS", hideBelow: "xl", render: (r) => <span className="whitespace-nowrap text-xs text-ink-3" title={r.last_location_at ? formatDateTime(r.last_location_at) : undefined}>{r.last_location_at ? timeAgo(r.last_location_at) : "Never"}</span> },
            { key: "joined", header: "Joined", hideBelow: "xl", render: (r) => <span className="whitespace-nowrap text-xs text-ink-3">{formatDate(r.created_at)}</span> },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (r) => <RowLink href={viewHref(r.id)} label={`Quick view of ${r.user?.full_name ?? "rider"}`} scroll={false} /> },
          ]} />
      )}
      {!error ? <ListPagination page={page} pageSize={pageSize} total={total} /> : null}

      {validView ? (
        view ? (
          <QuickView title={vName} description={<span className="inline-flex flex-wrap items-center gap-2"><RiderStatusPill status={view.rider.status} /><OnlinePill online={view.rider.is_online} />{view.rider.user && !view.rider.user.is_active ? <ActivePill active={false} inactiveLabel="Account deactivated" /> : null}</span>} fullHref={`/admin/riders/${view.rider.id}`}
            footer={<div className="space-y-2"><RiderStatusActions rider={view.rider} name={vName} /><Link href={`/admin/riders/${view.rider.id}`} className="inline-flex text-sm font-semibold text-brand-700 hover:underline sm:hidden">Open full page</Link></div>}>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">
                {[
                  { label: "Deliveries", value: formatNumber(view.rider.total_deliveries) },
                  { label: "Earned", value: rupeesRounded(view.rider.total_earnings) },
                  { label: "Rating", value: <StarRating value={view.rider.rating_avg} count={view.rider.rating_count} /> },
                ].map((m) => <div key={m.label} className="rounded-lg border border-line px-3 py-2"><p className="text-[11px] text-ink-3">{m.label} (all time)</p><div className="font-semibold tabular text-ink">{m.value}</div></div>)}
              </div>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">Profile</h3>
                <DetailList items={[
                  { label: "Phone", value: view.rider.user?.phone ? <a href={`tel:${view.rider.user.phone}`} className="hover:underline">{view.rider.user.phone}</a> : "—" },
                  { label: "Vehicle", value: `${VEHICLE_LABEL[view.rider.vehicle_type] ?? view.rider.vehicle_type}${view.rider.vehicle_number ? ` · ${view.rider.vehicle_number}` : ""}` },
                  { label: "Licence", value: view.rider.license_number ?? "—" },
                  { label: "City", value: cities.find((c) => c.id === view.rider.city_id)?.name ?? "Any" },
                  { label: "Last GPS", value: view.rider.last_location_at ? timeAgo(view.rider.last_location_at) : "Never" },
                  { label: "Joined", value: formatDate(view.rider.created_at) },
                ]} />
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">Recent assignments</h3>
                {view.assignments.length ? (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {view.assignments.slice(0, 5).map((a) => (
                      <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1">{a.order ? <Link href={`/admin/orders/${a.order.id}`} className="font-medium text-ink hover:underline">{a.order.order_number}</Link> : "Order"}<span className="block truncate text-xs text-ink-3">{timeAgo(a.offered_at)}</span></span>
                        <StatusText value={a.status} />
                        <span className="w-20 text-right text-xs tabular text-ink-3">{rupees(a.earning)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-ink-3">No delivery offers yet.</p>}
              </section>
            </div>
          </QuickView>
        ) : (
          <QuickView title="Rider not found"><EmptyBlock title="This rider could not be loaded" description="The rider may have been removed, or the link is out of date." /></QuickView>
        )
      ) : null}
    </>
  );
}
