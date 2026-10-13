import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bike, Star } from "lucide-react";
import { getRiderDetail, getCities } from "@/lib/data/admin";
import { AdminPageHeader, Panel, DetailList, DataTable, CellStack, EmptyBlock, MetricCard, StatusText, rupees, rupeesRounded } from "@/components/admin/kit";
import { RiderStatusActions, RiderEditPanel } from "@/components/admin/rider-actions";
import { ResetPinButton } from "@/components/admin/reset-pin";
import { RiderStatusPill, OnlinePill, ActivePill, VEHICLE_LABEL } from "@/components/admin/ops/pills";
import { Avatar, StarRating } from "@/components/ui/misc";
import { formatDate, formatDateTime, formatNumber, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Rider" };

export default async function AdminRiderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, cities] = await Promise.all([getRiderDetail(id), getCities()]);
  if (!detail) notFound();
  const { rider: r, assignments, reviews } = detail;
  const name = r.user?.full_name ?? "Rider";
  const delivered = assignments.filter((a) => a.status === "delivered" && a.delivered_at);
  const avgMin = delivered.length ? Math.round(delivered.reduce((s, a) => s + (new Date(a.delivered_at!).getTime() - new Date(a.responded_at ?? a.offered_at).getTime()) / 60000, 0) / delivered.length) : null;
  const declined = assignments.filter((a) => a.status === "rejected" || a.status === "expired").length;
  const city = cities.find((c) => c.id === r.city_id);

  return (
    <>
      <AdminPageHeader back="/admin/riders" title={name} description={`Delivery partner since ${formatDate(r.created_at)}`}
        meta={<><RiderStatusPill status={r.status} /><OnlinePill online={r.is_online} />{r.user && !r.user.is_active ? <ActivePill active={false} inactiveLabel="Account deactivated" /> : null}</>}
        actions={<RiderStatusActions rider={r} name={name} />} />

      <section aria-label="Rider performance" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Deliveries" period="All time" value={formatNumber(r.total_deliveries)} icon={Bike} />
        <MetricCard label="Earnings" period="All time" value={rupeesRounded(r.total_earnings)} />
        <MetricCard label="Rating" period="All time" value={r.rating_count ? Number(r.rating_avg).toFixed(1) : "—"} icon={Star} hint={r.rating_count ? `${r.rating_count} ${r.rating_count === 1 ? "rating" : "ratings"}` : "No ratings yet"} />
        <MetricCard label="Average delivery time" period={assignments.length ? `Last ${assignments.length} ${assignments.length === 1 ? "offer" : "offers"}` : "Recent offers"} value={avgMin != null ? `${avgMin} min` : "—"} hint={avgMin != null ? `Accepted to delivered · ${declined} declined or expired` : "No completed deliveries in recent offers"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Panel title="Recent assignments" description="Last 20 delivery offers, newest first" flush>
            <DataTable caption="Recent assignments" rows={assignments} rowKey={(a) => a.id} maxHeight={null} className="rounded-none border-x-0 border-b-0 shadow-none"
              empty={<EmptyBlock icon={Bike} title="No delivery offers yet" description="Offers appear here once dispatch sends this rider an order." />}
              columns={[
                { key: "order", header: "Order", render: (a) => (a.order ? <CellStack primary={a.order.order_number} secondary={a.order.store?.name ?? undefined} href={`/admin/orders/${a.order.id}`} /> : <span className="text-ink-3">—</span>) },
                { key: "status", header: "Status", render: (a) => <StatusText value={a.status} /> },
                { key: "km", header: "Distance", align: "right", hideBelow: "md", render: (a) => <span className="tabular text-ink-2">{a.distance_km != null ? `${a.distance_km} km` : "—"}</span> },
                { key: "earning", header: "Earning", align: "right", render: (a) => <span className="tabular">{rupees(a.earning)}</span> },
                { key: "cod", header: "Cash collected", align: "right", hideBelow: "lg", render: (a) => <span className="tabular text-ink-3">{Number(a.cod_amount) ? rupees(a.cod_amount) : "—"}</span> },
                { key: "offered", header: "Offered", hideBelow: "sm", render: (a) => <span className="whitespace-nowrap text-xs text-ink-3" title={formatDateTime(a.offered_at)}>{timeAgo(a.offered_at)}</span> },
              ]} />
          </Panel>

          <Panel title="Delivery reviews" description="Latest 10 ratings from customers" flush>
            {reviews.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {reviews.map((rv) => (
                  <li key={rv.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm sm:px-5">
                    <StarRating value={rv.rating} />
                    <span className="min-w-0 flex-1 text-ink-2">{rv.comment || <span className="text-ink-4">No comment</span>}</span>
                    <StatusText value={rv.status} />
                    <span className="text-xs text-ink-4">{formatDate(rv.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyBlock icon={Star} title="No reviews yet" description="Customers can rate the delivery after an order is delivered." />}
          </Panel>
        </div>

        <aside className="min-w-0 space-y-4">
          <Panel title="Profile" actions={<RiderEditPanel rider={r} cities={cities} name={name} />}>
            <div className="mb-3 flex items-center gap-3"><Avatar name={r.user?.full_name} src={r.user?.avatar_url} size={48} /><div className="min-w-0"><p className="truncate font-medium text-ink">{name}</p><Link href={`/admin/users/${r.user_id}`} className="text-xs font-semibold text-brand-700 hover:underline">Open user account</Link></div></div>
            <DetailList items={[
              { label: "Phone", value: r.user?.phone ? <a href={`tel:${r.user.phone}`} className="hover:underline">{r.user.phone}</a> : "—" },
              { label: "Email", value: <span className="break-all">{r.user?.email ?? "—"}</span> },
              { label: "Vehicle", value: `${VEHICLE_LABEL[r.vehicle_type] ?? r.vehicle_type}${r.vehicle_number ? ` · ${r.vehicle_number}` : ""}` },
              { label: "Licence", value: r.license_number ?? "—" },
              { label: "Aadhaar", value: r.aadhaar_last4 ? `XXXX ${r.aadhaar_last4}` : "—" },
              { label: "Emergency contact", value: r.emergency_contact ?? "—" },
              { label: "City", value: city?.name ?? "Any" },
            ]} />
            <div className="mt-4 border-t border-line pt-3"><ResetPinButton userId={r.user_id} name={name} /></div>
          </Panel>
          <Panel title="Location">
            <DetailList items={[
              { label: "Availability", value: <OnlinePill online={r.is_online} /> },
              { label: "Last GPS fix", value: r.last_location_at ? <span title={formatDateTime(r.last_location_at)}>{timeAgo(r.last_location_at)}</span> : "Never reported" },
              { label: "Coordinates", value: r.current_lat != null && r.current_lng != null ? <a href={`https://www.google.com/maps?q=${r.current_lat},${r.current_lng}`} target="_blank" rel="noreferrer" className="tabular hover:underline">{r.current_lat.toFixed(4)}, {r.current_lng.toFixed(4)}</a> : "—" },
            ]} />
          </Panel>
        </aside>
      </div>
    </>
  );
}
