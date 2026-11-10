import type { Metadata } from "next";
import Link from "next/link";
import { Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAdminWholesale } from "@/lib/data/wholesale";
import { AdminPageHeader, Panel, EmptyBlock, ErrorBlock, StatusText, StatusTabs } from "@/components/admin/kit";
import { BuyerControls } from "@/components/admin/wholesale/shop-controls";
import { OrderControls } from "@/components/admin/wholesale/order-controls";
import { ProductEditor } from "@/components/admin/wholesale/product-editor";
import { BUYER_STATUS_LABEL, WHOLESALE_ORDER_LABEL_ADMIN, buyerLabel, restockDateLabel } from "@/lib/wholesale";
import { formatINR, formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Wholesale" };
export const dynamic = "force-dynamic";
const TABS = ["orders", "buyers", "products"] as const;

/** Wholesale for everyone: set case sizes and prices, place the orders buyers have approved, pause a buyer if needed. */
export default async function AdminWholesalePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.status)) ? (String(sp.status) as (typeof TABS)[number]) : "orders";
  const [{ overview, installed, error }, products] = await Promise.all([getAdminWholesale(), (await createClient()).from("products").select("id, name, pack_label, inventory(selling_price)").eq("is_active", true).order("name")]);
  const options = (products.data ?? []).map((p) => ({ id: p.id, name: p.name, pack_label: p.pack_label, selling_price: (Array.isArray(p.inventory) ? p.inventory[0]?.selling_price : (p.inventory as { selling_price: number } | null)?.selling_price) ?? null }));
  return (
    <>
      <AdminPageHeader title="Wholesale" description="Any signed-in customer can order full cases; no approval is needed. Set case sizes and wholesale prices here and place the orders buyers have approved. A placed order goes through normal packing and delivery, paid on delivery." />
      {!installed ? <EmptyBlock icon={Warehouse} title="Wholesale isn't switched on yet" description="Apply migration 0045 to this database first." /> : error || !overview ? <ErrorBlock title="Couldn't load wholesale" description={error ?? undefined} retryHref="/admin/wholesale" /> : (
        <>
          <StatusTabs defaultValue="orders" items={[
            { value: "orders", label: "Orders", count: overview.counts.approved_orders || null },
            { value: "buyers", label: "Buyers", count: overview.counts.buyers || null },
            { value: "products", label: "Products & prices", count: overview.products.length || null },
          ]} />
          {tab === "orders" ? (
            <Panel title="Wholesale orders" description="Approved orders are waiting for you to confirm stock and place them. Proposed ones are with the buyer for review." flush>
              {overview.orders.length === 0 ? <EmptyBlock icon={Warehouse} title="No wholesale orders yet" description="Orders appear here when a customer orders full cases from the Wholesale page or approves a monthly order." /> : (
                <ul className="divide-y divide-line">
                  {overview.orders.map((o) => (
                    <li key={o.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:px-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">{buyerLabel(o)}</p>{o.shop_name ? null : <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3">Home</span>}<StatusText value={o.status} label={WHOLESALE_ORDER_LABEL_ADMIN[o.status]} /></div>
                        <p className="text-xs text-ink-3">{o.list_id ? "Restock" : "Deliver"} {restockDateLabel(o.restock_date)} · {o.owner_name} · <a href={`tel:+91${o.shop_phone}`} className="font-medium text-brand-700">{o.shop_phone}</a>{o.order_number ? <> · <Link href={`/admin/orders?view=${o.order_id}`} className="font-medium text-brand-700">{o.order_number}</Link> ({o.order_status?.replace(/_/g, " ")})</> : null}</p>
                        <ul className="mt-2 text-sm text-ink-2">
                          {o.items.map((i) => <li key={i.product_id}>{i.cases} × {i.name} <span className="text-ink-3">(case of {i.case_size} · {i.units} units)</span> {i.price_per_case == null ? <span className="font-semibold text-saffron-700">quote required</span> : <span className="tabular">· {formatINR(i.line_total ?? 0)}</span>}</li>)}
                        </ul>
                        <p className="mt-1 text-sm font-semibold text-ink">Items {formatINR(o.subtotal)}{o.has_unpriced ? " + items on quote" : ""}</p>
                        {o.shop_note ? <p className="text-xs text-ink-2">Buyer: “{o.shop_note}”</p> : null}
                        {o.admin_note ? <p className="text-xs text-ink-3">Note: {o.admin_note}</p> : null}
                        <p className="text-[11px] text-ink-3">{o.approved_at ? `${o.list_id ? "Approved" : "Ordered"} ${formatDateTime(o.approved_at)}` : `Proposed ${timeAgo(o.created_at)}`}</p>
                      </div>
                      <div className="sm:w-72"><OrderControls order={o} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : tab === "buyers" ? (
            <Panel title="Wholesale buyers" description="Created automatically when a customer first orders wholesale or saves a monthly list. Shop name and GSTIN appear only when the buyer added them. You can pause a buyer." flush>
              {overview.shops.length === 0 ? <EmptyBlock icon={Warehouse} title="No wholesale buyers yet" description="A buyer appears here with their first wholesale order or monthly list." /> : (
                <ul className="divide-y divide-line">
                  {overview.shops.map((s) => (
                    <li key={s.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:px-5">
                      <div className="min-w-0 text-sm">
                        <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">{buyerLabel(s)}</p>{s.shop_name ? null : <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3">Home</span>}<StatusText value={s.status === "approved" ? "active" : s.status} label={BUYER_STATUS_LABEL[s.status]} /></div>
                        <p className="text-ink-2">{s.shop_name ? `${s.owner_name} · ` : ""}<a href={`tel:+91${s.phone}`} className="font-medium text-brand-700">{s.phone}</a>{s.gstin ? ` · GSTIN ${s.gstin}` : ""}</p>
                        <p className="text-xs text-ink-3">{s.address ? [s.address.house, s.address.street, s.address.area, `${s.address.city} – ${s.address.pincode}`].filter(Boolean).join(", ") : "No address on file"}</p>
                        {s.monthly_needs ? <p className="mt-1 rounded-md bg-surface px-2 py-1.5 text-xs text-ink-2">Needs: {s.monthly_needs}</p> : null}
                        <p className="mt-1 text-[11px] text-ink-3">Since {formatDateTime(s.created_at)}{s.list ? ` · restock day ${s.list.restock_day}, next ${restockDateLabel(s.list.next_run_date)}` : " · no list yet"} · {s.orders_placed} placed</p>
                        {s.review_note ? <p className="text-xs text-ink-3">Last note: {s.review_note}</p> : null}
                      </div>
                      <div className="sm:w-72"><BuyerControls buyerId={s.id} status={s.status} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : (
            <Panel title="Wholesale products and prices" description="Real catalogue products only. Set the case size, minimum and the price you will actually sell at; leave the price blank until a supplier confirms it.">
              <ProductEditor rows={overview.products} options={options} />
            </Panel>
          )}
        </>
      )}
    </>
  );
}
