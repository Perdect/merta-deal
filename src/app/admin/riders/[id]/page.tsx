import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRiderDetail, getCities } from "@/lib/data/admin";
import { RiderStatusButtons, RiderEditForm } from "@/components/admin/rider-actions";
import { ASSIGNMENT_TONE, RIDER_STATUS_TONE } from "@/components/admin/constants";
import { PageHeader, Avatar, KeyValue, Table, StarRating } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Stat, Card, CardHeader, CardBody } from "@/components/ui/card";
import { formatINR, formatNumber, formatDateTime, formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Rider" };

export default async function AdminRiderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, cities] = await Promise.all([getRiderDetail(id), getCities()]);
  if (!detail) notFound();
  const { rider: r, assignments, reviews } = detail;
  const delivered = assignments.filter((a) => a.status === "delivered");
  const avgMin = delivered.length ? Math.round(delivered.reduce((s, a) => s + (a.delivered_at && (a.responded_at ?? a.offered_at) ? (new Date(a.delivered_at).getTime() - new Date(a.responded_at ?? a.offered_at).getTime()) / 60000 : 0), 0) / delivered.length) : null;
  const declined = assignments.filter((a) => a.status === "rejected" || a.status === "expired").length;
  return (
    <div className="space-y-4">
      <PageHeader back="/admin/riders" title={r.user?.full_name ?? "Rider"} subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={RIDER_STATUS_TONE[r.status]}>{r.status}</Badge>{r.is_online ? <Badge tone="success">Online</Badge> : <Badge tone="neutral">Offline</Badge>}<span className="text-ink-3">Joined {formatDate(r.created_at)}</span>{!r.user?.is_active ? <Badge tone="danger">Account deactivated</Badge> : null}</span>} className="px-0" action={<RiderStatusButtons rider={r} />} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Deliveries" value={formatNumber(r.total_deliveries)} hint={declined ? `${declined} declined/expired recently` : undefined} />
        <Stat label="Earnings" value={formatINR(r.total_earnings)} tone="brand" />
        <Stat label="Rating" value={<StarRating value={r.rating_avg} count={r.rating_count} size={18} />} />
        <Stat label="Avg time (recent)" value={avgMin != null ? `${avgMin} min` : "—"} hint="Accept → delivered, last 20" />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Profile" />
            <CardBody className="flex gap-4">
              <Avatar name={r.user?.full_name} src={r.user?.avatar_url} size={64} />
              <KeyValue className="flex-1" items={[
                { label: "Phone", value: r.user?.phone ?? "—" }, { label: "Email", value: r.user?.email ?? "—" },
                { label: "Vehicle", value: `${r.vehicle_type}${r.vehicle_number ? ` · ${r.vehicle_number}` : ""}` }, { label: "Licence", value: r.license_number ?? "—" }, { label: "Aadhaar", value: r.aadhaar_last4 ? `XXXX ${r.aadhaar_last4}` : "—" },
                { label: "Emergency contact", value: r.emergency_contact ?? "—" }, { label: "City", value: cities.find((c) => c.id === r.city_id)?.name ?? "Any" },
                { label: "Last GPS", value: r.last_location_at ? `${timeAgo(r.last_location_at)} (${r.current_lat?.toFixed(4)}, ${r.current_lng?.toFixed(4)})` : "never" },
                { label: "Account", value: <Link href={`/admin/users/${r.user_id}`} className="font-semibold text-brand-700">Open user</Link> },
              ]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Recent assignments" subtitle="Last 20 offers" />
            <CardBody className="px-0 sm:px-0">
              <Table className="rounded-none border-x-0 border-b-0" rows={assignments as unknown as Record<string, unknown>[]} empty="No assignments yet." columns={[
                { key: "order", header: "Order", render: (row) => { const o = row.order as { id: string; order_number: string; store: { name: string } | null } | null; return o ? <Link href={`/admin/orders/${o.id}`} className="font-semibold text-brand-700">{o.order_number}<span className="block text-xs font-normal text-ink-3">{o.store?.name}</span></Link> : "—"; } },
                { key: "status", header: "Status", render: (row) => <Badge tone={ASSIGNMENT_TONE[row.status as string]}>{String(row.status).replace("_", " ")}</Badge> },
                { key: "distance_km", header: "Km", className: "text-right", render: (row) => <span className="tabular">{(row.distance_km as number | null) ?? "—"}</span> },
                { key: "earning", header: "Earning", className: "text-right", render: (row) => <span className="tabular">{formatINR(row.earning as number)}</span> },
                { key: "cod_amount", header: "COD", className: "text-right", render: (row) => <span className="tabular text-ink-3">{Number(row.cod_amount) ? formatINR(row.cod_amount as number) : "—"}</span> },
                { key: "offered_at", header: "Offered", render: (row) => <span className="text-xs text-ink-3">{formatDateTime(row.offered_at as string)}</span> },
              ]} />
            </CardBody>
          </Card>
          {reviews.length ? <Card><CardHeader title="Delivery reviews" /><CardBody><ul className="divide-y divide-line">{reviews.map((rv) => <li key={rv.id} className="py-2 text-sm"><StarRating value={rv.rating} /> <span className="text-ink-2">{rv.comment ?? ""}</span> <span className="text-xs text-ink-4">{formatDate(rv.created_at)} · {rv.status}</span></li>)}</ul></CardBody></Card> : null}
        </div>
        <aside>
          <Card><CardHeader title="Edit details" /><CardBody><RiderEditForm rider={r} cities={cities} /></CardBody></Card>
        </aside>
      </div>
    </div>
  );
}
