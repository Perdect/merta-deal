import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Mail, MapPin, Phone, Printer, ShoppingBag, Users } from "lucide-react";
import { getStoreDetail, getDocumentSignedUrl, getSettings } from "@/lib/data/admin";
import { lastIstDays } from "@/lib/data/admin-ops";
import { AdminPageHeader, Panel, DetailList, DataTable, CellStack, EmptyBlock, MetricCard, TrendChart, OrderStatusPill, StatusPill, rupees, rupeesRounded } from "@/components/admin/kit";
import { StoreStatusPill } from "@/components/admin/ops/pills";
import { StoreStatusActions, StoreQuickToggles, StoreCommission, StoreDocuments, StoreSettingsForm } from "@/components/admin/store-actions";
import { dayLabel } from "@/components/admin/bar-chart";
import { QrPoster } from "@/components/shared/qr-poster";
import { RawImg } from "@/components/admin/raw-img";
import { Avatar, StarRating } from "@/components/ui/misc";
import { formatDate, formatDateTime, formatNumber, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Store" };

export default async function AdminStorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, settings] = await Promise.all([getStoreDetail(id), getSettings("business")]);
  if (!detail) notFound();
  const { store: s, stats, documents, commissions, zones, owner, staff, recentOrders } = detail;
  const defaultSetting = settings.find((x) => x.key === "commission_default_percent")?.value;
  const defaultCommission = defaultSetting != null && Number.isFinite(Number(defaultSetting)) ? Number(defaultSetting) : null;
  const urls = Object.fromEntries(await Promise.all(documents.map(async (d) => [d.id, await getDocumentSignedUrl(d.file_path)] as const)));
  const zone = zones.find((z) => z.id === s.zone_id);
  const pendingDocs = documents.filter((d) => d.status === "pending").length;
  const weekly = new Map((stats?.weekly ?? []).map((d) => [d.day, d]));
  const trend = lastIstDays(7).map((day) => ({ label: dayLabel(day), orders: Number(weekly.get(day)?.orders ?? 0), sales: Number(weekly.get(day)?.gmv ?? 0) }));

  return (
    <>
      <AdminPageHeader back="/admin/stores" title={s.name}
        description={`${s.area} · /s/${s.slug} · joined ${formatDate(s.created_at)}`}
        meta={<><StoreStatusPill status={s.status} />{s.status === "active" ? <StatusPill tone={s.is_open ? "green" : "neutral"}>{s.is_open ? "Open for orders" : "Paused"}</StatusPill> : null}{s.is_featured ? <StatusPill tone="violet">Featured</StatusPill> : null}{pendingDocs ? <StatusPill tone="amber">{pendingDocs} {pendingDocs === 1 ? "document" : "documents"} to review</StatusPill> : null}</>}
        actions={s.status === "active" ? <Link href={`/s/${s.slug}`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-2 bg-card px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2"><ExternalLink className="h-4 w-4" aria-hidden />View on site</Link> : null} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel title="Overview & status" description="Only the status changes allowed from the current status are shown. Each change notifies the owner.">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex shrink-0 items-start gap-3 sm:flex-col">
                <Avatar name={s.name} src={s.logo_url} size={72} className="rounded-xl" />
                {s.cover_url ? <RawImg src={s.cover_url} alt={`${s.name} cover`} className="h-16 w-28 rounded-lg object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                {s.tagline ? <p className="font-medium text-ink">{s.tagline}</p> : null}
                {s.description ? <p className="text-sm text-ink-2">{s.description}</p> : null}
                <DetailList items={[
                  { label: "Status", value: <StoreStatusPill status={s.status} /> },
                  { label: "Rating", value: <StarRating value={s.rating_avg} count={s.rating_count} /> },
                  { label: "Hours", value: `${s.opening_time.slice(0, 5)}–${s.closing_time.slice(0, 5)} · prep ${s.avg_prep_minutes} min` },
                  { label: "Delivery", value: `${s.delivery_radius_km} km radius · ${zone ? `${zone.name} zone` : "no zone"}` },
                ]} />
                <StoreStatusActions store={s} pendingDocs={pendingDocs} />
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-line px-4 py-3"><StoreQuickToggles store={s} /></div>
          </Panel>

          <Panel title="Performance" description="From admin store stats. Sales exclude cancelled and rejected orders.">
            {stats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <MetricCard label="Orders" period="All time" value={formatNumber(stats.orders)} hint={`${stats.delivered} delivered · ${stats.cancelled} cancelled · ${stats.active} active`} />
                  <MetricCard label="Sales" period="All time" value={rupeesRounded(stats.gmv)} />
                  <MetricCard label="Store revenue" period="Delivered orders" value={rupeesRounded(stats.store_revenue)} hint={`Commission earned ${rupeesRounded(stats.commission)}`} />
                  <MetricCard label="Catalogue" period="Active listings" value={formatNumber(stats.products)} hint={`${stats.out_of_stock} out of stock · payouts due ${rupeesRounded(stats.payouts_pending)}`} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-ink-3">Last 7 days (IST)</p>
                  <TrendChart points={trend} height={180} />
                </div>
              </div>
            ) : (
              <div role="alert" className="flex flex-col items-center py-6 text-center">
                <p className="text-sm font-semibold text-ink">Couldn&apos;t load performance figures</p>
                <p className="mt-1 text-sm text-ink-3">The stats query failed. The rest of the page is up to date.</p>
                <a href={`/admin/stores/${s.id}`} className="mt-3 inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">Retry</a>
              </div>
            )}
          </Panel>

          <Panel title="Documents" description={pendingDocs ? `${pendingDocs} awaiting review` : "KYC documents uploaded by the store"} flush>
            <StoreDocuments docs={documents} urls={urls} />
          </Panel>

          <Panel title="Recent orders" description="Latest 8 orders" flush actions={<Link href={`/admin/orders?store=${s.id}`} className="text-sm font-semibold text-brand-700 hover:underline">All orders</Link>}>
            <DataTable caption="Recent orders" rows={recentOrders} rowKey={(o) => o.id} maxHeight={null} className="rounded-none border-x-0 border-b-0 shadow-none"
              empty={<EmptyBlock icon={ShoppingBag} title="No orders yet" description="Orders appear here once customers start ordering from this store." />}
              columns={[
                { key: "order", header: "Order", render: (o) => <CellStack primary={o.order_number} href={`/admin/orders/${o.id}`} /> },
                { key: "status", header: "Status", render: (o) => <OrderStatusPill status={o.status} /> },
                { key: "total", header: "Total", align: "right", render: (o) => <span className="font-semibold tabular">{rupees(o.total)}</span> },
                { key: "placed", header: "Placed", hideBelow: "sm", render: (o) => <span className="whitespace-nowrap text-xs text-ink-3" title={formatDateTime(o.created_at)}>{timeAgo(o.created_at)}</span> },
              ]} />
          </Panel>

          <Panel title="Staff" description="People with access to this store's portal" flush>
            {staff.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {staff.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <Avatar name={m.user?.full_name} size={30} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{m.user?.full_name ?? "Unnamed"}</span><span className="block text-xs text-ink-3">{m.user?.phone ?? "No phone"}</span></span>
                    <span className="text-xs capitalize text-ink-2">{m.role.replace(/_/g, " ")}</span>
                    <StatusPill tone={m.is_active ? "green" : "neutral"}>{m.is_active ? "Active" : "Inactive"}</StatusPill>
                  </li>
                ))}
              </ul>
            ) : <EmptyBlock icon={Users} title="No staff added" description="The owner can add staff from the store portal. The owner always has access." />}
          </Panel>

          {s.photos.length ? (
            <Panel title="Photos">
              <div className="flex flex-wrap gap-2">{s.photos.map((p, i) => <a key={p} href={p} target="_blank" rel="noreferrer" aria-label={`Open photo ${i + 1}`}><RawImg src={p} alt="" className="h-24 w-24 rounded-lg object-cover" /></a>)}</div>
            </Panel>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4">
          <Panel title="Contact & address">
            <DetailList items={[
              { label: "Owner", value: owner ? <Link href={`/admin/users/${owner.id}`} className="text-brand-700 hover:underline">{s.owner_name}</Link> : s.owner_name },
              { label: "Phone", value: <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3 w-3" aria-hidden />{s.phone}</a> },
              { label: "Email", value: s.email ? <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 break-all hover:underline"><Mail className="h-3 w-3 shrink-0" aria-hidden />{s.email}</a> : "—" },
              { label: "Address", value: <span className="inline-flex items-start gap-1"><MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{[s.address_line1, s.address_line2, s.landmark, s.area, s.pincode].filter(Boolean).join(", ")}</span> },
              { label: "Coordinates", value: <a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer" className="tabular hover:underline">{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</a> },
              { label: "Zone", value: zone ? `${zone.name} (${zone.area})` : "—" },
            ]} />
          </Panel>

          <Panel title="Commission" description="Platform share of each order's item value">
            <StoreCommission storeId={s.id} storeName={s.name} rate={s.commission_rate} defaultCommission={defaultCommission} history={commissions} />
          </Panel>

          <Panel title="Tax & payout details" description="Provided by the store for payouts">
            <DetailList items={[
              { label: "GSTIN", value: s.gstin ?? "—" },
              { label: "PAN", value: s.pan ?? "—" },
              { label: "Bank account", value: s.bank_account_number ? `${s.bank_account_name ?? ""} · ${s.bank_account_number}` : "Not provided" },
              { label: "IFSC", value: s.bank_ifsc ?? "—" },
              { label: "UPI", value: s.upi_id ?? "—" },
            ]} />
          </Panel>

          <Panel title="Scan-to-order poster" actions={<a href={`/api/qr?path=${encodeURIComponent(`/qr/${s.id}`)}&format=png&size=1024`} download={`merta-deal-${s.slug}.png`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Printer className="h-3.5 w-3.5" aria-hidden />Download PNG</a>}>
            <div className="overflow-x-auto"><QrPoster path={`/qr/${s.id}`} title={s.name} subtitle={s.area} code={s.slug} /></div>
          </Panel>
        </aside>
      </div>

      <StoreSettingsForm key={`${s.delivery_radius_km}|${s.zone_id}|${s.avg_prep_minutes}|${s.min_order_amount}`} store={s} zones={zones} />
    </>
  );
}
