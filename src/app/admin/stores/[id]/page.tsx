import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Mail, MapPin, Printer } from "lucide-react";
import { getStoreDetail, getDocumentSignedUrl, getSettings } from "@/lib/data/admin";
import { StoreAdminPanel, StoreDocuments, CommissionHistory } from "@/components/admin/store-actions";
import { STORE_STATUS_TONE } from "@/components/admin/constants";
import { BarChart, dayLabel } from "@/components/admin/bar-chart";
import { QrPoster } from "@/components/shared/qr-poster";
import { RawImg } from "@/components/admin/raw-img";
import { PageHeader, Avatar, KeyValue, Table } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Stat, Card, CardHeader, CardBody } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/shop/order-status";
import { formatINR, formatNumber, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Store" };

export default async function AdminStorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, settings] = await Promise.all([getStoreDetail(id), getSettings("business")]);
  if (!detail) notFound();
  const { store: s, stats, documents, commissions, zones, owner, staff, recentOrders } = detail;
  const defaultCommission = Number(settings.find((x) => x.key === "commission_default_percent")?.value ?? 10);
  const urls = Object.fromEntries(await Promise.all(documents.map(async (d) => [d.id, await getDocumentSignedUrl(d.file_path)] as const)));
  const zone = zones.find((z) => z.id === s.zone_id);

  return (
    <div className="space-y-4">
      <PageHeader back="/admin/stores" title={s.name} subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={STORE_STATUS_TONE[s.status]}>{s.status}</Badge>{s.is_featured ? <Badge tone="saffron">Featured</Badge> : null}<span className="text-ink-3">{s.area} · /s/{s.slug}</span><Link href={`/s/${s.slug}`} className="text-brand-700 hover:underline">View on site</Link></span>} className="px-0" />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Orders" value={formatNumber(stats?.orders ?? 0)} hint={stats ? `${stats.active} active · ${stats.cancelled} cancelled` : undefined} />
        <Stat label="GMV" value={formatINR(stats?.gmv ?? 0)} tone="brand" />
        <Stat label="Store revenue" value={formatINR(stats?.store_revenue ?? 0)} hint={`Commission earned ${formatINR(stats?.commission ?? 0)}`} tone="saffron" />
        <Stat label="Catalogue" value={formatNumber(stats?.products ?? 0)} hint={`${stats?.out_of_stock ?? 0} out of stock · ${formatINR(stats?.payouts_pending ?? 0)} payout due`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Store profile" />
            <CardBody className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <div className="flex flex-col items-center gap-2"><Avatar name={s.name} src={s.logo_url} size={80} className="rounded-lg" />{s.cover_url ? <RawImg src={s.cover_url} className="h-16 w-28 rounded-md object-cover" /> : null}</div>
              <div className="space-y-3 text-sm">
                {s.tagline ? <p className="font-medium text-ink">{s.tagline}</p> : null}
                {s.description ? <p className="text-ink-2">{s.description}</p> : null}
                <KeyValue items={[
                  { label: "Owner", value: <span>{s.owner_name}{owner ? <Link href={`/admin/users/${owner.id}`} className="ml-1.5 text-xs font-semibold text-brand-700">account</Link> : null}</span> },
                  { label: "Phone", value: <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</a> },
                  { label: "Email", value: s.email ? <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</a> : "—" },
                  { label: "Address", value: <span className="inline-flex items-start gap-1 text-right"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{[s.address_line1, s.address_line2, s.landmark, s.area, s.pincode].filter(Boolean).join(", ")}</span> },
                  { label: "Coordinates", value: <span className="tabular">{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</span> },
                  { label: "Zone", value: zone ? `${zone.name} (${zone.area})` : "—" },
                  { label: "Hours", value: `${s.opening_time.slice(0, 5)} – ${s.closing_time.slice(0, 5)} · prep ${s.avg_prep_minutes} min` },
                  { label: "GSTIN / PAN", value: `${s.gstin ?? "—"} / ${s.pan ?? "—"}` },
                  { label: "Bank", value: s.bank_account_number ? `${s.bank_account_name ?? ""} · ${s.bank_account_number} · ${s.bank_ifsc ?? ""}` : s.upi_id ? `UPI ${s.upi_id}` : "Not provided" },
                  { label: "UPI", value: s.upi_id ?? "—" },
                  { label: "Rating", value: `${Number(s.rating_avg).toFixed(1)} (${s.rating_count})` },
                ]} />
                {staff.length ? <p className="text-xs text-ink-3">Staff: {staff.map((m) => `${m.user?.full_name ?? "?"} (${m.role}${m.is_active ? "" : ", inactive"})`).join(", ")}</p> : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Documents" subtitle={`${documents.filter((d) => d.status === "pending").length} awaiting review`} />
            <CardBody><StoreDocuments docs={documents} urls={urls} /></CardBody>
          </Card>

          {s.photos.length ? (
            <Card><CardHeader title="Photos" /><CardBody className="flex flex-wrap gap-2">{s.photos.map((p) => <a key={p} href={p} target="_blank" rel="noreferrer"><RawImg src={p} className="h-24 w-24 rounded-md object-cover" /></a>)}</CardBody></Card>
          ) : null}

          <Card>
            <CardHeader title="Last 7 days" />
            <CardBody><BarChart points={(stats?.weekly ?? []).map((d) => ({ label: dayLabel(d.day), value: d.orders, secondary: d.gmv }))} primaryLabel="Orders" secondaryLabel="GMV" secondaryMoney height={120} /></CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent orders" action={<Link href={`/admin/orders?store=${s.id}`} className="text-sm font-semibold text-brand-700">All orders</Link>} />
            <CardBody className="px-0 sm:px-0">
              <Table className="rounded-none border-x-0 border-b-0" rows={recentOrders as unknown as Record<string, unknown>[]} empty="No orders yet." columns={[
                { key: "order_number", header: "Order", render: (r) => <Link href={`/admin/orders/${r.id}`} className="font-semibold text-brand-700">{String(r.order_number)}</Link> },
                { key: "status", header: "Status", render: (r) => <OrderStatusBadge status={r.status as never} /> },
                { key: "total", header: "Total", className: "text-right", render: (r) => <span className="tabular font-semibold">{formatINR(r.total as number)}</span> },
                { key: "created_at", header: "Placed", render: (r) => <span className="text-xs text-ink-3">{formatDateTime(r.created_at as string)}</span> },
              ]} />
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4">
          <StoreAdminPanel store={s} zones={zones} defaultCommission={defaultCommission} />
          <Card><CardHeader title="Commission history" /><CardBody><CommissionHistory rows={commissions} /></CardBody></Card>
          <Card>
            <CardHeader title="Scan-to-order poster" action={<a href={`/api/qr?path=${encodeURIComponent(`/qr/${s.id}`)}&format=png&size=1024`} download={`merta-deal-${s.slug}.png`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><Printer className="h-3.5 w-3.5" /> PNG</a>} />
            <CardBody className="overflow-x-auto"><QrPoster path={`/qr/${s.id}`} title={s.name} subtitle={s.area} code={s.slug} /></CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
