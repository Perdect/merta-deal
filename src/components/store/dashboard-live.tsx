"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Inbox, Wifi, WifiOff } from "lucide-react";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { OrderRow } from "./order-row";
import { OrderActions } from "./order-actions";
import { OpenSwitch } from "./open-switch";
import { useStoreOrdersRealtime } from "./use-store-realtime";
import type { StoreOrderRow } from "@/lib/data/store";
import { cn } from "@/lib/utils";

/**
 * Live part of the dashboard: open/closed switch + queue of new orders with quick accept/reject.
 * Realtime order changes trigger a server refresh so KPIs (server-rendered) update too.
 */
export function DashboardLive({ storeId, isOpen, storeActive, pending, pendingTotal }: { storeId: string; isOpen: boolean; storeActive: boolean; pending: StoreOrderRow[]; pendingTotal: number }) {
  const router = useRouter();
  const connected = useStoreOrdersRealtime(storeId, () => router.refresh());
  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card p-4 shadow-card">
        <div><p className="text-sm font-bold text-ink">Store status</p><p className="text-xs text-ink-3">{storeActive ? "Closing hides you from customers; scheduled orders still queue up." : "You can toggle this now; it applies once the store is approved."}</p></div>
        <OpenSwitch storeId={storeId} isOpen={isOpen} />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-ink">New orders {pendingTotal > 0 ? <span className="ml-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-700 tabular">{pendingTotal}</span> : null}</h2>
          <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", connected ? "text-success" : "text-ink-4")}>{connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{connected ? "Live" : "Polling"}</span>
        </div>
        {pending.length === 0 ? (
          <EmptyState compact icon={<Inbox className="h-7 w-7" />} title="No new orders right now" description={storeActive ? "New orders appear here instantly and you will hear a notification." : "Orders start after the admin approves your store."} />
        ) : (
          <ul className="space-y-3">
            {pending.map((o) => (
              <OrderRow key={o.id} order={o}>
                <OrderActions order={o} size="sm" compact onDone={() => router.refresh()} />
              </OrderRow>
            ))}
          </ul>
        )}
        {pendingTotal > pending.length ? <div className="mt-3 text-center"><Button variant="outline" size="sm" href="/store/orders?tab=new">See all {pendingTotal} new orders</Button></div> : null}
      </section>
    </>
  );
}
