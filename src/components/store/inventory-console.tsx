"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Minus, Plus, Download, PackageX, AlertTriangle, SlidersHorizontal, Pencil, Check, X, History } from "lucide-react";
import { Input, Select, Textarea, Checkbox } from "@/components/ui/input";
import { Button, IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { BottomSheet, ConfirmDialog } from "@/components/ui/overlay";
import { Chip } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { ProductImage } from "@/components/shop/product-image";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { adjustStockAction, updateInventoryPricingAction, bulkOutOfStockAction, getInventoryExportAction } from "@/lib/actions/store";
import { useStoreOrdersRealtime } from "./use-store-realtime";
import { INVENTORY_STATUS_META, STOCK_REASONS } from "./constants";
import type { StoreInventoryRow, MovementRow } from "@/lib/data/store";
import { cn, formatINR, timeAgo, discountPct } from "@/lib/utils";
import type { Enums } from "@/types/database";

const STATUS_FILTERS: { value: Enums<"inventory_status"> | ""; label: string }[] = [{ value: "", label: "All" }, { value: "in_stock", label: "In stock" }, { value: "low_stock", label: "Low" }, { value: "out_of_stock", label: "Out" }];
const REASON_LABEL: Record<string, string> = { order: "Order", cancel_restock: "Cancelled order restock", reject_restock: "Rejected order restock", manual_adjust: "Manual", restock: "Restock", damage: "Damage", expired: "Expired", stock_count: "Stock count" };

/** Fast stock console: alerts, inline +/- stock and price edits, bulk out-of-stock, CSV export, movement log. */
export function InventoryConsole({ storeId, items, total, page, pageSize, filter, alerts, movements }: { storeId: string; items: StoreInventoryRow[]; total: number; page: number; pageSize: number; filter: { q: string; status: string }; alerts: StoreInventoryRow[]; movements: MovementRow[] }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  useStoreOrdersRealtime(storeId, () => router.refresh(), { inventory: true, pollMs: 60000 });
  const [q, setQ] = React.useState(filter.q);
  const dq = useDebouncedValue(q, 350);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [adjust, setAdjust] = React.useState<StoreInventoryRow | null>(null);

  const go = React.useCallback((patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === "" || (k === "page" && Number(v) <= 1)) next.delete(k); else next.set(k, String(v)); }
    router.push(`${pathname}?${next.toString()}`);
  }, [router, pathname, sp]);
  React.useEffect(() => { if (dq !== filter.q) go({ q: dq, page: undefined }); }, [dq, filter.q, go]);
  const [seenItems, setSeenItems] = React.useState(items);
  if (seenItems !== items) { setSeenItems(items); setSelected(new Set()); }

  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  const bulk = async () => {
    setBulkBusy(true);
    const r = await bulkOutOfStockAction([...selected]);
    setBulkBusy(false); setBulkOpen(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`${r.data.updated} item${r.data.updated === 1 ? "" : "s"} marked out of stock`, r.data.failed ? `${r.data.failed} failed` : undefined);
    router.refresh();
  };

  const exportCsv = async () => {
    setExporting(true);
    const r = await getInventoryExportAction(storeId);
    setExporting(false);
    if (!r.ok) { toast.error(r.error); return; }
    const head = ["Product", "Brand", "Pack", "Category", "MRP", "Selling price", "Stock", "Status", "Low-stock alert", "Max per order", "Active", "Sold"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [head.join(","), ...r.data.rows.map((x) => [x.name, x.brand, x.pack, x.category, x.mrp, x.selling_price, x.stock_qty, x.status, x.low_stock_threshold, x.max_order_qty, x.is_active ? "yes" : "no", x.sold_count].map(esc).join(","))];
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `merta-deal-inventory-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${r.data.rows.length} rows`, r.data.capped ? "Export is capped at 2000 rows" : undefined);
  };

  return (
    <div className="space-y-4">
      {alerts.length > 0 ? (
        <section className="rounded-lg border border-warning/30 bg-warning-50 p-3.5 sm:p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#6b4d00]"><AlertTriangle className="h-4 w-4" /> Needs restocking ({alerts.length}{alerts.length >= 40 ? "+" : ""})</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 rounded-md bg-card px-2.5 py-2 shadow-card">
                <ProductImage image={a.product.image_url} productName={a.product.name} className="h-9 w-9 shrink-0 rounded-sm" sizes="36px" />
                <div className="min-w-0 flex-1"><p className="line-clamp-1 text-xs font-semibold text-ink">{a.product.name}</p><p className="text-[11px] text-ink-3">{a.stock_qty === 0 ? "Out of stock" : `${a.stock_qty} left · alert at ${a.low_stock_threshold}`}</p></div>
                <Button size="xs" variant="secondary" onClick={() => setAdjust(a)}><Plus className="h-3.5 w-3.5" /> Restock</Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input placeholder="Find a product" value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<Search className="h-4 w-4" />} wrapperClassName="flex-1" aria-label="Search inventory" />
        <div className="flex gap-2 overflow-x-auto no-scrollbar">{STATUS_FILTERS.map((s) => <Chip key={s.value} active={filter.status === s.value} onClick={() => go({ status: s.value, page: undefined })}>{s.label}</Chip>)}</div>
        <Button variant="outline" size="sm" loading={exporting} onClick={exportCsv} className="shrink-0"><Download className="h-4 w-4" /> CSV</Button>
      </div>

      {selected.size > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-ink px-3 py-2 text-sm text-white animate-slide-up">
          <span>{selected.size} selected</span>
          <div className="flex gap-2"><Button size="xs" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setSelected(new Set())}>Clear</Button><Button size="xs" variant="danger" onClick={() => setBulkOpen(true)}><PackageX className="h-3.5 w-3.5" /> Mark out of stock</Button></div>
        </div>
      ) : null}

      {items.length === 0 ? <EmptyState icon={<SlidersHorizontal className="h-7 w-7" />} title="No items" description={filter.q || filter.status ? "Nothing matches these filters." : "Add products first, then manage stock here."} action={<Button href="/store/products/new">Add product</Button>} /> : (
        <div className="overflow-hidden rounded-lg border border-line bg-card">
          <div className="hidden grid-cols-[28px_1fr_150px_170px_110px] items-center gap-3 border-b border-line bg-surface-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3 md:grid">
            <Checkbox checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))} aria-label="Select all" />
            <span>Product</span><span>Price / MRP</span><span>Stock</span><span>Status</span>
          </div>
          <ul className="divide-y divide-line">{items.map((it) => <InventoryLine key={it.id} item={it} selected={selected.has(it.id)} onSelect={() => toggleSel(it.id)} onAdjust={() => setAdjust(it)} />)}</ul>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onChange={(p) => go({ page: p })} />

      <section className="rounded-lg border border-line bg-card p-4 shadow-card">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-ink"><History className="h-4 w-4 text-ink-3" /> Recent stock movements</h2>
        {movements.length === 0 ? <p className="text-sm text-ink-3">Stock changes from orders and adjustments will show here.</p> : (
          <ul className="divide-y divide-line text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <span className={cn("w-12 shrink-0 text-right font-bold tabular", m.delta > 0 ? "text-success" : "text-danger")}>{m.delta > 0 ? "+" : ""}{m.delta}</span>
                <span className="min-w-0 flex-1"><span className="line-clamp-1 text-ink">{m.inventory?.product?.name ?? "Item"}</span><span className="text-xs text-ink-3">{REASON_LABEL[m.reason] ?? m.reason}{m.note ? ` · ${m.note}` : ""}</span></span>
                <span className="shrink-0 text-xs text-ink-3">{timeAgo(m.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog open={bulkOpen} onClose={() => setBulkOpen(false)} onConfirm={bulk} loading={bulkBusy} tone="danger" title={`Mark ${selected.size} item${selected.size === 1 ? "" : "s"} out of stock?`} description="Stock is set to zero and customers can no longer order them. Each change is logged so you can restock later." confirmLabel="Mark out of stock" />
      <AdjustSheet item={adjust} onClose={() => setAdjust(null)} onDone={() => { setAdjust(null); router.refresh(); }} />
    </div>
  );
}

function InventoryLine({ item, selected, onSelect, onAdjust }: { item: StoreInventoryRow; selected: boolean; onSelect: () => void; onAdjust: () => void }) {
  const router = useRouter();
  const [stock, setStock] = React.useState(item.stock_qty);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [price, setPrice] = React.useState(String(item.selling_price)); const [mrp, setMrp] = React.useState(String(item.mrp));
  const [seen, setSeen] = React.useState(item);
  if (seen !== item) { setSeen(item); setStock(item.stock_qty); setPrice(String(item.selling_price)); setMrp(String(item.mrp)); }
  const meta = INVENTORY_STATUS_META[item.status];
  const step = async (delta: number) => {
    if (stock + delta < 0) return;
    setBusy(true); setStock((s) => s + delta);
    const r = await adjustStockAction(item.id, delta, delta > 0 ? "restock" : "manual_adjust");
    setBusy(false);
    if (!r.ok) { setStock((s) => s - delta); toast.error(r.error); return; }
    setStock(r.data.stock_qty); router.refresh();
  };
  const savePrice = async () => {
    setBusy(true);
    const r = await updateInventoryPricingAction(item.id, { selling_price: Number(price), mrp: Number(mrp) });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setEditing(false); toast.success("Price updated"); router.refresh();
  };
  const pct = discountPct(Number(mrp), Number(price));
  return (
    <li className={cn("grid grid-cols-[28px_1fr] items-center gap-x-3 gap-y-2 px-3 py-2.5 md:grid-cols-[28px_1fr_150px_170px_110px]", selected && "bg-brand-50/40", !item.is_active && "opacity-60")}>
      <Checkbox checked={selected} onChange={onSelect} aria-label={`Select ${item.product.name}`} />
      <div className="flex min-w-0 items-center gap-2.5">
        <ProductImage image={item.product.image_url} productName={item.product.name} className="h-10 w-10 shrink-0 rounded-sm" sizes="40px" />
        <div className="min-w-0"><Link href={`/store/products/${item.id}`} className="line-clamp-1 text-sm font-medium text-ink hover:underline">{item.product.name}</Link><p className="text-[11px] text-ink-3">{item.product.pack_label ?? `${item.product.weight_value} ${item.product.weight_unit}`}{item.product.brand ? ` · ${item.product.brand.name}` : ""}{!item.is_active ? " · hidden" : ""}</p></div>
      </div>
      <div className="col-start-2 md:col-start-auto">
        {editing ? (
          <div className="flex items-center gap-1">
            <input type="number" inputMode="decimal" min={0} step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Selling price" className="h-8 w-16 rounded-xs border border-line-2 px-1.5 text-sm tabular" />
            <span className="text-xs text-ink-3">/</span>
            <input type="number" inputMode="decimal" min={0} step="0.5" value={mrp} onChange={(e) => setMrp(e.target.value)} aria-label="MRP" className="h-8 w-16 rounded-xs border border-line-2 px-1.5 text-sm tabular" />
            <IconButton label="Save" size="icon" className="h-8 w-8 text-success" disabled={busy || Number(price) > Number(mrp)} onClick={savePrice}><Check className="h-4 w-4" /></IconButton>
            <IconButton label="Cancel" size="icon" className="h-8 w-8" onClick={() => { setEditing(false); setPrice(String(item.selling_price)); setMrp(String(item.mrp)); }}><X className="h-4 w-4" /></IconButton>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="group inline-flex items-center gap-1.5 text-sm tabular" aria-label="Edit price"><span className="font-bold text-ink">{formatINR(item.selling_price)}</span>{Number(item.mrp) > Number(item.selling_price) ? <span className="text-xs text-ink-3 line-through">{formatINR(item.mrp)}</span> : null}{pct > 0 ? <span className="text-[10px] font-bold text-brand-700">{pct}%</span> : null}<Pencil className="h-3 w-3 text-ink-4 group-hover:text-ink" /></button>
        )}
      </div>
      <div className="col-start-2 flex items-center gap-1 md:col-start-auto">
        <IconButton label="Decrease stock" size="icon" className="h-9 w-9 border border-line-2" disabled={busy || stock <= 0} onClick={() => step(-1)}><Minus className="h-4 w-4" /></IconButton>
        <span className={cn("w-10 text-center text-base font-bold tabular", stock === 0 ? "text-danger" : "text-ink", busy && "animate-pulse-soft")}>{stock}</span>
        <IconButton label="Increase stock" size="icon" className="h-9 w-9 border border-line-2" disabled={busy} onClick={() => step(1)}><Plus className="h-4 w-4" /></IconButton>
        <Button size="xs" variant="ghost" onClick={onAdjust} className="ml-1">Adjust</Button>
      </div>
      <div className="col-start-2 md:col-start-auto"><Badge tone={meta.tone} size="xs">{meta.label}</Badge></div>
    </li>
  );
}

/** Larger stock change with a reason (logged to inventory_movements via adjust_stock). */
function AdjustSheet({ item, onClose, onDone }: { item: StoreInventoryRow | null; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = React.useState<"add" | "remove" | "set">("add");
  const [qty, setQty] = React.useState("");
  const [reason, setReason] = React.useState(STOCK_REASONS[0].value);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState(item);
  if (seen !== item) { setSeen(item); setMode("add"); setQty(""); setReason("restock"); setNote(""); }
  if (!item) return null;
  const n = Number(qty);
  const delta = mode === "add" ? n : mode === "remove" ? -n : n - item.stock_qty;
  const valid = Number.isInteger(n) && n >= 0 && delta !== 0 && item.stock_qty + delta >= 0;
  const apply = async () => {
    setBusy(true);
    const r = await adjustStockAction(item.id, delta, reason, note);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Stock is now ${r.data.stock_qty}`, item.product.name);
    onDone();
  };
  return (
    <BottomSheet open onClose={onClose} title="Adjust stock" description={`${item.product.name} · currently ${item.stock_qty}`} footer={<Button fullWidth loading={busy} disabled={!valid} onClick={apply}>Apply {valid ? `(${delta > 0 ? "+" : ""}${delta})` : ""}</Button>}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">{([["add", "Add"], ["remove", "Remove"], ["set", "Set to"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => { setMode(v); setReason(v === "add" ? "restock" : v === "remove" ? "damage" : "stock_count"); }} className={cn("h-10 rounded-sm border text-sm font-semibold", mode === v ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-2 text-ink-2")}>{l}</button>)}</div>
        <Input label={mode === "set" ? "New stock count" : "Quantity"} type="number" inputMode="numeric" min={0} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        <Select label="Reason" options={STOCK_REASONS} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" placeholder="e.g. 2 packets torn" />
      </div>
    </BottomSheet>
  );
}
