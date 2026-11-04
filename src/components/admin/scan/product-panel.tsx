"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowDownToLine, Barcode, ExternalLink, History, Printer, Scale, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { BottomSheet, ConfirmDialog } from "@/components/ui/overlay";
import { Alert, LoadingState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { ProductImage } from "@/components/shop/product-image";
import { setBarcodeAction, setStockModeAction, stockHistoryAction } from "@/lib/actions/scan";
import type { ScanProduct, StockActionKind, StockHistoryRow, StockInput, StockUnit } from "@/lib/scan/types";
import { formatGrams, formatPacks, toBaseQuantity, REASON_LABEL } from "@/lib/scan/format";
import { cn, formatINR, formatDateTime, timeAgo } from "@/lib/utils";
import { newKey } from "./shared";

export type StockOutcome = { status: "saved"; replayed: boolean } | { status: "pending" } | { status: "failed"; error: string };

const ACTIONS: { kind: StockActionKind; label: string; icon: typeof ArrowDownToLine; tone: string }[] = [
  { kind: "receive", label: "Receive stock", icon: ArrowDownToLine, tone: "border-brand-200 bg-brand-50 text-brand-800" },
  { kind: "wastage", label: "Wastage / damage", icon: Trash2, tone: "border-danger/30 bg-danger-50 text-danger" },
  { kind: "adjust", label: "Adjust stock", icon: SlidersHorizontal, tone: "border-line-2 bg-card text-ink" },
];
const REASONS: Record<StockActionKind, string[]> = {
  receive: ["Stock received", "Supplier delivery", "Stock count", "Returned from a cancelled order"],
  wastage: ["Spoiled", "Damaged", "Expired", "Unsellable return"],
  adjust: ["Stock count correction", "Found extra stock", "Misplaced or lost", "Entry mistake"],
};

/**
 * What a scanned product label opens: the size that was scanned, its price and stock (shared grams for
 * loose produce, packs for prepacked), its sibling sizes, and the stock actions. Every action collects
 * quantity + unit, then shows exactly what will change and asks for confirmation.
 */
export function ProductPanel({ product: p, siteUrl, onProduct, onPickVariant, submitStock, captured, onCapture }: {
  product: ScanProduct; siteUrl: string; onProduct: (p: ScanProduct) => void; onPickVariant: (id: string) => void;
  submitStock: (input: StockInput) => Promise<StockOutcome>;
  /** A code read by the camera while the barcode field asked for one. */ captured: string | null; onCapture: (on: boolean) => void;
}) {
  const [action, setAction] = React.useState<StockActionKind | null>(null);
  const [history, setHistory] = React.useState(false);
  const loose = p.stock_mode === "loose";
  const price = p.selling_price != null ? Number(p.selling_price) : null;
  const mrp = p.mrp != null ? Number(p.mrp) : null;
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <ProductImage image={p.image_url} productName={p.name} brand={p.brand_name} packSize={p.pack_label} className="h-20 w-20 shrink-0" rounded="rounded-xl" sizes="80px" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{p.brand_name ?? "Product"}</p>
          <h2 className="font-display text-lg font-bold leading-tight text-ink">{p.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold text-ink">{p.pack_label ?? `${p.weight_value} ${p.weight_unit}`}</span>
            {price != null ? <span className="tabular font-bold text-ink">{formatINR(price)}{mrp != null && mrp > price ? <span className="ml-1 text-xs font-normal text-ink-3 line-through">{formatINR(mrp)}</span> : null}</span> : <Badge tone="warning" size="xs">No price yet</Badge>}
            {!p.is_active || !p.listing_active ? <Badge tone="neutral" size="xs">Hidden from customers</Badge> : null}
          </p>
          <p className="mt-1 font-mono text-[11px] text-ink-3">SKU {p.sku}{p.barcode ? ` · EAN ${p.barcode}` : ""}</p>
        </div>
      </div>

      {p.variants.length > 1 ? (
        <div role="radiogroup" aria-label="Pack size" className="flex flex-wrap gap-1.5">
          {p.variants.map((v) => (
            <button key={v.id} type="button" role="radio" aria-checked={v.selected} onClick={() => !v.selected && onPickVariant(v.id)}
              className={cn("tap h-10 rounded-lg border px-3 text-sm font-semibold", v.selected ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line-2 bg-card text-ink-2")}>
              {v.pack_label ?? "?"}<span className="ml-1.5 text-xs font-normal text-ink-3">{v.selling_price != null ? formatINR(Number(v.selling_price)) : "no price"}</span>
            </button>
          ))}
        </div>
      ) : null}

      <StockFacts p={p} />

      {!p.listed ? (
        <Alert tone="warning" title="Not on sale yet">This product has no price or stock record, so stock cannot be changed here. <Link href={`/admin/products/${p.id}#listing`} className="font-semibold underline">Add its price and stock</Link> first.</Alert>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.map((a) => (
            <button key={a.kind} type="button" onClick={() => setAction(a.kind)} className={cn("tap flex min-h-16 flex-col items-start justify-center gap-1 rounded-xl border px-3 py-2 text-left text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-brand-600", a.tone)}>
              <a.icon className="h-5 w-5" aria-hidden />{a.label}
            </button>
          ))}
          <button type="button" onClick={() => setHistory(true)} className="tap flex min-h-16 flex-col items-start justify-center gap-1 rounded-xl border border-line-2 bg-card px-3 py-2 text-left text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-brand-600">
            <History className="h-5 w-5" aria-hidden />View history
          </button>
        </div>
      )}

      <IdentityRow p={p} siteUrl={siteUrl} onProduct={onProduct} captured={captured} onCapture={onCapture} />

      {action ? <StockSheet key={action} p={p} action={action} onClose={() => setAction(null)} submit={submitStock} /> : null}
      <HistorySheet open={history} onClose={() => setHistory(false)} productId={p.id} loose={loose} />
    </div>
  );
}

function StockFacts({ p }: { p: ScanProduct }) {
  if (!p.listed) return null;
  const low = p.stock_status === "low_stock";
  if (p.stock_mode === "loose" && p.pool) {
    return (
      <dl className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
        <div className="col-span-2 flex items-center gap-1.5 text-xs font-semibold text-ink-3"><Scale className="h-3.5 w-3.5" aria-hidden />Loose produce · one balance shared by every size of {p.pool.name}</div>
        <div><dt className="text-xs text-ink-3">Available (shared)</dt><dd className={cn("text-lg font-bold tabular", p.pool.balance_g === 0 ? "text-danger" : low ? "text-saffron-700" : "text-ink")}>{formatGrams(p.pool.balance_g)}</dd></div>
        <div><dt className="text-xs text-ink-3">Reserved in open orders</dt><dd className="text-lg font-bold tabular text-ink">{formatGrams(p.pool.reserved_g)}</dd></div>
        <div className="col-span-2 text-xs text-ink-2">This size ({p.pack_label}) can fill <strong className="tabular">{formatPacks(p.available_packs)}</strong> from that balance.</div>
      </dl>
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
      <div className="col-span-2 text-xs font-semibold text-ink-3">Prepacked · counted in packs of {p.pack_label}</div>
      <div><dt className="text-xs text-ink-3">Available</dt><dd className={cn("text-lg font-bold tabular", p.available_packs === 0 ? "text-danger" : low ? "text-saffron-700" : "text-ink")}>{formatPacks(p.available_packs)}</dd></div>
      <div><dt className="text-xs text-ink-3">Reserved in open orders</dt><dd className="text-lg font-bold tabular text-ink">{formatPacks(p.reserved_packs)}</dd></div>
    </dl>
  );
}

/** SKU / barcode / stock type / label, all editable here so a phone is enough on the shop floor. */
function IdentityRow({ p, siteUrl, onProduct, captured, onCapture }: { p: ScanProduct; siteUrl: string; onProduct: (p: ScanProduct) => void; captured: string | null; onCapture: (on: boolean) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [barcode, setBarcode] = React.useState(p.barcode ?? "");
  const [busy, setBusy] = React.useState(false);
  const [modeOpen, setModeOpen] = React.useState(false);
  const [seen, setSeen] = React.useState<string | null>(null);
  if (captured && captured !== seen) { setSeen(captured); if (editing) setBarcode(captured.replace(/\D/g, "")); }
  const stopCapture = () => onCapture(false);
  const save = async () => {
    setBusy(true);
    const r = await setBarcodeAction(p.id, barcode);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(barcode.trim() ? "Barcode saved" : "Barcode removed");
    onProduct(r.data); setEditing(false); stopCapture();
  };
  const switchMode = async () => {
    setBusy(true);
    const r = await setStockModeAction(p.id, p.stock_mode === "loose" ? "pack" : "loose");
    setBusy(false); setModeOpen(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.data.stock_mode === "loose" ? "Now shared stock in grams" : "Now counted in packs");
    onProduct(r.data);
  };
  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
        <span className="text-xs font-semibold text-ink-3">Stock type</span>
        <span className="font-semibold text-ink">{p.stock_mode === "loose" ? "Loose, shared grams" : "Prepacked, packs"}</span>
        {p.can_be_loose && p.listed ? <button type="button" onClick={() => setModeOpen(true)} className="tap text-xs font-semibold text-brand-700 underline">Change</button> : null}
        <span className="ml-auto flex gap-1">
          <a href={`/admin/print/labels?ids=${p.id}`} target="_blank" rel="noopener" className="tap inline-flex h-9 items-center gap-1 rounded-lg border border-line-2 px-2.5 text-xs font-semibold text-ink-2 hover:bg-surface-2"><Printer className="h-3.5 w-3.5" aria-hidden />Label</a>
          <Link href={`/admin/products/${p.id}`} className="tap inline-flex h-9 items-center gap-1 rounded-lg border border-line-2 px-2.5 text-xs font-semibold text-ink-2 hover:bg-surface-2"><ExternalLink className="h-3.5 w-3.5" aria-hidden />Product</Link>
        </span>
      </div>
      <div className="border-t border-line px-3 py-2.5 text-sm">
        {editing ? (
          <div className="space-y-2">
            <Input label="Printed barcode (EAN / UPC, 8 to 14 digits)" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, "").slice(0, 14))} inputMode="numeric" placeholder="8901234567890" autoFocus />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onCapture(true)}><Barcode className="h-4 w-4" />Scan it with the camera</Button>
              <Button size="sm" loading={busy} onClick={save}>Save</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setBarcode(p.barcode ?? ""); stopCapture(); }}>Cancel</Button>
            </div>
            <p className="text-xs text-ink-3">The label&rsquo;s QR then holds this barcode, so either the packet&rsquo;s own barcode or the label works.</p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Barcode className="h-4 w-4 text-ink-3" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{p.barcode ? <span className="font-mono">{p.barcode}</span> : <span className="text-ink-3">No printed barcode on file</span>}</span>
            <button type="button" onClick={() => setEditing(true)} className="tap text-xs font-semibold text-brand-700 underline">{p.barcode ? "Edit" : "Add"}</button>
          </div>
        )}
        <p className="mt-1.5 truncate font-mono text-[11px] text-ink-4">Label code {p.scan_code} · {siteUrl.replace(/^https?:\/\//, "")}/q/…</p>
      </div>
      <ConfirmDialog open={modeOpen} onClose={() => setModeOpen(false)} onConfirm={switchMode} loading={busy}
        title={p.stock_mode === "loose" ? "Count this size in packs instead?" : "Share this product's stock by weight?"}
        confirmLabel={p.stock_mode === "loose" ? "Count in packs" : "Share by weight"}
        description={p.stock_mode === "loose"
          ? <>{p.pack_label} of {p.name} leaves the shared balance with its current packs ({formatPacks(p.available_packs)} = {formatGrams(p.available_packs * p.pack_grams)}) and is counted on its own from now on.</>
          : <>All sizes of {p.name} will draw from one balance in grams. Its current {formatPacks(p.available_packs)} ({formatGrams(p.available_packs * p.pack_grams)}) are added to that balance, so nothing on the shelf changes.</>} />
      <PackedMismatch p={p} />
    </div>
  );
}

function PackedMismatch({ p }: { p: ScanProduct }) {
  if (p.stock_mode !== "pack" || !p.can_be_loose || p.variants.length < 2) return null;
  return <p className="border-t border-line px-3 py-2 text-xs text-ink-3">Each size of this product keeps its own pack count. For loose fruit and vegetables, switch the stock type to shared grams so 500 g and 1 kg draw from one balance.</p>;
}

/** Quantity + unit, then a plain-words confirmation. The request key is fixed when the sheet opens, so a retry can never apply twice. */
function StockSheet({ p, action, onClose, submit }: { p: ScanProduct; action: StockActionKind; onClose: () => void; submit: (input: StockInput) => Promise<StockOutcome> }) {
  const loose = p.stock_mode === "loose";
  const [key] = React.useState(newKey);
  const [qty, setQty] = React.useState("");
  const [unit, setUnit] = React.useState<StockUnit>(loose ? "kg" : "packs");
  const [direction, setDirection] = React.useState<"add" | "remove">("add");
  const [reason, setReason] = React.useState(REASONS[action][0]);
  const [other, setOther] = React.useState("");
  const [note, setNote] = React.useState("");
  const [step, setStep] = React.useState<"form" | "confirm">("form");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const qtyNum = Number(qty);
  const base = toBaseQuantity(qtyNum, unit);
  const reasonText = reason === "Other" ? other.trim() : reason;
  const sign = action === "receive" ? 1 : action === "wastage" ? -1 : direction === "add" ? 1 : -1;
  const before = loose ? (p.pool?.balance_g ?? 0) : p.available_packs;
  const after = base ? before + sign * base.value : before;
  const negative = after < 0;
  const title = { receive: "Receive stock", wastage: "Record wastage or damage", adjust: "Adjust stock" }[action];
  const verb = sign > 0 ? "Add" : "Remove";
  const canContinue = Boolean(base) && !negative && (action === "receive" || reasonText.length >= 3);

  const confirm = async () => {
    if (!base || busy) return;
    setBusy(true); setError(null);
    const r = await submit({ requestKey: key, productId: p.id, action, quantity: qtyNum, unit, direction: action === "adjust" ? direction : undefined, reason: reasonText || undefined, note: note.trim() || undefined });
    setBusy(false);
    if (r.status === "failed") { setError(r.error); setStep("form"); return; }
    onClose();
  };

  return (
    <BottomSheet open onClose={() => (busy ? undefined : onClose())} title={title} description={`${p.name} · ${p.pack_label ?? ""}${loose ? " · shared balance in grams" : " · counted in packs"}`}
      footer={step === "form"
        ? <Button size="lg" fullWidth disabled={!canContinue} onClick={() => setStep("confirm")}>Continue</Button>
        : <div className="flex gap-2"><Button size="lg" variant="outline" className="flex-1" disabled={busy} onClick={() => setStep("form")}>Back</Button><Button size="lg" className="flex-1" loading={busy} variant={sign < 0 ? "danger" : "primary"} onClick={confirm}>Confirm {verb.toLowerCase()}</Button></div>}>
      {step === "form" ? (
        <div className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {action === "adjust" ? (
            <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-2">
              {(["add", "remove"] as const).map((d) => <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)} className={cn("tap h-12 rounded-xl border text-sm font-bold capitalize", direction === d ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line-2 bg-card text-ink-2")}>{d}</button>)}
            </div>
          ) : null}
          <div>
            <label htmlFor="stock-qty" className="mb-1 block text-sm font-medium text-ink-2">{loose ? "Weight" : "Number of packs"}</label>
            <div className="flex gap-2">
              <input id="stock-qty" value={qty} onChange={(e) => setQty(e.target.value.replace(unit === "kg" ? /[^\d.]/g : /\D/g, ""))} inputMode={unit === "kg" ? "decimal" : "numeric"} placeholder="0" autoFocus
                className="h-14 min-w-0 flex-1 rounded-xl border border-line-2 bg-card px-4 text-2xl font-bold tabular text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
              {loose ? (
                <div role="radiogroup" aria-label="Unit" className="flex rounded-xl border border-line-2 p-1">
                  {(["kg", "g"] as const).map((u) => <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => { setUnit(u); setQty(""); }} className={cn("tap w-14 rounded-lg text-sm font-bold", unit === u ? "bg-brand-600 text-white" : "text-ink-2")}>{u}</button>)}
                </div>
              ) : <span className="flex h-14 items-center rounded-xl border border-line-2 bg-surface px-4 text-sm font-bold text-ink-2">packs</span>}
            </div>
            <p className="mt-1 text-xs text-ink-3">
              {qty && !base ? (unit === "packs" ? "Whole packs only." : unit === "kg" ? "Up to 3 decimals (1.25 kg = 1,250 g)." : "Whole grams only.")
                : loose ? `Entered as weight: ${base ? base.label : "—"}. Packs are never mixed with kilograms here.` : `Entered as packs of ${p.pack_label}, not weight.`}
            </p>
            {negative ? <p className="mt-1 text-xs font-semibold text-danger">That is more than there is ({loose ? formatGrams(before) : formatPacks(before)}).</p> : null}
          </div>
          <Select label={action === "receive" ? "Reason (optional)" : "Reason"} value={reason} onChange={(e) => setReason(e.target.value)} options={[...REASONS[action].map((r) => ({ value: r, label: r })), { value: "Other", label: "Other…" }]} />
          {reason === "Other" ? <Input label="What happened?" value={other} onChange={(e) => setOther(e.target.value)} maxLength={120} /> : null}
          <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Supplier, crate number, who checked…" className="min-h-16" />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-base text-ink"><strong>{verb} {base?.label}</strong> {sign > 0 ? "to" : "from"} <strong>{p.name}{loose ? "" : ` ${p.pack_label ?? ""}`}</strong>{loose ? " (shared balance for every size)" : ""}.</p>
          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-3 text-sm">
            <div><dt className="text-xs text-ink-3">Now</dt><dd className="font-bold tabular">{loose ? formatGrams(before) : formatPacks(before)}</dd></div>
            <div><dt className="text-xs text-ink-3">After</dt><dd className={cn("font-bold tabular", sign > 0 ? "text-success" : "text-danger")}>{loose ? formatGrams(after) : formatPacks(after)}</dd></div>
            {reasonText ? <div className="col-span-2"><dt className="text-xs text-ink-3">Reason</dt><dd>{reasonText}{note.trim() ? ` — ${note.trim()}` : ""}</dd></div> : null}
          </dl>
          <p className="text-xs text-ink-3">Recorded with your name, the time and this reason. Nothing changes until you confirm.</p>
        </div>
      )}
    </BottomSheet>
  );
}

function HistorySheet({ open, onClose, productId, loose }: { open: boolean; onClose: () => void; productId: string; loose: boolean }) {
  const [rows, setRows] = React.useState<StockHistoryRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) { setRows(null); setError(null); } }
  React.useEffect(() => {
    if (!open) return;
    let on = true;
    stockHistoryAction(productId).then((r) => { if (!on) return; if (r.ok) setRows(r.data); else setError(r.error); }).catch(() => on && setError("Could not load history (offline?)"));
    return () => { on = false; };
  }, [open, productId]);
  return (
    <BottomSheet open={open} onClose={onClose} title="Stock history" description={loose ? "Every movement of the shared balance, newest first" : "Every movement of this pack count, newest first"}>
      {error ? <Alert tone="danger">{error}</Alert> : rows === null ? <LoadingState rows={4} /> : rows.length === 0 ? <p className="py-6 text-center text-sm text-ink-3">No stock movements yet.</p> : (
        <ul className="divide-y divide-line">
          {rows.map((m) => {
            const amount = loose && m.delta_grams != null ? m.delta_grams : m.delta;
            const label = loose && m.delta_grams != null ? formatGrams(Math.abs(m.delta_grams)) : formatPacks(Math.abs(m.delta));
            return (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2.5 text-sm">
                <span className={cn("w-20 font-bold tabular", amount > 0 ? "text-success" : amount < 0 ? "text-danger" : "text-ink-3")}>{amount > 0 ? "+" : amount < 0 ? "−" : ""}{amount === 0 ? "—" : label}</span>
                <span className="font-medium text-ink">{REASON_LABEL[m.reason] ?? m.reason}</span>
                {m.pack_label && loose ? <span className="text-xs text-ink-3">({m.pack_label})</span> : null}
                <span className="ml-auto text-xs text-ink-3" title={formatDateTime(m.at)}>{timeAgo(m.at)}</span>
                <span className="w-full text-xs text-ink-3">{m.staff ?? "System"}{m.note ? ` · ${m.note}` : ""}{m.balance_after != null ? ` · after: ${m.balance_unit === "g" ? formatGrams(m.balance_after) : formatPacks(m.balance_after)}` : ""}</span>
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}
