import type { Metadata } from "next";
import Link from "next/link";
import { Store as StoreIcon } from "lucide-react";
import { listStores, spGet, spPage, type SP } from "@/lib/data/admin";
import { ListToolbar, ListPagination } from "@/components/admin/list-controls";
import { STORE_STATUS_OPTIONS, STORE_STATUS_TONE } from "@/components/admin/constants";
import { PageHeader, Avatar, Table, StarRating } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Stores" };

export default async function AdminStoresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { items, total, page, pageSize } = await listStores({ q: spGet(sp, "q"), status: spGet(sp, "status"), page: spPage(sp) });
  return (
    <div className="space-y-4">
      <PageHeader title="Stores" subtitle={`${total} stores`} className="px-0" />
      <ListToolbar searchPlaceholder="Store, owner, area or phone" filters={[{ key: "status", label: "Statuses", options: STORE_STATUS_OPTIONS }]} />
      {items.length === 0 ? <EmptyState icon={<StoreIcon className="h-7 w-7" />} title="No stores match" description="Stores register from the customer site; new ones appear here as pending." /> : (
        <Table rows={items as unknown as Record<string, unknown>[]} columns={[
          { key: "name", header: "Store", render: (r) => { const s = r as unknown as (typeof items)[number]; return <Link href={`/admin/stores/${s.id}`} className="flex items-center gap-3"><Avatar name={s.name} src={s.logo_url} size={34} className="rounded-md" /><span className="min-w-0"><span className="block truncate font-semibold text-ink">{s.name}{s.is_featured ? <span className="ml-1.5 text-[10px] font-bold uppercase text-saffron-700">featured</span> : null}</span><span className="block truncate text-xs text-ink-3">{s.area} · {s.owner_name}</span></span></Link>; } },
          { key: "phone", header: "Phone", render: (r) => <span className="tabular">{String(r.phone)}</span> },
          { key: "status", header: "Status", render: (r) => <span className="inline-flex items-center gap-1.5"><Badge tone={STORE_STATUS_TONE[r.status as string]}>{String(r.status)}</Badge>{r.status === "active" ? <span className={`text-[10px] font-semibold ${r.is_open ? "text-success" : "text-ink-4"}`}>{r.is_open ? "OPEN" : "CLOSED"}</span> : null}</span> },
          { key: "rating_avg", header: "Rating", render: (r) => <StarRating value={r.rating_avg as number} count={r.rating_count as number} /> },
          { key: "total_orders", header: "Orders", className: "text-right", render: (r) => <span className="tabular">{r.total_orders as number}</span> },
          { key: "commission_rate", header: "Commission", className: "text-right", render: (r) => <span className="tabular">{r.commission_rate != null ? `${r.commission_rate}%` : <span className="text-ink-3">default</span>}</span> },
          { key: "created_at", header: "Joined", render: (r) => <span className="text-xs text-ink-3">{formatDate(r.created_at as string)}</span> },
        ]} />
      )}
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
