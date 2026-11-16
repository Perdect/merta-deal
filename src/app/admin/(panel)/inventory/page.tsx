import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Boxes, Lock, PackageCheck, PackageX } from "lucide-react";
import { getAllCategories, spGet, spPage, type SP } from "@/lib/data/admin";
import { categoryOptions } from "@/lib/categories";
import { getInventoryOverview, getInventoryPassbook } from "@/lib/data/inventory";
import { AdminPageHeader, MetricCard, EmptyBlock, ErrorBlock, ListToolbar, StatusTabs, ListPagination } from "@/components/admin/kit";
import { StockTable } from "@/components/admin/inventory/stock-table";
import { PassbookList } from "@/components/admin/inventory/passbook-list";
import { btn } from "@/components/admin/catalogue/bits";
import { INVENTORY_TABS, PASSBOOK_KIND_LABEL } from "@/lib/inventory";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

/**
 * Inventory (0048): available / reserved / physical stock per listing, low-stock alerts, manual
 * adjustments, and the append-only passbook of every movement.
 */
export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = spGet(sp, "tab") === "passbook" ? "passbook" : "stock";
  const page = spPage(sp);
  const categoriesP = getAllCategories();
  const q = spGet(sp, "q"); const category = spGet(sp, "category"); const filter = spGet(sp, "filter");
  const inventoryId = /^[0-9a-f-]{36}$/.test(spGet(sp, "inventory")) ? spGet(sp, "inventory") : ""; const kind = spGet(sp, "kind");
  const [overview, passbook, categories] = await Promise.all([
    getInventoryOverview({ q: tab === "stock" ? q : "", category, filter, page: tab === "stock" ? page : 1 }),
    tab === "passbook" ? getInventoryPassbook({ inventoryId, kind, q, page }) : Promise.resolve(null),
    categoriesP,
  ]);
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();
  const focus = inventoryId ? overview.rows.find((r) => r.id === inventoryId) : null;

  return (
    <>
      <AdminPageHeader title="Inventory" description="Available stock is what customers can buy now. Reserved stock is held for orders that are placed but not yet delivered. Physical stock is both together. Every movement is written to the passbook and never edited."
        actions={<Link href="/admin/purchasing" className={btn.outline}><PackageCheck className="h-4 w-4" aria-hidden />Receive a purchase</Link>} />

      {!overview.installed ? <EmptyBlock icon={Boxes} title="Inventory tracking isn't switched on yet" description="Apply migration 0048 to this database first." /> : overview.error ? (
        <ErrorBlock title="Couldn't load inventory" description={overview.error} retryHref={`/admin/inventory${qs ? `?${qs}` : ""}`} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Available" value={formatNumber(overview.totals.available)} hint="packs customers can buy" icon={Boxes} />
            <MetricCard label="Reserved" value={formatNumber(overview.totals.reserved)} hint="held for open orders" icon={Lock} href="/admin/inventory?filter=reserved" />
            <MetricCard label="Low stock" value={formatNumber(overview.totals.low)} hint="at or under the alert level" icon={AlertTriangle} tone={overview.totals.low > 0 ? "attention" : "default"} href="/admin/inventory?filter=low" />
            <MetricCard label="Out of stock" value={formatNumber(overview.totals.out)} hint="nothing available" icon={PackageX} tone={overview.totals.out > 0 ? "attention" : "default"} href="/admin/inventory?filter=out" />
          </div>

          <StatusTabs param="tab" items={[{ value: "", label: "Stock" }, { value: "passbook", label: "Passbook" }]} />

          {tab === "stock" ? (
            <>
              <StatusTabs param="filter" items={INVENTORY_TABS.map((t) => ({ ...t, count: t.value === "" ? overview.counts.all : overview.counts[t.value as keyof typeof overview.counts] ?? null }))} />
              <ListToolbar searchPlaceholder="Product, brand or SKU" filters={[
                { key: "category", label: "Category", anyLabel: "All categories", options: categoryOptions(categories, { topLabel: (name) => `${name} (incl. subcategories)` }) },
              ]} />
              <StockTable rows={overview.rows} filtered={Boolean(q || category || filter)} />
              <ListPagination page={page} pageSize={25} total={overview.total} className="mt-3" />
            </>
          ) : (
            <>
              {focus || inventoryId ? (
                <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                  Showing movements for <span className="font-semibold text-ink">{focus?.name ?? "one listing"}</span>{focus ? <span className="text-ink-3">· {focus.available} available · {focus.reserved} reserved · {focus.physical} physical</span> : null}
                  <Link href={`/admin/inventory?tab=passbook${kind ? `&kind=${kind}` : ""}`} className="font-semibold text-brand-700">Show all products</Link>
                </p>
              ) : null}
              <ListToolbar searchPlaceholder="Product, order number or note" filters={[
                { key: "kind", label: "Movement", anyLabel: "All movements", options: Object.entries(PASSBOOK_KIND_LABEL).map(([value, label]) => ({ value, label })) },
              ]} />
              {passbook?.error ? <ErrorBlock title="Couldn't load the passbook" description={passbook.error} retryHref={`/admin/inventory${qs ? `?${qs}` : ""}`} />
                : <PassbookList rows={passbook?.rows ?? []} filtered={Boolean(q || kind || inventoryId)} />}
              <ListPagination page={page} pageSize={50} total={passbook?.total ?? 0} className="mt-3" />
            </>
          )}
        </>
      )}
    </>
  );
}
