"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Search, PackageCheck, Banknote, Lock, Scale } from "lucide-react";
import { Panel } from "@/components/admin/kit";
import { btn } from "@/components/admin/care/shared";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { savePurchaseOrderAction, saveGoodsReceiptAction, postGoodsReceiptAction, recordSupplierPaymentAction, setPurchaseOrderStatusAction, searchPurchasableProductsAction, type DocLineInput, type PurchasablePick } from "@/lib/actions/finance";
import { cn, formatINR, formatDateTime } from "@/lib/utils";

export type DocKind = "po" | "grn";
export type SupplierOption = { id: string; name: string };
export type DocLine = DocLineInput & { key: string; name: string; pack_label: string | null; loose: boolean; stock_pool_id?: string | null };
export type DocHead = { id: string | null; number?: string; status: string; supplier_id: string; discount: number; freight: number; other_costs: number; notes: string; expected_at: string; invoice_no: string; received_at: string; po_id: string | null; weighbridge_slip_no: string; vehicle_no: string; gross_weight_kg: string; tare_weight_kg: string; paid_amount?: number; total?: number; payment_status?: string; posted_at?: string | null; received_by_name?: string | null };
type PaymentRow = { id: string; amount: number; reference: string | null; paid_by_name: string | null; paid_at: string };

const UNIT_LABEL: Record<DocLine["unit"], string> = { pack: "packs", carton: "cartons", kg: "kg", g: "g" };
const n2 = (v: number) => Math.round(v * 100) / 100;
const n3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * One editor for purchase orders and goods receipts: supplier and document costs on top, lines with the
 * unit they were bought in (packs, cartons of N packs, kg or g for loose produce), live totals. A receipt
 * is saved as a draft and then posted in one explicit step, which is the moment stock and costs move.
 */
export function DocEditor({ kind, initial, lines: initialLines, suppliers, payments = [] }: { kind: DocKind; initial: DocHead; lines: DocLine[]; suppliers: SupplierOption[]; payments?: PaymentRow[] }) {
  const router = useRouter();
  const [head, setHead] = React.useState(initial);
  const [lines, setLines] = React.useState<DocLine[]>(initialLines);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [postOpen, setPostOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [pay, setPay] = React.useState({ amount: "", reference: "", note: "" });
  const locked = kind === "grn" ? head.status !== "draft" : !["draft", "ordered"].includes(head.status);
  const isNew = !head.id;

  const lineTotal = (l: DocLine) => n2(l.qty * l.unit_price - (l.discount ?? 0));
  const subtotal = n2(lines.reduce((a, l) => a + lineTotal(l), 0));
  const total = n2(subtotal - head.discount + head.freight + head.other_costs);
  const baseQty = (l: DocLine) => (l.unit === "carton" ? l.qty * (l.units_per_carton ?? 0) : l.unit === "kg" ? l.qty * 1000 : l.qty);
  const landed = (l: DocLine) => { const base = baseQty(l); if (!base) return null; const share = subtotal > 0 ? (head.freight + head.other_costs - head.discount) * lineTotal(l) / subtotal : 0; return l.loose ? (lineTotal(l) + share) / (base / 1000) : (lineTotal(l) + share) / base; };

  const looseKg = n3(lines.filter((l) => l.loose).reduce((a, l) => a + baseQty(l), 0) / 1000);
  const gross = head.gross_weight_kg === "" ? null : Number(head.gross_weight_kg);
  const tare = head.tare_weight_kg === "" ? null : Number(head.tare_weight_kg);
  const netKg = gross != null && tare != null && Number.isFinite(gross) && Number.isFinite(tare) ? n3(gross - tare) : null;
  const hasSlip = Boolean(head.weighbridge_slip_no || head.vehicle_no || head.gross_weight_kg !== "" || head.tare_weight_kg !== "");

  const setLine = (key: string, patch: Partial<DocLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addProduct = (p: PurchasablePick) => {
    if (lines.some((l) => l.product_id === p.id)) { toast.info("Already on this document"); return; }
    setLines((ls) => [...ls, { key: crypto.randomUUID(), product_id: p.id, name: p.name, pack_label: p.pack_label, loose: p.loose, qty: 1, unit: p.loose ? "kg" : "pack", units_per_carton: null, unit_price: 0, discount: 0, batch_no: "", expiry_date: "" }]);
  };

  const save = async (status?: "draft" | "ordered") => {
    if (busy) return;
    if (!head.supplier_id) { toast.error("Choose a supplier"); return; }
    if (!lines.length) { toast.error("Add at least one line"); return; }
    setBusy("save");
    try {
      const payload = lines.map((l) => ({ product_id: l.product_id, qty: Number(l.qty), unit: l.unit, units_per_carton: l.unit === "carton" ? Number(l.units_per_carton) || null : null, unit_price: Number(l.unit_price), discount: Number(l.discount ?? 0), batch_no: l.batch_no || undefined, expiry_date: l.expiry_date || undefined, po_line_id: l.po_line_id ?? null }));
      const headInput = { supplier_id: head.supplier_id, discount: head.discount, freight: head.freight, other_costs: head.other_costs, notes: head.notes, expected_at: head.expected_at || null, invoice_no: head.invoice_no || null, po_id: head.po_id, received_at: head.received_at || null,
        weighbridge_slip_no: head.weighbridge_slip_no || null, vehicle_no: head.vehicle_no || null, gross_weight_kg: head.gross_weight_kg === "" ? null : Number(head.gross_weight_kg), tare_weight_kg: head.tare_weight_kg === "" ? null : Number(head.tare_weight_kg) };
      const r = kind === "po" ? await savePurchaseOrderAction(head.id, headInput, payload, status ?? (head.status === "ordered" ? "ordered" : "draft")) : await saveGoodsReceiptAction(head.id, headInput, payload);
      if (!r.ok) { toast.error("Not saved", r.error); return null; }
      toast.success(kind === "po" ? (status === "ordered" ? "Purchase order sent" : "Purchase order saved") : "Receipt saved as draft");
      if (isNew) router.replace(`/admin/purchasing/${kind}/${r.data.id}`); else router.refresh();
      return r.data.id;
    } finally { setBusy(null); }
  };

  const post = async () => {
    if (busy) return;
    setBusy("post");
    try {
      const id = head.id ?? (await save());
      if (!id) return;
      const r = await postGoodsReceiptAction(id);
      if (!r.ok) { toast.error("Not posted", r.error); return; }
      toast.success(r.data.already ? "Already posted" : "Stock received", r.data.already ? undefined : `${r.data.lines} lines · costs updated`);
      setPostOpen(false); router.refresh();
    } finally { setBusy(null); }
  };

  const recordPayment = async () => {
    if (busy || !head.id) return;
    setBusy("pay");
    try {
      const r = await recordSupplierPaymentAction(head.id, Number(pay.amount), pay.reference, pay.note);
      if (!r.ok) { toast.error("Not recorded", r.error); return; }
      toast.success("Payment recorded", r.data.due > 0 ? `${formatINR(r.data.due)} still due` : "Fully paid");
      setPayOpen(false); setPay({ amount: "", reference: "", note: "" }); router.refresh();
    } finally { setBusy(null); }
  };

  const due = n2((head.total ?? total) - (head.paid_amount ?? 0));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Panel title={kind === "po" ? "Order details" : "Receipt details"} description={locked ? "Posted documents are history and cannot change." : "What was bought, from whom, and the costs on top of the lines."}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Supplier" required options={suppliers.map((s) => ({ value: s.id, label: s.name }))} placeholder="Choose a supplier" value={head.supplier_id} disabled={locked} onChange={(e) => setHead({ ...head, supplier_id: e.target.value })} />
            {kind === "po"
              ? <Input label="Expected on" type="date" value={head.expected_at} disabled={locked} onChange={(e) => setHead({ ...head, expected_at: e.target.value })} />
              : <Input label="Supplier invoice no." value={head.invoice_no} disabled={locked} onChange={(e) => setHead({ ...head, invoice_no: e.target.value })} />}
            <Input label="Discount on the whole bill (₹)" type="number" inputMode="decimal" min={0} step="0.01" value={head.discount} disabled={locked} onChange={(e) => setHead({ ...head, discount: Number(e.target.value) || 0 })} />
            <Input label="Freight / transport (₹)" type="number" inputMode="decimal" min={0} step="0.01" value={head.freight} disabled={locked} onChange={(e) => setHead({ ...head, freight: Number(e.target.value) || 0 })} hint="Spread over the lines by value when costs are worked out." />
            <Input label="Other costs (₹)" type="number" inputMode="decimal" min={0} step="0.01" value={head.other_costs} disabled={locked} onChange={(e) => setHead({ ...head, other_costs: Number(e.target.value) || 0 })} hint="Loading, packing material, etc." />
            {kind === "grn" ? <Input label="Received on" type="datetime-local" value={head.received_at} disabled={locked} onChange={(e) => setHead({ ...head, received_at: e.target.value })} hint="Leave empty for now." /> : null}
          </div>
          <Textarea label="Notes" className="mt-3" value={head.notes} disabled={locked} onChange={(e) => setHead({ ...head, notes: e.target.value })} />
        </Panel>

        {kind === "grn" && (!locked || hasSlip) ? (
          <Panel title="Weighbridge slip" description={locked ? "As recorded when the goods were received." : "For loads bought by weight (dharam kanta). Optional: the slip's serial number, the vehicle, and the two weighings. The net weight is worked out and compared with the loose-produce kg on the lines."}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Input label="Slip serial no." value={head.weighbridge_slip_no} disabled={locked} onChange={(e) => setHead({ ...head, weighbridge_slip_no: e.target.value })} placeholder="e.g. 4521" maxLength={40} />
              <Input label="Vehicle no." value={head.vehicle_no} disabled={locked} onChange={(e) => setHead({ ...head, vehicle_no: e.target.value.toUpperCase() })} placeholder="RJ 21 GA 1234" maxLength={20} className="uppercase" />
              <Input label="Gross weight (kg)" type="number" inputMode="decimal" min={0} step="0.001" value={head.gross_weight_kg} disabled={locked} onChange={(e) => setHead({ ...head, gross_weight_kg: e.target.value })} hint="Loaded vehicle" />
              <Input label="Tare weight (kg)" type="number" inputMode="decimal" min={0} step="0.001" value={head.tare_weight_kg} disabled={locked} onChange={(e) => setHead({ ...head, tare_weight_kg: e.target.value })} hint="Empty vehicle" />
            </div>
            {netKg != null ? (
              <p className={cn("mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-3 py-2 text-sm", netKg < 0 ? "bg-danger-50 text-danger" : "bg-surface text-ink-2")}>
                <span><Scale className="mr-1 inline h-4 w-4" aria-hidden />Net weight <strong className="tabular text-ink">{netKg.toFixed(3)} kg</strong></span>
                {netKg < 0 ? <span>Tare is more than gross; check the two weights.</span> : looseKg > 0 ? (
                  <span>Lines (loose produce) <strong className="tabular text-ink">{looseKg.toFixed(3)} kg</strong> · difference <strong className={cn("tabular", Math.abs(netKg - looseKg) > Math.max(0.5, looseKg * 0.01) ? "text-warning" : "text-success")}>{(looseKg - netKg) >= 0 ? "+" : "−"}{Math.abs(looseKg - netKg).toFixed(3)} kg</strong>{Math.abs(netKg - looseKg) > Math.max(0.5, looseKg * 0.01) ? " — lines and slip disagree by more than 1%; the lines are what goes into stock." : ""}</span>
                ) : <span>No loose-produce lines to compare yet.</span>}
              </p>
            ) : null}
          </Panel>
        ) : null}

        <Panel title="Lines" description="Enter quantities in the unit you bought: packs, cartons (with packs per carton), or kg / g for loose produce." flush
          actions={!locked ? <ProductSearch onPick={addProduct} /> : null}>
          {lines.length === 0 ? <p className="px-4 py-6 text-center text-sm text-ink-3">No lines yet. Search a product above to add it.</p> : (
            <ul className="divide-y divide-line border-t border-line">
              {lines.map((l) => {
                const lc = landed(l);
                return (
                  <li key={l.key} className="px-4 py-3 sm:px-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-semibold text-ink">{l.name} <span className="font-normal text-ink-3">{l.pack_label ?? ""}</span>{l.loose ? <Badge tone="info" size="xs" className="ml-1.5">loose · by weight</Badge> : null}</p>
                      {!locked ? <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="tap flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-danger-50 hover:text-danger" aria-label={`Remove ${l.name}`}><Trash2 className="h-4 w-4" /></button> : null}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      <Input label="Quantity" type="number" inputMode="decimal" min={0} step={l.loose ? "0.001" : "1"} value={l.qty} disabled={locked} onChange={(e) => setLine(l.key, { qty: Number(e.target.value) })} />
                      <Select label="Unit" options={(l.loose ? ["kg", "g"] : ["pack", "carton"]).map((u) => ({ value: u, label: UNIT_LABEL[u as DocLine["unit"]] }))} value={l.unit} disabled={locked} onChange={(e) => setLine(l.key, { unit: e.target.value as DocLine["unit"] })} />
                      {l.unit === "carton" ? <Input label="Packs per carton" type="number" inputMode="numeric" min={1} value={l.units_per_carton ?? ""} disabled={locked} onChange={(e) => setLine(l.key, { units_per_carton: Number(e.target.value) || null })} /> : null}
                      <Input label={`Price per ${l.unit === "carton" ? "carton" : l.unit === "pack" ? "pack" : l.unit} (₹)`} type="number" inputMode="decimal" min={0} step="0.01" value={l.unit_price} disabled={locked} onChange={(e) => setLine(l.key, { unit_price: Number(e.target.value) })} />
                      <Input label="Line discount (₹)" type="number" inputMode="decimal" min={0} step="0.01" value={l.discount ?? 0} disabled={locked} onChange={(e) => setLine(l.key, { discount: Number(e.target.value) || 0 })} />
                      {kind === "grn" ? <><Input label="Batch" value={l.batch_no ?? ""} disabled={locked} onChange={(e) => setLine(l.key, { batch_no: e.target.value })} /><Input label="Expiry" type="date" value={l.expiry_date ?? ""} disabled={locked} onChange={(e) => setLine(l.key, { expiry_date: e.target.value })} /></> : null}
                    </div>
                    <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-3">
                      <span>= {baseQty(l) ? `${l.loose ? (baseQty(l) / 1000).toFixed(3) + " kg" : baseQty(l) + " packs"}` : "—"}</span>
                      <span>Line total <strong className="text-ink">{formatINR(lineTotal(l), { precise: true })}</strong></span>
                      {lc != null ? <span>Landed cost <strong className="text-ink">{formatINR(lc, { precise: true })}</strong> per {l.loose ? "kg" : "pack"}{l.loose && l.pack_label ? ` (≈ ${formatINR(lc * packGramsOf(l) / 1000, { precise: true })} per ${l.pack_label})` : ""}</span> : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <aside className="space-y-4">
        <Panel title="Totals">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-ink-3">Lines</dt><dd className="tabular">{formatINR(subtotal, { precise: true })}</dd></div>
            {head.discount ? <div className="flex justify-between"><dt className="text-ink-3">Bill discount</dt><dd className="tabular">− {formatINR(head.discount, { precise: true })}</dd></div> : null}
            {head.freight ? <div className="flex justify-between"><dt className="text-ink-3">Freight</dt><dd className="tabular">{formatINR(head.freight, { precise: true })}</dd></div> : null}
            {head.other_costs ? <div className="flex justify-between"><dt className="text-ink-3">Other</dt><dd className="tabular">{formatINR(head.other_costs, { precise: true })}</dd></div> : null}
            <div className="flex justify-between border-t border-line pt-1.5 font-bold"><dt>Total</dt><dd className="tabular">{formatINR(total, { precise: true })}</dd></div>
          </dl>
          {!locked ? (
            <div className="mt-4 flex flex-col gap-2">
              {kind === "po" ? <>
                <Button loading={busy === "save"} disabled={busy !== null} onClick={() => save("ordered")}>{head.status === "ordered" ? "Save changes" : "Save and mark ordered"}</Button>
                {head.status !== "ordered" ? <Button variant="outline" loading={busy === "save"} disabled={busy !== null} onClick={() => save("draft")}>Save as draft</Button> : null}
              </> : <>
                <Button loading={busy === "post"} disabled={busy !== null || !lines.length} onClick={() => setPostOpen(true)}><PackageCheck className="h-4 w-4" /> Post receipt (stock in)</Button>
                <Button variant="outline" loading={busy === "save"} disabled={busy !== null} onClick={() => save()}>Save draft</Button>
              </>}
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3"><Lock className="h-3.5 w-3.5" aria-hidden />{kind === "grn" ? `Posted ${head.posted_at ? formatDateTime(head.posted_at) : ""}${head.received_by_name ? ` by ${head.received_by_name}` : ""}` : `Status: ${head.status.replace("_", " ")}`}</p>
          )}
          {kind === "po" && head.id && ["draft", "ordered", "partially_received"].includes(head.status) ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              <a href={`/admin/purchasing/grn/new?po=${head.id}`} className={cn(btn.secondary, btn.small)}>Receive goods against this order</a>
              <button type="button" className={cn(btn.dangerOutline, btn.small)} onClick={async () => { const r = await setPurchaseOrderStatusAction(head.id!, "cancelled"); if (!r.ok) toast.error(r.error); else { toast.success("Purchase order cancelled"); router.refresh(); } }}>Cancel order</button>
            </div>
          ) : null}
        </Panel>

        {kind === "grn" && head.id && head.status === "posted" ? (
          <Panel title="Supplier payment" description="Separate from receiving the goods: a posted receipt can still be unpaid." flush>
            <div className="px-4 py-3 sm:px-5">
              <dl className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-md bg-surface p-2"><dt className="text-[11px] text-ink-3">Bill</dt><dd className="font-bold tabular">{formatINR(head.total ?? total)}</dd></div>
                <div className="rounded-md bg-surface p-2"><dt className="text-[11px] text-ink-3">Paid</dt><dd className="font-bold tabular">{formatINR(head.paid_amount ?? 0)}</dd></div>
                <div className={cn("rounded-md p-2", due > 0 ? "bg-[#fff6dc]" : "bg-success-50")}><dt className="text-[11px] text-ink-3">Due</dt><dd className="font-bold tabular">{formatINR(due)}</dd></div>
              </dl>
              {due > 0 ? <Button size="sm" className="mt-3" onClick={() => { setPay({ amount: String(due), reference: "", note: "" }); setPayOpen(true); }}><Banknote className="h-4 w-4" /> Record payment</Button> : <p className="mt-2 text-xs font-semibold text-success">Fully paid</p>}
            </div>
            {payments.length ? <ul className="divide-y divide-line border-t border-line text-xs">{payments.map((p) => <li key={p.id} className="flex justify-between px-4 py-2 sm:px-5"><span className="text-ink-3">{formatDateTime(p.paid_at)}{p.reference ? ` · ${p.reference}` : ""}{p.paid_by_name ? ` · ${p.paid_by_name}` : ""}</span><span className="tabular font-semibold">{formatINR(p.amount)}</span></li>)}</ul> : null}
          </Panel>
        ) : null}
      </aside>

      <ConfirmDialog open={postOpen} onClose={() => (busy ? undefined : setPostOpen(false))} onConfirm={post} loading={busy === "post"} title="Post this receipt?" confirmLabel="Post · stock in"
        description={`${lines.length} lines for ${formatINR(total, { precise: true })} go into stock now and update each product's cost (moving average). A posted receipt cannot be edited; a mistake is corrected with a stock adjustment.`} />
      <Modal open={payOpen} onClose={() => (busy ? undefined : setPayOpen(false))} title="Record a supplier payment" size="sm"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={busy !== null} onClick={() => setPayOpen(false)}>Cancel</Button><Button className="flex-1" loading={busy === "pay"} onClick={recordPayment}>Record</Button></div>}>
        <div className="space-y-3">
          <Input label="Amount (₹)" type="number" inputMode="decimal" min={0} step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} hint={`Due ${formatINR(due)}`} />
          <Input label="Reference (UPI / cheque / cash)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
          <Input label="Note" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

function packGramsOf(l: DocLine) { const m = (l.pack_label ?? "").match(/([\d.]+)\s*(kg|g)/i); if (!m) return 0; return m[2].toLowerCase() === "kg" ? Number(m[1]) * 1000 : Number(m[1]); }

/** Product search for the document; the server says whether a product is loose produce (bought by weight). */
function ProductSearch({ onPick }: { onPick: (p: PurchasablePick) => void }) {
  const [q, setQ] = React.useState("");
  const term = useDebouncedValue(q, 250);
  const [results, setResults] = React.useState<PurchasablePick[] | null>(null);
  const [resultsFor, setResultsFor] = React.useState("");
  const shown = term.trim().length >= 2 && resultsFor === term ? results : null;
  React.useEffect(() => {
    if (term.trim().length < 2) return;
    let on = true;
    searchPurchasableProductsAction(term).then((r) => { if (!on || !r.ok) return; setResults(r.data); setResultsFor(term); });
    return () => { on = false; };
  }, [term]);
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" aria-hidden />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a product…" aria-label="Search products to add" className="h-9 w-full rounded-lg border border-line-2 bg-card pl-8 pr-2 text-sm text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none" />
      {shown ? (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-line bg-card shadow-float">
          {shown.length === 0 ? <li className="px-3 py-2 text-xs text-ink-3">No products match.</li> : shown.map((p) => (
            <li key={p.id}><button type="button" onClick={() => { onPick(p); setQ(""); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface"><Plus className="h-3.5 w-3.5 text-brand-700" aria-hidden /><span className="min-w-0 flex-1 truncate">{p.name} <span className="text-ink-3">{p.pack_label ?? ""}</span></span>{p.loose ? <Badge tone="info" size="xs">loose</Badge> : null}{!p.listed ? <Badge tone="warning" size="xs">not listed</Badge> : null}</button></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
