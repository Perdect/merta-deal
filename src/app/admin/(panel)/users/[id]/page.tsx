import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptText, ShoppingBag, Wallet } from "lucide-react";
import { getUserDetail } from "@/lib/data/admin";
import { getSessionUser } from "@/lib/supabase/server";
import { AdminPageHeader, Panel, DetailList, DataTable, CellStack, EmptyBlock, MetricCard, OrderStatusPill, PaymentStatusPill, paymentMethodLabel, StatusPill, rupees, rupeesRounded } from "@/components/admin/kit";
import { UserActions } from "@/components/admin/user-actions";
import { ResetPinButton } from "@/components/admin/reset-pin";
import { RolePill, ActivePill, RiderStatusPill, VEHICLE_LABEL } from "@/components/admin/ops/pills";
import { Avatar } from "@/components/ui/misc";
import { formatDate, formatDateTime, formatNumber, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "User" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, me] = await Promise.all([getUserDetail(id), getSessionUser()]);
  if (!detail) notFound();
  const { profile: p, stats, orders, wallet, rider } = detail;
  const name = p.full_name ?? "Unnamed user";
  const ordersHref = p.phone ? `/admin/orders?q=${encodeURIComponent(p.phone)}` : null;

  return (
    <>
      <AdminPageHeader back="/admin/users" title={name} description={`Joined ${formatDate(p.created_at)}${p.referral_code ? ` · referral code ${p.referral_code}` : ""}`}
        meta={<><RolePill role={p.role} /><ActivePill active={p.is_active} />{p.is_guest ? <StatusPill>Guest checkout</StatusPill> : null}{me?.id === p.id ? <StatusPill tone="blue">You</StatusPill> : null}</>} />

      <section aria-label="Customer summary" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Orders" period="All time" value={stats ? formatNumber(stats.orders) : "—"} icon={ShoppingBag} hint={stats ? `${stats.delivered_orders} delivered · ${stats.cancelled_orders} cancelled` : "Stats unavailable"} />
        <MetricCard label="Total spent" period="All time" value={stats ? rupeesRounded(stats.spent) : "—"} hint={stats?.last_order_at ? `Last order ${formatDate(stats.last_order_at)}` : stats ? "No orders yet" : "Stats unavailable"} />
        <MetricCard label="Wallet balance" period="Now" value={rupees(p.wallet_balance)} icon={Wallet} />
        <MetricCard label="Reward points" period="Now" value={formatNumber(p.reward_points)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Panel title="Recent orders" description="Latest 10 orders placed by this user" flush actions={ordersHref ? <Link href={ordersHref} className="text-sm font-semibold text-brand-700 hover:underline">Search all orders</Link> : null}>
            <DataTable caption="Recent orders" rows={orders} rowKey={(o) => o.id} maxHeight={null} className="rounded-none border-x-0 border-b-0 shadow-none"
              empty={<EmptyBlock icon={ShoppingBag} title="No orders yet" description="Orders this user places will appear here." />}
              columns={[
                { key: "order", header: "Order", render: (o) => <CellStack primary={o.order_number} href={`/admin/orders/${o.id}`} /> },
                { key: "status", header: "Order status", render: (o) => <OrderStatusPill status={o.status} /> },
                { key: "method", header: "Method", hideBelow: "lg", render: (o) => <span className="text-ink-2">{paymentMethodLabel(o.payment_method)}</span> },
                { key: "payment", header: "Payment", hideBelow: "md", render: (o) => <PaymentStatusPill status={o.payment_status} /> },
                { key: "total", header: "Total", align: "right", render: (o) => <span className="font-semibold tabular">{rupees(o.total)}</span> },
                { key: "placed", header: "Placed", hideBelow: "sm", render: (o) => <span className="whitespace-nowrap text-xs text-ink-3" title={formatDateTime(o.created_at)}>{timeAgo(o.created_at)}</span> },
              ]} />
          </Panel>

          <Panel title="Wallet ledger" description="Latest 10 wallet transactions" flush>
            <DataTable caption="Wallet ledger" rows={wallet} rowKey={(w) => w.id} maxHeight={null} className="rounded-none border-x-0 border-b-0 shadow-none"
              empty={<EmptyBlock icon={ReceiptText} title="No wallet activity" description="Credits, refunds to wallet and wallet payments appear here." />}
              columns={[
                { key: "when", header: "When", render: (w) => <span className="whitespace-nowrap text-xs text-ink-3" title={formatDateTime(w.created_at)}>{formatDateTime(w.created_at)}</span> },
                { key: "type", header: "Type", render: (w) => <StatusPill tone={w.type === "debit" ? "red" : "green"}>{w.type === "debit" ? "Debit" : "Credit"}</StatusPill> },
                { key: "desc", header: "Description", hideBelow: "md", render: (w) => <span className="block max-w-[280px] truncate text-ink-2" title={w.description ?? undefined}>{w.description ?? "—"}</span> },
                { key: "amount", header: "Amount", align: "right", render: (w) => <span className={w.type === "debit" ? "tabular text-danger" : "tabular text-success"}>{w.type === "debit" ? "−" : "+"}{rupees(w.amount)}</span> },
                { key: "balance", header: "Balance", align: "right", hideBelow: "sm", render: (w) => <span className="tabular text-ink-3">{rupees(w.balance_after)}</span> },
              ]} />
          </Panel>
        </div>

        <aside className="min-w-0 space-y-4">
          <Panel title="Profile">
            <div className="mb-3 flex items-center gap-3"><Avatar name={p.full_name} src={p.avatar_url} size={48} /><p className="min-w-0 truncate font-medium text-ink">{name}</p></div>
            <DetailList items={[
              { label: "Phone", value: p.phone ? <a href={`tel:${p.phone}`} className="hover:underline">{p.phone}</a> : "—" },
              { label: "Email", value: <span className="break-all">{p.email ?? stats?.email_auth ?? "—"}</span> },
              { label: "Addresses", value: stats ? formatNumber(stats.addresses) : "—" },
              { label: "Reviews", value: stats ? formatNumber(stats.reviews) : "—" },
              { label: "Support tickets", value: stats ? formatNumber(stats.tickets) : "—" },
              { label: "Last seen", value: p.last_seen_at ? formatDateTime(p.last_seen_at) : stats?.last_sign_in_at ? formatDateTime(stats.last_sign_in_at) : "—" },
            ]} />
          </Panel>

          {rider ? (
            <Panel title="Linked accounts">
              <ul className="space-y-2 text-sm">
                {rider ? (
                  <li className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/riders/${rider.id}`} className="font-medium text-brand-700 hover:underline">Delivery partner</Link>
                    <RiderStatusPill status={rider.status} />
                    <span className="text-xs text-ink-3">{VEHICLE_LABEL[rider.vehicle_type] ?? rider.vehicle_type}{rider.is_online ? " · online" : ""}</span>
                  </li>
                ) : null}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Account actions" description="Each change is confirmed and recorded in the audit log">
            <UserActions userId={p.id} role={p.role} isActive={p.is_active} isSuperAdmin={me?.role === "super_admin"} isSelf={me?.id === p.id} name={p.full_name} walletBalance={Number(p.wallet_balance)} />
          </Panel>
          <Panel title="Sign-in recovery" description="For a verified account holder who forgot their PIN">
            <ResetPinButton userId={p.id} name={p.full_name ?? "this user"}
              disabled={me?.id === p.id || ((p.role === "admin" || p.role === "super_admin") && me?.role !== "super_admin")}
              disabledReason={me?.id === p.id ? "Change your own PIN from account settings." : (p.role === "admin" || p.role === "super_admin") && me?.role !== "super_admin" ? "Only a super admin can reset an admin's PIN." : undefined} />
          </Panel>
        </aside>
      </div>
    </>
  );
}
