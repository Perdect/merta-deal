import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, Phone, Store as StoreIcon, MapPin, User } from "lucide-react";
import { getOrderAdmin, getOrderAssignments, getLiveRiders } from "@/lib/data/admin";
import { serverEnv } from "@/lib/env";
import { OrderAdminActions } from "@/components/admin/order-actions";
import { ASSIGNMENT_TONE, PAYMENT_STATUS_TONE } from "@/components/admin/constants";
import { OrderTimeline, OrderStatusBadge } from "@/components/shop/order-status";
import { LiveMap } from "@/components/shop/live-map";
import { ProductImage } from "@/components/shop/product-image";
import { PageHeader, KeyValue, Avatar, StarRating } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { ORDER_STATUS_META, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { formatINR, formatDateTime, formatTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [t, assignments, riders] = await Promise.all([getOrderAdmin(id), getOrderAssignments(id), getLiveRiders()]);
  if (!t) notFound();
  const o = t.order; const meta = ORDER_STATUS_META[o.status];
  const addr = o.address_snapshot as unknown as { full_name: string; phone: string; house: string; street: string; area: string; landmark?: string; city: string; pincode: string; lat?: number; lng?: number };
  const live = t.assignment && ["accepted", "picked_up"].includes(t.assignment.status);
  const terminal = ["delivered", "completed", "cancelled", "rejected"].includes(o.status);
  const { razorpayKeyId, razorpayKeySecret, serviceRoleKey } = serverEnv();

  return (
    <div className="space-y-4">
      <PageHeader back="/admin/orders" title={o.order_number} subtitle={<span className="inline-flex flex-wrap items-center gap-2"><OrderStatusBadge status={o.status} />{o.short_code ? <span className="font-mono text-xs text-ink-3">code {o.short_code}</span> : null}<span className="text-ink-3">Placed {formatDateTime(o.created_at)} · {o.delivery_type}</span></span>} className="px-0" />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardBody className="pt-4">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-lg font-bold text-ink">{meta.label}</h2><p className="text-sm text-ink-3">{meta.description}{o.promised_at && !terminal ? ` · promised ${formatTime(o.promised_at)}` : ""}{o.cancel_reason ? ` · ${o.cancel_reason}` : ""}{o.reject_reason ? ` · ${o.reject_reason}` : ""}</p></div>
                {t.delivery_otp ? <div className="flex items-center gap-2 rounded-md bg-saffron-50 px-3 py-2"><ShieldCheck className="h-5 w-5 text-saffron-700" /><div><p className="text-[10px] font-semibold uppercase tracking-wide text-saffron-700">Delivery OTP</p><p className="font-display text-xl font-extrabold tracking-[0.25em] text-ink">{t.delivery_otp}</p></div></div> : null}
              </div>
              <div className="mt-4"><OrderTimeline status={o.status} history={t.history} promisedAt={o.promised_at} /></div>
            </CardBody>
          </Card>

          {(live || o.status === "ready_for_pickup") ? <LiveMap store={{ lat: t.store.lat, lng: t.store.lng, name: t.store.name }} customer={addr.lat && addr.lng ? { lat: addr.lat, lng: addr.lng } : null} rider={live ? t.assignment!.last_location : null} trail={t.assignment?.last_location ? [{ lat: t.assignment.last_location.lat, lng: t.assignment.last_location.lng }] : []} showRoute={Boolean(live)} /> : null}

          <Card>
            <CardHeader title={`Items (${o.item_count})`} />
            <CardBody>
              <ul className="divide-y divide-line">{t.items.map((i) => <li key={i.id} className="flex items-center gap-3 py-2.5"><ProductImage image={i.image_url} productName={i.product_name} className="h-12 w-12 rounded-sm" sizes="48px" /><span className="min-w-0 flex-1"><Link href={`/admin/products/${i.product_id}`} className="line-clamp-1 text-sm font-medium text-ink hover:underline">{i.product_name}</Link><span className="text-xs text-ink-3">{i.pack_label} · {i.quantity} × {formatINR(i.unit_price)}{Number(i.unit_mrp) > Number(i.unit_price) ? <span className="ml-1 line-through">{formatINR(i.unit_mrp)}</span> : null}</span></span><span className="text-sm font-bold tabular text-ink">{formatINR(i.line_total)}</span></li>)}</ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Rider assignments" subtitle="Every offer made for this order, newest first" />
            <CardBody>
              {assignments.length === 0 ? <p className="text-sm text-ink-3">No rider has been offered this order yet.</p> : (
                <ul className="divide-y divide-line">
                  {assignments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <Badge tone={ASSIGNMENT_TONE[a.status]}>{a.status.replace("_", " ")}</Badge>
                      <span className="font-semibold text-ink">{a.rider?.id ? <Link href={`/admin/riders/${a.rider.id}`} className="hover:underline">{a.rider.user?.full_name ?? "Rider"}</Link> : "Rider"}</span>
                      <span className="text-xs text-ink-3">offered {formatDateTime(a.offered_at)}{a.responded_at ? ` · responded ${formatTime(a.responded_at)}` : ""}{a.picked_up_at ? ` · picked up ${formatTime(a.picked_up_at)}` : ""}{a.delivered_at ? ` · delivered ${formatTime(a.delivered_at)}` : ""}</span>
                      <span className="ml-auto text-xs tabular text-ink-3">{a.distance_km ?? "?"} km · earn {formatINR(a.earning)}{Number(a.cod_amount) ? ` · COD ${formatINR(a.cod_amount)}` : ""}</span>
                      {a.note ? <span className="w-full text-xs text-ink-4">{a.note}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card><CardBody className="pt-4"><OrderAdminActions tracking={t} riders={riders} razorpayConfigured={Boolean(razorpayKeyId && razorpayKeySecret && serviceRoleKey)} /></CardBody></Card>

          {t.assignment && t.assignment.status !== "offered" ? (
            <Card><CardBody className="flex items-center gap-3 pt-4">
              <Avatar name={t.assignment.rider.name} src={t.assignment.rider.avatar_url} size={44} />
              <div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{t.assignment.rider.name ?? "Rider"}</p><p className="text-xs capitalize text-ink-3">{t.assignment.rider.vehicle_type}{t.assignment.rider.vehicle_number ? ` · ${t.assignment.rider.vehicle_number}` : ""}</p><StarRating value={t.assignment.rider.rating_avg} size={12} />{t.assignment.last_location ? <p className="text-[11px] text-ink-3">GPS {timeAgo(t.assignment.last_location.recorded_at)}</p> : null}</div>
              {t.assignment.rider.phone ? <a href={`tel:${t.assignment.rider.phone}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700" aria-label="Call rider"><Phone className="h-5 w-5" /></a> : null}
            </CardBody></Card>
          ) : null}

          <Card>
            <CardHeader title="Payment" />
            <CardBody>
              <KeyValue items={[
                { label: "Items", value: formatINR(o.subtotal) }, ...(Number(o.item_discount) > 0 ? [{ label: "MRP savings", value: `− ${formatINR(o.item_discount)}` }] : []),
                ...(Number(o.coupon_discount) > 0 ? [{ label: `Coupon ${o.coupon_code}`, value: `− ${formatINR(o.coupon_discount)}` }] : []),
                { label: "Delivery", value: Number(o.delivery_fee) ? formatINR(o.delivery_fee) : "FREE" }, { label: "Platform fee", value: formatINR(o.platform_fee) }, { label: "GST on fees", value: formatINR(o.tax_amount, { precise: true }) },
                { label: "Total", value: formatINR(o.total, { precise: true }), strong: true },
              ]} />
              <div className="mt-3 space-y-1 text-xs text-ink-3">
                <p>{PAYMENT_METHOD_LABEL[o.payment_method]} · <Badge tone={PAYMENT_STATUS_TONE[o.payment_status]} size="xs">{PAYMENT_STATUS_LABEL[o.payment_status]}</Badge></p>
                {t.payment ? <p>Provider {t.payment.provider}{t.payment.provider_order_id ? ` · ${t.payment.provider_order_id}` : ""}{t.payment.refund_required ? " · refund required" : ""}</p> : null}
                <p className="pt-1">Commission {o.commission_rate}% = {formatINR(o.commission_amount, { precise: true })} · Store payout {formatINR(o.store_payout_amount, { precise: true })} · Rider earning {formatINR(o.rider_earning)}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3 pt-4 text-sm">
              <div><p className="flex items-center gap-2 font-bold text-ink"><StoreIcon className="h-4 w-4 text-brand-600" /><Link href={`/admin/stores/${t.store.id}`} className="hover:underline">{t.store.name}</Link></p><p className="text-xs text-ink-3">{t.store.address_line1}, {t.store.area}</p><a href={`tel:${t.store.phone}`} className="text-xs font-semibold text-brand-700">{t.store.phone}</a></div>
              <div><p className="flex items-center gap-2 font-bold text-ink"><User className="h-4 w-4 text-info" /><Link href={`/admin/users/${o.user_id}`} className="hover:underline">{addr.full_name}</Link></p><a href={`tel:${addr.phone}`} className="text-xs font-semibold text-brand-700">{addr.phone}</a></div>
              <div><p className="flex items-center gap-2 font-bold text-ink"><MapPin className="h-4 w-4 text-info" /> Deliver to</p><p className="text-xs text-ink-3">{addr.house}, {addr.street}, {addr.area}{addr.landmark ? `, ${addr.landmark}` : ""}, {addr.city} – {addr.pincode}</p>{o.delivery_instructions ? <p className="mt-1 rounded-sm bg-surface px-2 py-1.5 text-xs text-ink-2">“{o.delivery_instructions}”</p> : null}{o.customer_note ? <p className="mt-1 text-xs text-ink-3">Note: {o.customer_note}</p> : null}</div>
              {o.scheduled_slot_start ? <p className="text-xs text-ink-3">Scheduled {formatDateTime(o.scheduled_slot_start)} – {formatTime(o.scheduled_slot_end)}</p> : null}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
