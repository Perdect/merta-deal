import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, PackagePlus, Truck, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { spGet, type SP } from "@/lib/data/admin";
import { AdminPageHeader, Panel, DataTable, CellStack, EmptyBlock, StatusTabs, StatusPill, rupees, RowLink } from "@/components/admin/kit";
import { SupplierForm, type SupplierRow } from "@/components/admin/finance/supplier-form";
import { btn } from "@/components/admin/care/shared";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Purchasing" };
export const dynamic = "force-dynamic";

type Grn = { id: string; grn_number: string; status: string; received_at: string; total: number; paid_amount: number; payment_status: string; invoice_no: string | null; supplier: { name: string } | null };
type Po = { id: string; po_number: string; status: string; expected_at: string | null; total: number; created_at: string; supplier: { name: string } | null };
const TABS = [{ value: "", label: "Receipts" }, { value: "po", label: "Purchase orders" }, { value: "suppliers", label: "Suppliers" }];
const GRN_TONE: Record<string, "amber" | "green" | "neutral"> = { draft: "amber", posted: "green", cancelled: "neutral" };
const PAY_TONE: Record<string, "red" | "amber" | "green"> = { unpaid: "red", partial: "amber", paid: "green" };
const PO_TONE: Record<string, "neutral" | "blue" | "amber" | "green"> = { draft: "neutral", ordered: "blue", partially_received: "amber", received: "green", cancelled: "neutral" };

/** Buying side: goods receipts (what actually arrived, with costs), purchase orders, and suppliers. Costs stay admin-only. */
export default async function PurchasingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = spGet(sp, "tab");
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = supabase as any;
  const [grns, pos, sups, canSee] = await Promise.all([
    any.from("goods_receipts").select("id, grn_number, status, received_at, total, paid_amount, payment_status, invoice_no, supplier:suppliers(name)").order("received_at", { ascending: false }).limit(100),
    any.from("purchase_orders").select("id, po_number, status, expected_at, total, created_at, supplier:suppliers(name)").order("created_at", { ascending: false }).limit(100),
    any.from("suppliers").select("id, name, phone, email, gstin, address, notes, is_active").order("name"),
    supabase.rpc("can_see_costs"),
  ]);
  const receipts = (grns.data ?? []) as Grn[]; const orders = (pos.data ?? []) as Po[]; const suppliers = (sups.data ?? []) as SupplierRow[];
  const open = receipts.filter((g) => g.status === "posted").reduce((a, g) => a + Number(g.total) - Number(g.paid_amount), 0);

  if (canSee.data === false) {
    return <><AdminPageHeader title="Purchasing" /><EmptyBlock icon={ClipboardList} title="Purchase costs are restricted" description="A super admin has limited cost visibility to super admins (Settings → Finance)." /></>;
  }
  return (
    <>
      <AdminPageHeader title="Purchasing" description="Record what you buy and what it really cost. Posting a receipt puts stock on the shelf and updates each product's cost; paying the supplier is tracked separately."
        actions={<span className="flex flex-wrap gap-2"><Link href="/admin/purchasing/po/new" className={btn.secondary}><ClipboardList className="h-4 w-4" aria-hidden />New purchase order</Link><Link href="/admin/purchasing/grn/new" className={btn.primary}><PackagePlus className="h-4 w-4" aria-hidden />Receive goods</Link></span>} />
      <StatusTabs param="tab" items={TABS.map((t) => ({ ...t, count: t.value === "" ? receipts.length : t.value === "po" ? orders.length : suppliers.length }))} />

      {tab === "suppliers" ? (
        <Panel title="Suppliers" actions={<SupplierForm />} flush>
          <DataTable caption="Suppliers" rows={suppliers} rowKey={(s) => s.id} maxHeight={null}
            empty={<EmptyBlock icon={Truck} title="No suppliers yet" description="Add the mandi traders and distributors you buy from." action={<SupplierForm />} />}
            columns={[
              { key: "name", header: "Supplier", render: (s) => <CellStack primary={<>{s.name}{!s.is_active ? <span className="ml-1.5 text-xs text-ink-3">(inactive)</span> : null}</>} secondary={[s.phone, s.gstin].filter(Boolean).join(" · ") || undefined} /> },
              { key: "address", header: "Address", hideBelow: "md", render: (s) => <span className="text-xs text-ink-2">{s.address ?? "—"}</span> },
              { key: "act", header: "", align: "right", render: (s) => <SupplierForm supplier={s} /> },
            ]} />
        </Panel>
      ) : tab === "po" ? (
        <Panel title="Purchase orders" description="What you asked suppliers for. Receive goods against an order to track what is still outstanding." flush>
          <DataTable caption="Purchase orders" rows={orders} rowKey={(o) => o.id} maxHeight={null}
            empty={<EmptyBlock icon={ClipboardList} title="No purchase orders" description="Optional: you can receive goods without an order." action={<Link href="/admin/purchasing/po/new" className={btn.primary}><Plus className="h-4 w-4" aria-hidden />New purchase order</Link>} />}
            columns={[
              { key: "no", header: "Order", render: (o) => <CellStack primary={o.po_number} secondary={o.supplier?.name ?? "—"} href={`/admin/purchasing/po/${o.id}`} /> },
              { key: "status", header: "Status", render: (o) => <StatusPill tone={PO_TONE[o.status] ?? "neutral"}>{o.status.replace("_", " ")}</StatusPill> },
              { key: "expected", header: "Expected", hideBelow: "md", render: (o) => <span className="text-xs text-ink-2">{o.expected_at ? formatDate(o.expected_at) : "—"}</span> },
              { key: "total", header: "Total", align: "right", render: (o) => <span className="tabular font-semibold">{rupees(o.total)}</span> },
              { key: "act", header: "", align: "right", render: (o) => <RowLink href={`/admin/purchasing/po/${o.id}`}>Open</RowLink> },
            ]} />
        </Panel>
      ) : (
        <Panel title="Goods receipts" description={open > 0 ? `Supplier balance open: ${rupees(open)}` : "All posted receipts are paid."} flush>
          <DataTable caption="Goods receipts" rows={receipts} rowKey={(g) => g.id} maxHeight={null}
            empty={<EmptyBlock icon={PackagePlus} title="Nothing received yet" description="Record the first delivery from a supplier: quantities in packs, cartons or kilograms, with the price paid." action={<Link href="/admin/purchasing/grn/new" className={btn.primary}><Plus className="h-4 w-4" aria-hidden />Receive goods</Link>} />}
            columns={[
              { key: "no", header: "Receipt", render: (g) => <CellStack primary={g.grn_number} secondary={`${g.supplier?.name ?? "—"}${g.invoice_no ? ` · inv ${g.invoice_no}` : ""}`} href={`/admin/purchasing/grn/${g.id}`} /> },
              { key: "status", header: "Status", render: (g) => <StatusPill tone={GRN_TONE[g.status] ?? "neutral"}>{g.status}</StatusPill> },
              { key: "pay", header: "Payment", hideBelow: "sm", render: (g) => (g.status === "posted" ? <StatusPill tone={PAY_TONE[g.payment_status] ?? "neutral"}>{g.payment_status}</StatusPill> : <span className="text-xs text-ink-4">—</span>) },
              { key: "when", header: "Received", hideBelow: "md", render: (g) => <span className="text-xs text-ink-2">{formatDateTime(g.received_at)}</span> },
              { key: "total", header: "Total", align: "right", render: (g) => <span className="tabular font-semibold">{rupees(g.total)}</span> },
              { key: "act", header: "", align: "right", render: (g) => <RowLink href={`/admin/purchasing/grn/${g.id}`}>Open</RowLink> },
            ]} />
        </Panel>
      )}
    </>
  );
}
