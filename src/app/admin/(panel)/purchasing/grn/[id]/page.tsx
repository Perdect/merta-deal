import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/kit";
import { DocEditor, type DocHead, type DocLine, type SupplierOption } from "@/components/admin/finance/doc-editor";

export const metadata: Metadata = { title: "Goods receipt" };
export const dynamic = "force-dynamic";

/** A receipt: draft until posted. "new?po=<id>" pre-fills the lines still outstanding on a purchase order. */
export default async function GoodsReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ po?: string }> }) {
  const { id } = await params; const { po: poParam } = await searchParams;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = supabase as any;
  const { data: sups } = await any.from("suppliers").select("id, name").eq("is_active", true).order("name");
  const suppliers = (sups ?? []) as SupplierOption[];
  type L = { id: string; po_line_id?: string | null; product_id: string; qty: number; unit: DocLine["unit"]; units_per_carton: number | null; unit_price?: number; unit_cost?: number; discount: number; batch_no?: string | null; expiry_date?: string | null; received_base_qty?: number; product: { name: string; pack_label: string | null; stock_pool_id: string | null } | null };
  const toLine = (l: L): DocLine => ({ key: l.id, po_line_id: l.po_line_id ?? null, product_id: l.product_id, name: l.product?.name ?? "Product", pack_label: l.product?.pack_label ?? null, loose: Boolean(l.product?.stock_pool_id), qty: Number(l.qty), unit: l.unit, units_per_carton: l.units_per_carton, unit_price: Number(l.unit_cost ?? l.unit_price ?? 0), discount: Number(l.discount), batch_no: l.batch_no ?? "", expiry_date: l.expiry_date ?? "" });

  if (id === "new") {
    let head: DocHead = { id: null, status: "draft", supplier_id: suppliers[0]?.id ?? "", discount: 0, freight: 0, other_costs: 0, notes: "", expected_at: "", invoice_no: "", received_at: "", po_id: null };
    let lines: DocLine[] = [];
    if (poParam && /^[0-9a-f-]{36}$/.test(poParam)) {
      const [{ data: po }, { data: pl }] = await Promise.all([any.from("purchase_orders").select("id, supplier_id, discount, freight, other_costs").eq("id", poParam).maybeSingle(), any.from("purchase_order_lines").select("id, product_id, qty, unit, units_per_carton, unit_price, discount, received_base_qty, product:products(name, pack_label, stock_pool_id)").eq("po_id", poParam)]);
      if (po) {
        head = { ...head, supplier_id: po.supplier_id, po_id: po.id, freight: Number(po.freight), other_costs: Number(po.other_costs), discount: Number(po.discount) };
        lines = ((pl ?? []) as L[]).map((l) => ({ ...toLine(l), key: `po-${l.id}`, po_line_id: l.id }));
      }
    }
    return <><AdminPageHeader back="/admin/purchasing" title="Receive goods" description="Count what arrived and the price paid. Nothing moves until you post." /><DocEditor kind="grn" initial={head} lines={lines} suppliers={suppliers} /></>;
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ data: g }, { data: lines }, { data: pays }] = await Promise.all([
    any.from("goods_receipts").select("*").eq("id", id).maybeSingle(),
    any.from("goods_receipt_lines").select("id, po_line_id, product_id, qty, unit, units_per_carton, unit_cost, discount, batch_no, expiry_date, landed_unit_cost, product:products(name, pack_label, stock_pool_id)").eq("grn_id", id).order("created_at"),
    any.from("supplier_payments").select("id, amount, reference, paid_by_name, paid_at").eq("grn_id", id).order("paid_at", { ascending: false }),
  ]);
  if (!g) notFound();
  const head: DocHead = { id: g.id, number: g.grn_number, status: g.status, supplier_id: g.supplier_id, discount: Number(g.discount), freight: Number(g.freight), other_costs: Number(g.other_costs), notes: g.notes ?? "", expected_at: "", invoice_no: g.invoice_no ?? "", received_at: g.received_at ? new Date(new Date(g.received_at).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 16) : "", po_id: g.po_id, paid_amount: Number(g.paid_amount), total: Number(g.total), payment_status: g.payment_status, posted_at: g.posted_at, received_by_name: g.received_by_name };
  return <><AdminPageHeader back="/admin/purchasing" title={g.grn_number} description={`Goods receipt · ${g.status}`} /><DocEditor kind="grn" initial={head} lines={((lines ?? []) as L[]).map(toLine)} suppliers={suppliers} payments={pays ?? []} /></>;
}
