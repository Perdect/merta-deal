"use client";
import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Package, Wifi, WifiOff } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { OrderRow } from "./order-row";
import { OrderActions } from "./order-actions";
import { useStoreOrdersRealtime } from "./use-store-realtime";
import { STORE_ORDER_TABS, type StoreOrderTab } from "./constants";
import type { StoreOrderRow } from "@/lib/data/store";
import { cn } from "@/lib/utils";

/** Tabbed, paginated order list driven by the URL (?tab=&page=) so refreshes and back navigation keep state. */
export function OrdersList({ storeId, tab, orders, total, page, pageSize, counts }: { storeId: string; tab: StoreOrderTab; orders: StoreOrderRow[]; total: number; page: number; pageSize: number; counts: Partial<Record<StoreOrderTab, number>> }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const connected = useStoreOrdersRealtime(storeId, () => router.refresh());
  const go = (next: { tab?: string; page?: number }) => {
    const q = new URLSearchParams(sp.toString());
    if (next.tab !== undefined) { q.set("tab", next.tab); q.delete("page"); }
    if (next.page !== undefined) { if (next.page <= 1) q.delete("page"); else q.set("page", String(next.page)); }
    router.push(`${pathname}?${q.toString()}`);
  };
  const empty: Record<StoreOrderTab, string> = { new: "New orders appear here the moment a customer places one — pack them and tap Packed.", ready: "Packed orders waiting for or with a rider.", on_the_way: "Orders currently with a rider.", completed: "Delivered and completed orders.", cancelled: "Cancelled or rejected orders." };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Tabs className="min-w-0 flex-1" size="sm" items={STORE_ORDER_TABS.map((t) => ({ value: t.value, label: t.label, count: counts[t.value] }))} value={tab} onChange={(v) => go({ tab: v })} />
        <span className={cn("hidden shrink-0 items-center gap-1 text-[11px] font-semibold sm:inline-flex", connected ? "text-success" : "text-ink-4")}>{connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{connected ? "Live" : "Polling"}</span>
      </div>
      {orders.length === 0 ? <EmptyState icon={<Package className="h-7 w-7" />} title={`No ${STORE_ORDER_TABS.find((t) => t.value === tab)?.label.toLowerCase()} orders`} description={empty[tab]} /> : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o}>
              {["placed", "store_confirmed", "preparing"].includes(o.status) ? <OrderActions order={o} size="sm" compact onDone={() => router.refresh()} /> : null}
            </OrderRow>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onChange={(p) => go({ page: p })} />
    </div>
  );
}
