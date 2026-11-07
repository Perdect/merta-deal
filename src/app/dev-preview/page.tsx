// TEMPORARY visual check for the order status art. Not committed.
import { OrderStatusArt } from "@/components/shop/order-status-art";
import { ORDER_STATUS_META, type OrderStatus } from "@/lib/order-status";
export default function Page() {
  const all = Object.keys(ORDER_STATUS_META) as OrderStatus[];
  return <div className="grid grid-cols-4 gap-6 p-6">{all.map((s) => <div key={s} className="flex flex-col items-center gap-2 rounded-lg border border-line bg-card p-4"><OrderStatusArt status={s} className="h-32 w-32" /><span className="text-xs text-ink-3">{s}</span></div>)}</div>;
}
