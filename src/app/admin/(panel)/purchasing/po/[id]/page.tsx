import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/kit";
import { DocEditor, type DocHead, type DocLine, type SupplierOption } from "@/components/admin/finance/doc-editor";

export const metadata: Metadata = { title: "Purchase order" };
export const dynamic = "force-dynamic";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = supabase as any;
  const { data: sups } = await any.from("suppliers").select("id, name").eq("is_active", true).order("name");
  const suppliers = (sups ?? []) as SupplierOption[];
  if (id === "new") {
    const head: DocHead = { id: null, status: "draft", supplier_id: suppliers[0]?.id ?? "", discount: 0, freight: 0, other_costs: 0, notes: "", expected_at: "", invoice_no: "", received_at: "", po_id: null, weighbridge_slip_no: "", vehicle_no: "", gross_weight_kg: "", tare_weight_kg: "" };
    return <><AdminPageHeader back="/admin/purchasing?tab=po" title="New purchase order" description="What you are asking a supplier for. Receive the goods later against this order." /><DocEditor kind="po" initial={head} lines={[]} suppliers={suppliers} /></>;
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ data: po }, { data: lines }] = await Promise.all([
    any.from("purchase_orders").select("*").eq("id", id).maybeSingle(),
    any.from("purchase_order_lines").select("id, product_id, qty, unit, units_per_carton, unit_price, discount, received_base_qty, product:products(name, pack_label, stock_pool_id)").eq("po_id", id).order("created_at"),
  ]);
  if (!po) notFound();
  type L = { id: string; product_id: string; qty: number; unit: DocLine["unit"]; units_per_carton: number | null; unit_price: number; discount: number; product: { name: string; pack_label: string | null; stock_pool_id: string | null } | null };
  const head: DocHead = { id: po.id, number: po.po_number, status: po.status, supplier_id: po.supplier_id, discount: Number(po.discount), freight: Number(po.freight), other_costs: Number(po.other_costs), notes: po.notes ?? "", expected_at: po.expected_at ?? "", invoice_no: "", received_at: "", po_id: null, weighbridge_slip_no: "", vehicle_no: "", gross_weight_kg: "", tare_weight_kg: "", total: Number(po.total) };
  const docLines: DocLine[] = ((lines ?? []) as L[]).map((l) => ({ key: l.id, po_line_id: l.id, product_id: l.product_id, name: l.product?.name ?? "Product", pack_label: l.product?.pack_label ?? null, loose: Boolean(l.product?.stock_pool_id), qty: Number(l.qty), unit: l.unit, units_per_carton: l.units_per_carton, unit_price: Number(l.unit_price), discount: Number(l.discount) }));
  return <><AdminPageHeader back="/admin/purchasing?tab=po" title={po.po_number} description={`Purchase order · ${String(po.status).replace("_", " ")}${po.created_by_name ? ` · by ${po.created_by_name}` : ""}`} /><DocEditor kind="po" initial={head} lines={docLines} suppliers={suppliers} /></>;
}
