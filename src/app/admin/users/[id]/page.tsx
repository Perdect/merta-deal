import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserDetail } from "@/lib/data/admin";
import { getSessionUser } from "@/lib/supabase/server";
import { UserActions } from "@/components/admin/user-actions";
import { ROLE_TONE } from "@/components/admin/constants";
import { PageHeader, Avatar, KeyValue, Table } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Stat, Card, CardHeader, CardBody } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/shop/order-status";
import { PAYMENT_METHOD_LABEL } from "@/lib/order-status";
import { formatINR, formatDate, formatDateTime, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "User" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, me] = await Promise.all([getUserDetail(id), getSessionUser()]);
  if (!detail) notFound();
  const { profile: p, stats, orders, wallet, rider, stores } = detail;
  return (
    <div className="space-y-4">
      <PageHeader back="/admin/users" title={p.full_name ?? "Unnamed user"} subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={ROLE_TONE[p.role] ?? "neutral"}>{p.role.replace("_", " ")}</Badge>{!p.is_active ? <Badge tone="danger">Deactivated</Badge> : null}{p.is_guest ? <Badge tone="neutral">Guest</Badge> : null}<span className="text-ink-3">Joined {formatDate(p.created_at)}</span></span>} className="px-0" />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Orders" value={formatNumber(stats?.orders ?? 0)} hint={stats ? `${stats.delivered_orders} delivered · ${stats.cancelled_orders} cancelled` : undefined} />
        <Stat label="Total spent" value={formatINR(stats?.spent ?? 0)} hint={stats?.last_order_at ? `Last order ${formatDate(stats.last_order_at)}` : "No orders yet"} tone="brand" />
        <Stat label="Wallet" value={formatINR(p.wallet_balance)} tone="saffron" />
        <Stat label="Reward points" value={formatNumber(p.reward_points)} hint={`Referral ${p.referral_code ?? "—"}`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Profile" />
            <CardBody className="flex gap-4">
              <Avatar name={p.full_name} src={p.avatar_url} size={64} />
              <KeyValue className="flex-1" items={[
                { label: "Phone", value: p.phone ?? "—" }, { label: "Email", value: p.email ?? stats?.email_auth ?? "—" },
                { label: "Addresses", value: stats?.addresses ?? 0 }, { label: "Reviews", value: stats?.reviews ?? 0 }, { label: "Support tickets", value: stats?.tickets ?? 0 },
                { label: "Last seen", value: p.last_seen_at ? formatDateTime(p.last_seen_at) : stats?.last_sign_in_at ? formatDateTime(stats.last_sign_in_at) : "—" },
              ]} />
            </CardBody>
          </Card>

          {rider ? <Card><CardBody className="pt-4 text-sm">Delivery partner: <Badge tone={rider.status === "active" ? "success" : rider.status === "pending" ? "warning" : "danger"}>{rider.status}</Badge> <span className="ml-2 text-ink-3">{rider.vehicle_type}{rider.is_online ? " · online" : ""}</span> <Link href={`/admin/riders/${rider.id}`} className="ml-2 font-semibold text-brand-700">Open rider profile</Link></CardBody></Card> : null}
          {stores.length ? <Card><CardBody className="pt-4 text-sm">Owns {stores.length === 1 ? "store" : "stores"}: {stores.map((s, i) => <span key={s.id}>{i ? ", " : ""}<Link href={`/admin/stores/${s.id}`} className="font-semibold text-brand-700">{s.name}</Link> <span className="text-ink-3">({s.status})</span></span>)}</CardBody></Card> : null}

          <Card>
            <CardHeader title="Recent orders" action={<Link href={`/admin/orders?q=${encodeURIComponent(p.phone ?? "")}`} className="text-sm font-semibold text-brand-700">All orders</Link>} />
            <CardBody className="px-0 sm:px-0">
              <Table className="rounded-none border-x-0 border-b-0" rows={orders as unknown as Record<string, unknown>[]} empty="No orders yet." columns={[
                { key: "order_number", header: "Order", render: (r) => <Link href={`/admin/orders/${r.id}`} className="font-semibold text-brand-700">{String(r.order_number)}</Link> },
                { key: "store", header: "Store", render: (r) => (r.store as { name: string } | null)?.name ?? "—" },
                { key: "status", header: "Status", render: (r) => <OrderStatusBadge status={r.status as never} /> },
                { key: "payment_method", header: "Payment", render: (r) => <span className="text-xs">{PAYMENT_METHOD_LABEL[r.payment_method as keyof typeof PAYMENT_METHOD_LABEL]} · {String(r.payment_status).replace("_", " ")}</span> },
                { key: "total", header: "Total", className: "text-right", render: (r) => <span className="tabular font-semibold">{formatINR(r.total as number)}</span> },
                { key: "created_at", header: "Placed", render: (r) => <span className="text-xs text-ink-3">{formatDateTime(r.created_at as string)}</span> },
              ]} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Wallet ledger" subtitle="Latest 10 transactions" />
            <CardBody className="px-0 sm:px-0">
              <Table className="rounded-none border-x-0 border-b-0" rows={wallet as unknown as Record<string, unknown>[]} empty="No wallet activity." columns={[
                { key: "created_at", header: "When", render: (r) => <span className="text-xs text-ink-3">{formatDateTime(r.created_at as string)}</span> },
                { key: "type", header: "Type", render: (r) => <Badge tone={r.type === "debit" ? "danger" : "success"}>{String(r.type)}</Badge> },
                { key: "description", header: "Description" },
                { key: "amount", header: "Amount", className: "text-right", render: (r) => <span className="tabular">{r.type === "debit" ? "−" : "+"}{formatINR(r.amount as number, { precise: true })}</span> },
                { key: "balance_after", header: "Balance", className: "text-right", render: (r) => <span className="tabular text-ink-3">{formatINR(r.balance_after as number, { precise: true })}</span> },
              ]} />
            </CardBody>
          </Card>
        </div>

        <aside>
          <UserActions userId={p.id} role={p.role} isActive={p.is_active} isSuperAdmin={me?.role === "super_admin"} name={p.full_name} />
        </aside>
      </div>
    </div>
  );
}
