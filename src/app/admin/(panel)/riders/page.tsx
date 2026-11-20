import type { Metadata } from "next";
import Link from "next/link";
import { Bike, CircleAlert, CircleCheck, PackageCheck, Power, Radio, SearchX, TimerOff, UserX, type LucideIcon } from "lucide-react";
import { getLiveRiders, getRiderDetail, getCities, spGet, spPage, type SP, type RiderRow } from "@/lib/data/admin";
import { listRidersOps, countRidersByStatus, listHref, type RiderFilters } from "@/lib/data/admin-ops";
import { getDispatchAlerts, getRiderOps, loaded, riderLastContact, type RiderCurrent } from "@/lib/data/admin-dashboard";
import { AdminPageHeader, Panel, MetricCard, ActionRow, DataTable, CellStack, RowLink, EmptyBlock, ErrorBlock, ListToolbar, StatusTabs, ListPagination, QuickView, DetailList, StatusText, LiveList, rupees, rupeesRounded } from "@/components/admin/kit";
import { RidersLiveBoard } from "@/components/admin/riders-map";
import { RiderStatusActions } from "@/components/admin/rider-actions";
import { AddRiderButton, RiderRowActions } from "@/components/admin/rider-manage";
import { RiderApplications } from "@/components/admin/rider-applications";
import { getRiderApplications } from "@/lib/data/rider-applications";
import { getSessionUser } from "@/lib/supabase/server";
import { RiderStatusPill, RiderNowPill, OnlinePill, ActivePill, VEHICLE_LABEL } from "@/components/admin/ops/pills";
import { VEHICLE_OPTIONS } from "@/components/admin/constants";
import { Avatar, StarRating } from "@/components/ui/misc";
import { formatDate, formatDateTime, formatNumber, formatTime, timeAgo } from "@/lib/utils";

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
  // Availability and dispatch are read alongside the list; if either read fails the page says so in
  // that spot and the list below still works.
  const [list, counts, live, view, cities, me, applications, opsR, dispatchR] = await Promise.all([
    listRidersOps({ ...filters, page: spPage(sp) }),
    countRidersByStatus(filters),
    getLiveRiders(),
    validView ? getRiderDetail(viewId) : Promise.resolve(null),
    getCities(),
    getSessionUser(),
    getRiderApplications("new"),
    loaded(getRiderOps()),
    loaded(getDispatchAlerts()),
  ]);
  const ops = opsR.ok ? opsR.data : null;
  const dispatch = dispatchR.ok ? dispatchR.data : null;
  const selfId = me?.id ?? "";
  const { items, total, page, pageSize, error } = list;
  const here = listHref("/admin/riders", sp);
  const viewHref = (id: string) => listHref("/admin/riders", sp, { view: id });
  const filtered = Boolean(filters.q || filters.online || filters.vehicle);
  const vName = view ? view.rider.user?.full_name ?? "Rider" : "";
  const vNow = view ? ops?.current[view.rider.id] : undefined;
  const vContact = view ? riderLastContact(view.rider) : null;

  const orders = (n: number) => `${formatNumber(n)} packed ${n === 1 ? "order is" : "orders are"}`;
  const problems: { key: string; href: string; icon: LucideIcon; title: string; detail?: string; tone: "red" | "amber"; count?: number }[] = [];
  if (!dispatchR.ok) problems.push({ key: "failed", href: "/admin/orders?status=ready", icon: CircleAlert, tone: "amber", title: "Couldn't load dispatch problems", detail: "Not counted here. Reload the page, or open the packed orders to check." });
  else if (dispatch) {
    if (dispatch.packed && dispatch.online === 0) problems.push({ key: "none-online", href: "/admin/orders?status=ready", icon: UserX, tone: "red", count: dispatch.packed, title: "No rider is online", detail: `${orders(dispatch.packed)} waiting and nobody can take ${dispatch.packed === 1 ? "it" : "them"}. Call a rider, then assign from the order.` });
    else if (dispatch.packed && dispatch.free === 0) problems.push({ key: "all-busy", href: "/admin/orders?status=ready", icon: Bike, tone: "amber", count: dispatch.packed, title: `${dispatch.online === 1 ? "The only rider online is" : `All ${formatNumber(dispatch.online)} riders online are`} on a delivery`, detail: `${orders(dispatch.packed)} waiting for a free rider` });
    else if (dispatch.waitingNoOffer) problems.push({ key: "no-offer", href: "/admin/orders?status=ready", icon: PackageCheck, tone: "amber", count: dispatch.waitingNoOffer, title: `${orders(dispatch.waitingNoOffer)} waiting with no offer out to any rider`, detail: "Open the order to assign a rider or re-run dispatch" });
    if (dispatch.unanswered.length) problems.push({ key: "offers", href: "/admin/orders?status=ready", icon: TimerOff, tone: "amber", count: dispatch.timedOut + dispatch.declined, title: dispatch.timedOut ? "Rider offers ran out with no answer" : "Rider offers were declined",
      detail: dispatch.unanswered.slice(0, 3).map((o) => `${o.order_number} · ${[o.timedOut ? `${o.timedOut} timed out` : "", o.declined ? `${o.declined} declined` : ""].filter(Boolean).join(", ")}`).join(", ") + (dispatch.unanswered.length > 3 ? ` +${dispatch.unanswered.length - 3} more` : "") });
  }

  return (
    <>
      <AdminPageHeader title="Riders" description="Approve and manage delivery partners, and see who is online right now. Add a rider you already know, edit details in place, or open one to approve or suspend."
        actions={<><LiveList topic="admin-riders" tables={[{ table: "delivery_assignments" }]} /><AddRiderButton cities={cities} /></>} />

      {/* 1. Who can take an order right now; 2. what dispatch is stuck on; 3. the live board; 4. applications and the full list. */}
      {ops ? (
        <section aria-label="Rider availability right now" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard label="Free for an order" period="Online, not on a delivery" value={formatNumber(ops.free)} icon={CircleCheck} href="/admin/riders?status=active&online=1" hint={`${formatNumber(ops.online)} online in all`} />
          <MetricCard label="On a delivery" period="Accepted or picked up" value={formatNumber(ops.busy)} icon={Bike} href="/admin/orders?status=on_the_way" />
          <MetricCard label="Offline" period={`Of ${formatNumber(ops.approved)} approved ${ops.approved === 1 ? "rider" : "riders"}`} value={formatNumber(ops.offline)} icon={Power} href="/admin/riders?status=active&online=0" />
          {dispatch
            ? <MetricCard label="Packed orders waiting" period="No rider has accepted yet" value={formatNumber(dispatch.packed)} icon={PackageCheck} href="/admin/orders?status=ready" tone={dispatch.packed ? "attention" : "default"} hint={dispatch.packed ? `${formatNumber(dispatch.packed - dispatch.waitingNoOffer)} with an offer out now` : "Nothing waiting"} />
            : <MetricCard label="Packed orders waiting" period="No rider has accepted yet" value="—" icon={PackageCheck} href="/admin/orders?status=ready" hint="Couldn't load. Open the list to check." />}
        </section>
      ) : (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-50 px-4 py-2.5 text-sm font-medium text-warning"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Couldn&rsquo;t load who is free, on a delivery or offline. The list below still shows each rider&rsquo;s online switch; reload to try again.</p>
      )}

      {problems.length ? (
        <Panel title={`Dispatch needs attention · ${problems.length}`} description="Packed orders that are not moving. Each row opens the orders it is about." flush className="mb-4 border-warning/50">
          <div className="grid gap-x-4 px-2 pb-2 pt-1 md:grid-cols-2">{problems.map(({ key, ...row }) => <ActionRow key={key} {...row} />)}</div>
        </Panel>
      ) : null}

      <Panel title="Live now" description={`Approved riders who are online, with the last time their app checked in and their last GPS fix.${ops?.staleMinutes ? ` A rider who is not on a delivery is set offline after ${formatNumber(ops.staleMinutes)} minutes without contact.` : ""}`} className="mb-5">
        <RidersLiveBoard initial={live} contact={ops?.contact} />
      </Panel>

      <Panel title={applications.length ? `Applications (${applications.length})` : "Applications"} description="From the Deliver with Merta Deal page. Call the applicant, then create their email sign-in from the application; the password you set is what they use at the delivery partner login." className="mb-5" flush>
        <RiderApplications items={applications} cities={cities} />
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
            : <EmptyBlock icon={Bike} title="No riders yet" description="Add a rider with the button above, or create one from an application." />}
          columns={[
            { key: "rider", header: "Rider", render: (r) => (
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={r.user?.full_name} src={r.user?.avatar_url} size={34} className="shrink-0" />
                <CellStack primary={r.user?.full_name ?? "Unnamed rider"} secondary={r.user?.phone ?? "No phone"} href={viewHref(r.id)} scroll={false} />
              </span>
            ) },
            { key: "status", header: "Status", render: (r) => <RiderStatusPill status={r.status} /> },
            { key: "now", header: "Right now", render: (r) => <RiderNow rider={r} now={ops?.current[r.id]} known={Boolean(ops)} /> },
            { key: "vehicle", header: "Vehicle", hideBelow: "md", render: (r) => <CellStack primary={VEHICLE_LABEL[r.vehicle_type] ?? r.vehicle_type} secondary={r.vehicle_number ?? undefined} /> },
            { key: "rating", header: "Rating", hideBelow: "lg", render: (r) => <StarRating value={r.rating_avg} count={r.rating_count} /> },
            { key: "deliveries", header: "Deliveries", align: "right", hideBelow: "sm", render: (r) => <span className="tabular">{formatNumber(r.total_deliveries)}</span> },
            { key: "earned", header: "Earned", align: "right", hideBelow: "lg", render: (r) => <span className="tabular">{rupeesRounded(r.total_earnings)}</span> },
            { key: "gps", header: "Last GPS", hideBelow: "xl", render: (r) => <span className="whitespace-nowrap text-xs text-ink-3" title={r.last_location_at ? formatDateTime(r.last_location_at) : undefined}>{r.last_location_at ? timeAgo(r.last_location_at) : "Never"}</span> },
            { key: "joined", header: "Joined", hideBelow: "xl", render: (r) => <span className="whitespace-nowrap text-xs text-ink-3">{formatDate(r.created_at)}</span> },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (r) => <span className="inline-flex items-center gap-1"><RiderRowActions rider={r} cities={cities} selfId={selfId} /><RowLink href={viewHref(r.id)} label={`Quick view of ${r.user?.full_name ?? "rider"}`} scroll={false} /></span> },
          ]} />
      )}
      {!error ? <ListPagination page={page} pageSize={pageSize} total={total} /> : null}

      {validView ? (
        view ? (
          <QuickView title={vName} description={<span className="inline-flex flex-wrap items-center gap-2"><RiderStatusPill status={view.rider.status} />{view.rider.status === "active" && ops ? <RiderNowPill online={view.rider.is_online} now={vNow} /> : <OnlinePill online={view.rider.is_online} />}{view.rider.user && !view.rider.user.is_active ? <ActivePill active={false} inactiveLabel="Account deactivated" /> : null}</span>} fullHref={`/admin/riders/${view.rider.id}`}
            footer={<div className="space-y-2"><RiderStatusActions rider={view.rider} name={vName} /><Link href={`/admin/riders/${view.rider.id}`} className="inline-flex text-sm font-semibold text-brand-700 hover:underline sm:hidden">Open full page</Link></div>}>
            <div className="space-y-5">
              <section aria-labelledby="rv-now">
                <h3 id="rv-now" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><Radio className="h-4 w-4 text-ink-3" aria-hidden />Right now</h3>
                <DetailList items={[
                  { label: "Availability", value: view.rider.status !== "active" ? "Cannot go online until approved" : ops ? <RiderNowPill online={view.rider.is_online} now={vNow} /> : <OnlinePill online={view.rider.is_online} /> },
                  { label: "Current delivery", value: vNow ? <span className="inline-flex flex-wrap items-center justify-end gap-x-2"><Link href={`/admin/orders/${vNow.order_id}`} className="font-semibold text-brand-700 hover:underline">{vNow.order_number ?? "Open order"}</Link><span className="text-xs text-ink-3">{nowSince(vNow)}</span></span> : ops ? "None" : "Couldn't load" },
                  { label: "Last seen", value: vContact ? <span title={formatDateTime(vContact)}>{timeAgo(vContact)}</span> : "No contact from the app yet" },
                  { label: "Last GPS fix", value: view.rider.last_location_at ? <span title={formatDateTime(view.rider.last_location_at)}>{timeAgo(view.rider.last_location_at)}</span> : "Never reported" },
                ]} />
              </section>
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

/** When the rider took the step they are on, from the assignment's own timestamps. */
function nowSince(now: RiderCurrent) {
  if (now.status === "picked_up") return now.arrived_customer_at ? `arrived ${timeAgo(now.arrived_customer_at)}` : now.picked_up_at ? `picked up ${timeAgo(now.picked_up_at)}` : "";
  if (now.status === "accepted") return now.arrived_pickup_at ? `arrived ${timeAgo(now.arrived_pickup_at)}` : now.responded_at ? `accepted ${timeAgo(now.responded_at)}` : "";
  return `offer open until ${formatTime(now.expires_at)}`;
}

/**
 * One rider's availability for the list: what they are doing (with the order), then the last time the
 * app was heard from. `known` is false when the assignments could not be read; the row then shows only
 * the online switch, because "free" would be a guess.
 */
function RiderNow({ rider: r, now, known }: { rider: RiderRow; now: RiderCurrent | undefined; known: boolean }) {
  if (r.status !== "active") return <span className="text-xs text-ink-3">{r.status === "pending" ? "Cannot go online until approved" : "Cannot go online while suspended"}</span>;
  const contact = riderLastContact(r);
  return (
    <span className="flex min-w-0 flex-col items-start gap-1 @max-lg:items-end">
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 @max-lg:justify-end">
        {known ? <RiderNowPill online={r.is_online} now={now} /> : <OnlinePill online={r.is_online} />}
        {now ? <Link href={`/admin/orders/${now.order_id}`} className="text-xs font-semibold text-brand-700 hover:underline pointer-coarse:-my-2 pointer-coarse:py-2">{now.order_number ?? "Open order"}</Link> : null}
      </span>
      <span className="whitespace-nowrap text-xs text-ink-3" title={contact ? formatDateTime(contact) : undefined}>{contact ? `Last seen ${timeAgo(contact)}` : "No contact from the app yet"}</span>
    </span>
  );
}
