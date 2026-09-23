import type { Metadata } from "next";
import Link from "next/link";
import { Bike } from "lucide-react";
import { listRiders, getLiveRiders, spGet, spPage, type SP } from "@/lib/data/admin";
import { ListToolbar, ListPagination } from "@/components/admin/list-controls";
import { RidersLiveBoard } from "@/components/admin/riders-map";
import { RiderStatusButtons } from "@/components/admin/rider-actions";
import { RIDER_STATUS_OPTIONS, RIDER_STATUS_TONE } from "@/components/admin/constants";
import { PageHeader, Avatar, Table, StarRating } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { SectionHeader } from "@/components/ui/card";
import { formatINR, formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Riders" };

export default async function AdminRidersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [{ items, total, page, pageSize }, live] = await Promise.all([
    listRiders({ q: spGet(sp, "q"), status: spGet(sp, "status"), online: spGet(sp, "online"), page: spPage(sp) }),
    getLiveRiders(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Riders" subtitle={`${total} delivery partners`} className="px-0" />
      <section>
        <SectionHeader title="Live riders" subtitle="Online, active partners with their last GPS fix" className="px-0" />
        <RidersLiveBoard initial={live} />
      </section>
      <section className="space-y-4">
        <SectionHeader title="All riders" className="px-0" />
        <ListToolbar searchPlaceholder="Vehicle or licence number" filters={[{ key: "status", label: "Statuses", options: RIDER_STATUS_OPTIONS }, { key: "online", label: "Online", placeholder: "Online + offline", options: [{ value: "1", label: "Online" }, { value: "0", label: "Offline" }] }]} />
        {items.length === 0 ? <EmptyState icon={<Bike className="h-7 w-7" />} title="No riders match" description="Riders register from the customer site with role “rider”; new ones appear here as pending." /> : (
          <Table rows={items as unknown as Record<string, unknown>[]} columns={[
            { key: "user", header: "Rider", render: (r) => { const d = r as unknown as (typeof items)[number]; return <Link href={`/admin/riders/${d.id}`} className="flex items-center gap-3"><Avatar name={d.user?.full_name} src={d.user?.avatar_url} size={34} /><span className="min-w-0"><span className="block truncate font-semibold text-ink">{d.user?.full_name ?? "—"}</span><span className="block truncate text-xs text-ink-3">{d.user?.phone ?? ""} · {d.vehicle_type}{d.vehicle_number ? ` ${d.vehicle_number}` : ""}</span></span></Link>; } },
            { key: "status", header: "Status", render: (r) => <span className="inline-flex items-center gap-1.5"><Badge tone={RIDER_STATUS_TONE[r.status as string]}>{String(r.status)}</Badge>{r.is_online ? <span className="text-[10px] font-bold text-success">ONLINE</span> : null}</span> },
            { key: "rating_avg", header: "Rating", render: (r) => <StarRating value={r.rating_avg as number} count={r.rating_count as number} /> },
            { key: "total_deliveries", header: "Deliveries", className: "text-right", render: (r) => <span className="tabular">{r.total_deliveries as number}</span> },
            { key: "total_earnings", header: "Earned", className: "text-right", render: (r) => <span className="tabular">{formatINR(r.total_earnings as number)}</span> },
            { key: "last_location_at", header: "Last GPS", render: (r) => <span className="text-xs text-ink-3">{r.last_location_at ? timeAgo(r.last_location_at as string) : "—"}</span> },
            { key: "created_at", header: "Joined", render: (r) => <span className="text-xs text-ink-3">{formatDate(r.created_at as string)}</span> },
            { key: "actions", header: "", render: (r) => <RiderStatusButtons rider={{ id: r.id as string, status: r.status as never }} size="xs" /> },
          ]} />
        )}
        <ListPagination page={page} pageSize={pageSize} total={total} />
      </section>
    </div>
  );
}
