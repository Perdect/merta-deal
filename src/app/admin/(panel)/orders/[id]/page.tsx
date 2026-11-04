import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bike } from "lucide-react";
import { getOrderAdmin, getOrderAssignments, getLiveRiders, adminRpc } from "@/lib/data/admin";
import { PackingPanel } from "@/components/admin/scan/packing-panel";
import type { ScanOrder } from "@/lib/scan/types";
import { serverEnv } from "@/lib/env";
import { OrderAdminActions } from "@/components/admin/order-actions";
import { OrderFacts, type AddressSnapshot } from "@/components/admin/order-summary";
import { LiveMap } from "@/components/shop/live-map";
import { AdminPageHeader, Panel, EmptyBlock, StatusText } from "@/components/admin/kit";
import { formatINR, formatDateTime, formatTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { AcceptControl } from "@/components/admin/alerts/accept-control";
import { ItemExceptions } from "@/components/admin/alerts/item-exceptions";

export const metadata: Metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [t, assignments, riders, scan, accepted] = await Promise.all([getOrderAdmin(id), getOrderAssignments(id), getLiveRiders(), adminRpc<ScanOrder>("scan_order_detail", { p_order_id: id }),
    (await createClient()).from("orders").select("accepted_at, accepted_by_name").eq("id", id).maybeSingle()]);
  if (!t) notFound();
  const o = t.order;
  const addr = o.address_snapshot as unknown as AddressSnapshot;
  const live = t.assignment && ["accepted", "picked_up"].includes(t.assignment.status);
  const { razorpayKeyId, razorpayKeySecret, serviceRoleKey } = serverEnv();

  return (
    <>
      <AdminPageHeader back="/admin/orders" title={`Order ${o.order_number}`} description={`Placed ${formatDateTime(o.created_at)}${o.short_code ? ` · pickup code ${o.short_code}` : ""}`}
        actions={<AcceptControl orderId={o.id} status={o.status} acceptedAt={accepted.data?.accepted_at ?? null} acceptedByName={accepted.data?.accepted_by_name ?? null} />} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel><OrderFacts t={t} /></Panel>
          {scan.data ? <PackingPanel order={scan.data} /> : null}
          {scan.data ? <ItemExceptions orderId={o.id} status={o.status} lines={scan.data.lines} /> : null}

          {(live || o.status === "ready_for_pickup") ? (
            <Panel title="Live location" description={live ? "Rider GPS, pickup point and customer" : "Pickup point and customer; rider appears once assigned"} flush>
              <div className="overflow-hidden rounded-b-[14px] border-t border-line">
                <LiveMap store={{ lat: t.pickup.lat ?? 0, lng: t.pickup.lng ?? 0, name: t.pickup.name }} customer={addr.lat && addr.lng ? { lat: addr.lat, lng: addr.lng } : null} rider={live ? t.assignment!.last_location : null} trail={t.assignment?.last_location ? [{ lat: t.assignment.last_location.lat, lng: t.assignment.last_location.lng }] : []} showRoute={Boolean(live)} />
              </div>
            </Panel>
          ) : null}

          <Panel title="Rider assignments" description="Every offer made for this order, newest first" flush>
            {assignments.length === 0 ? <EmptyBlock icon={Bike} title="No rider offers yet" description="Offers appear here when dispatch runs or you assign a rider." /> : (
              <ul className="divide-y divide-line border-t border-line">
                {assignments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm sm:px-5">
                    <StatusText value={a.status} />
                    <span className="font-medium text-ink">{a.rider?.id ? <Link href={`/admin/riders/${a.rider.id}`} className="hover:underline">{a.rider.user?.full_name ?? "Rider"}</Link> : "Rider"}</span>
                    <span className="text-xs text-ink-3">Offered {formatDateTime(a.offered_at)}{a.responded_at ? ` · responded ${formatTime(a.responded_at)}` : ""}{a.picked_up_at ? ` · picked up ${formatTime(a.picked_up_at)}` : ""}{a.delivered_at ? ` · delivered ${formatTime(a.delivered_at)}` : ""}</span>
                    <span className="ml-auto text-xs tabular text-ink-3">{a.distance_km ?? "?"} km · earns {formatINR(a.earning)}{Number(a.cod_amount) ? ` · COD ${formatINR(a.cod_amount)}` : ""}</span>
                    {a.note ? <span className="w-full text-xs text-ink-4">{a.note}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Panel title="Actions" description="Only actions allowed for this order's current state are shown">
            <OrderAdminActions tracking={t} riders={riders} razorpayConfigured={Boolean(razorpayKeyId && razorpayKeySecret && serviceRoleKey)} />
          </Panel>
        </aside>
      </div>
    </>
  );
}
