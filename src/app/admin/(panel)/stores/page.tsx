import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, Store as StoreIcon } from "lucide-react";
import { getStoreDetail, getZones, spGet, spPage, type SP } from "@/lib/data/admin";
import { listStoresOps, countStoresByStatus, listHref, type StoreFilters } from "@/lib/data/admin-ops";
import { AdminPageHeader, DataTable, CellStack, RowLink, EmptyBlock, ErrorBlock, ListToolbar, StatusTabs, ListPagination, QuickView, DetailList, StatusPill, rupeesRounded } from "@/components/admin/kit";
import { StoreStatusPill } from "@/components/admin/ops/pills";
import { StoreStatusActions } from "@/components/admin/store-actions";
import { Avatar, StarRating } from "@/components/ui/misc";
import { formatDate, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Stores" };

const TABS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending review" },
  { value: "suspended", label: "Suspended" },
  { value: "closed", label: "Closed" },
];

export default async function AdminStoresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters: StoreFilters = { q: spGet(sp, "q"), status: spGet(sp, "status"), open: spGet(sp, "open"), featured: spGet(sp, "featured"), zone: spGet(sp, "zone") };
  const viewId = spGet(sp, "view");
  const validView = /^[0-9a-f-]{36}$/.test(viewId);
  const [list, counts, zones, view] = await Promise.all([
    listStoresOps({ ...filters, page: spPage(sp) }),
    countStoresByStatus(filters),
    getZones(),
    validView ? getStoreDetail(viewId) : Promise.resolve(null),
  ]);
  const { items, total, page, pageSize, error } = list;
  const here = listHref("/admin/stores", sp);
  const viewHref = (id: string) => listHref("/admin/stores", sp, { view: id });
  const filtered = Boolean(filters.q || filters.open || filters.featured || filters.zone);
  const zoneName = (id: string | null) => (id ? zones.find((z) => z.id === id)?.name ?? "—" : "No zone");

  return (
    <>
      <AdminPageHeader title="Stores" description="Approve new stores, manage their status and commission, and check how each one is doing. Use View for a quick look." />

      <StatusTabs items={TABS.map((t) => ({ ...t, count: counts[t.value] ?? null }))} />

      <ListToolbar searchPlaceholder="Store, owner, area, phone or slug" filters={[
        { key: "open", label: "Accepting orders", options: [{ value: "1", label: "Open for orders" }, { value: "0", label: "Paused" }] },
        { key: "featured", label: "Featured", options: [{ value: "1", label: "Featured" }, { value: "0", label: "Not featured" }] },
        ...(zones.length ? [{ key: "zone", label: "Delivery zone", options: [...zones.map((z) => ({ value: z.id, label: `${z.name} — ${z.area}` })), { value: "none", label: "No zone" }] }] : []),
      ]} />

      {error ? (
        <ErrorBlock title="Couldn't load stores" description="The store list didn't load. Check your connection, then retry." retryHref={here} />
      ) : (
        <DataTable caption="Stores" rows={items} rowKey={(s) => s.id} selectedKey={validView ? viewId : null}
          empty={filtered || filters.status
            ? <EmptyBlock icon={SearchX} title="No stores match" description="Try another tab, remove a filter chip, or search by owner name or phone." />
            : <EmptyBlock icon={StoreIcon} title="No stores yet" description="Shop owners register from the customer site (Sell on Merta Deal). New applications appear here under Pending review." />}
          columns={[
            { key: "store", header: "Store", render: (s) => (
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={s.name} src={s.logo_url} size={34} className="shrink-0 rounded-lg" />
                <CellStack primary={s.name} secondary={`${s.area} · ${s.owner_name}`} href={viewHref(s.id)} scroll={false} />
              </span>
            ) },
            { key: "status", header: "Status", render: (s) => (
              <span className="flex flex-col items-start gap-1">
                <StoreStatusPill status={s.status} />
                {s.status === "active" ? <span className="text-xs text-ink-3">{s.is_open ? "Open for orders" : "Paused"}</span> : null}
              </span>
            ) },
            { key: "phone", header: "Phone", hideBelow: "lg", render: (s) => <a href={`tel:${s.phone}`} className="tabular text-ink-2 hover:underline">{s.phone}</a> },
            { key: "zone", header: "Zone", hideBelow: "xl", render: (s) => <span className="text-ink-2">{zoneName(s.zone_id)}</span> },
            { key: "rating", header: "Rating", hideBelow: "lg", render: (s) => <StarRating value={s.rating_avg} count={s.rating_count} /> },
            { key: "orders", header: "Orders", align: "right", hideBelow: "sm", render: (s) => <span className="tabular">{formatNumber(s.total_orders)}</span> },
            { key: "commission", header: "Commission", align: "right", hideBelow: "md", render: (s) => (s.commission_rate != null ? <span className="tabular">{s.commission_rate}%</span> : <span className="text-xs text-ink-3">Default</span>) },
            { key: "featured", header: "Featured", hideBelow: "xl", render: (s) => (s.is_featured ? <StatusPill tone="violet">Featured</StatusPill> : <span className="text-xs text-ink-4">—</span>) },
            { key: "joined", header: "Joined", hideBelow: "xl", render: (s) => <span className="whitespace-nowrap text-xs text-ink-3">{formatDate(s.created_at)}</span> },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (s) => <RowLink href={viewHref(s.id)} label={`Quick view of ${s.name}`} scroll={false} /> },
          ]} />
      )}
      {!error ? <ListPagination page={page} pageSize={pageSize} total={total} /> : null}

      {validView ? (
        view ? (
          <QuickView title={view.store.name} description={<span className="inline-flex flex-wrap items-center gap-2"><StoreStatusPill status={view.store.status} />{view.store.area}</span>} fullHref={`/admin/stores/${view.store.id}`}
            footer={<div className="space-y-2"><StoreStatusActions store={view.store} pendingDocs={view.documents.filter((d) => d.status === "pending").length} /><Link href={`/admin/stores/${view.store.id}`} className="inline-flex text-sm font-semibold text-brand-700 hover:underline sm:hidden">Open full page</Link></div>}>
            <div className="space-y-5">
              {view.stats ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Orders (all time)", value: formatNumber(view.stats.orders) },
                    { label: "Active now", value: formatNumber(view.stats.active) },
                    { label: "Sales (all time)", value: rupeesRounded(view.stats.gmv) },
                    { label: "Docs to review", value: formatNumber(view.stats.pending_documents) },
                  ].map((m) => <div key={m.label} className="rounded-lg border border-line px-3 py-2"><p className="text-[11px] text-ink-3">{m.label}</p><p className="font-semibold tabular text-ink">{m.value}</p></div>)}
                </div>
              ) : <p className="text-xs text-ink-3">Performance figures couldn&apos;t be loaded. Open the full page to retry.</p>}
              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">Contact & address</h3>
                <DetailList items={[
                  { label: "Owner", value: view.owner ? <Link href={`/admin/users/${view.owner.id}`} className="text-brand-700 hover:underline">{view.store.owner_name}</Link> : view.store.owner_name },
                  { label: "Phone", value: <a href={`tel:${view.store.phone}`} className="hover:underline">{view.store.phone}</a> },
                  { label: "Email", value: view.store.email ?? "—" },
                  { label: "Address", value: [view.store.address_line1, view.store.address_line2, view.store.landmark, view.store.area, view.store.pincode].filter(Boolean).join(", ") },
                  { label: "Zone", value: zoneName(view.store.zone_id) },
                ]} />
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">Operations</h3>
                <DetailList items={[
                  { label: "Accepting orders", value: view.store.is_open ? "Open" : "Paused" },
                  { label: "Hours", value: `${view.store.opening_time.slice(0, 5)}–${view.store.closing_time.slice(0, 5)} · prep ${view.store.avg_prep_minutes} min` },
                  { label: "Delivery radius", value: `${view.store.delivery_radius_km} km` },
                  { label: "Commission", value: view.store.commission_rate != null ? `${view.store.commission_rate}% (custom)` : "Platform default" },
                  { label: "Rating", value: <StarRating value={view.store.rating_avg} count={view.store.rating_count} /> },
                  { label: "Joined", value: formatDate(view.store.created_at) },
                ]} />
              </section>
            </div>
          </QuickView>
        ) : (
          <QuickView title="Store not found"><EmptyBlock title="This store could not be loaded" description="It may have been removed, or the link is out of date." /></QuickView>
        )
      ) : null}
    </>
  );
}
