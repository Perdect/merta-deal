"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, History, PackagePlus, SearchX } from "lucide-react";
import { DataTable, CellStack, EmptyBlock, StatusPill } from "@/components/admin/kit";
import { ProductThumb, StockPill, btn } from "@/components/admin/catalogue/bits";
import { Modal } from "@/components/ui/overlay";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { adjustStockAction } from "@/lib/actions/inventory";
import { STOCK_ADJUST_REASONS, type InventoryRow } from "@/lib/inventory";
import { formatNumber, timeAgo } from "@/lib/utils";

/** Stock per listing: available / reserved / physical, with a manual adjustment that goes through the passbook. */
export function StockTable({ rows, filtered }: { rows: InventoryRow[]; filtered: boolean }) {
  const [adjusting, setAdjusting] = React.useState<InventoryRow | null>(null);
  return (
    <>
      <DataTable caption="Inventory" rows={rows} rowKey={(r) => r.id}
        empty={filtered
          ? <EmptyBlock icon={SearchX} title="No listings match" description="Try another tab, remove a filter, or search by a shorter name." />
          : <EmptyBlock icon={Boxes} title="No stock yet" description="Give products a selling price and stock under Products, or receive a purchase order." />}
        columns={[
          { key: "product", header: "Product", render: (r) => (
            <span className="flex min-w-0 items-center gap-3">
              <ProductThumb image={r.image_url} name={r.name} brand={r.brand_name} pack={r.pack_label} />
              <span className="min-w-0">
                <CellStack className="max-w-[220px] sm:max-w-[300px]" href={`/admin/products/${r.product_id}`} primary={r.name} secondary={[r.brand_name, r.pack_label, r.category_name].filter(Boolean).join(" · ") || undefined} />
                <span className="mt-1 block sm:hidden"><StockPill status={r.status} isActive={r.is_active} qty={r.available} /></span>
              </span>
            </span>
          ) },
          { key: "available", header: "Available", align: "right", render: (r) => <span className={`font-semibold tabular ${r.available <= 0 ? "text-danger" : r.available <= r.low_stock_threshold ? "text-[#8a6300]" : "text-ink"}`}>{formatNumber(r.available)}</span> },
          { key: "reserved", header: "Reserved", align: "right", render: (r) => r.reserved > 0
            ? <span className="tabular text-ink">{formatNumber(r.reserved)} <span className="text-xs text-ink-3">· {r.open_orders} order{r.open_orders === 1 ? "" : "s"}</span></span>
            : <span className="tabular text-ink-4">0</span> },
          { key: "physical", header: "Physical", align: "right", hideBelow: "sm", render: (r) => <span className="tabular text-ink-2">{formatNumber(r.physical)}</span> },
          { key: "status", header: "Status", hideBelow: "sm", render: (r) => <span className="inline-flex flex-wrap gap-1"><StockPill status={r.status} isActive={r.is_active} qty={r.available} />{r.available > 0 && r.available <= r.low_stock_threshold ? <StatusPill tone="amber">alert at {r.low_stock_threshold}</StatusPill> : null}</span> },
          { key: "moved", header: "Last movement", hideBelow: "lg", render: (r) => <span className="text-ink-3">{r.last_move_at ? timeAgo(r.last_move_at) : "—"}</span> },
          { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (r) => (
            <span className="inline-flex items-center gap-1">
              <button type="button" className={btn.small} onClick={() => setAdjusting(r)}><PackagePlus className="h-3.5 w-3.5" aria-hidden /> Adjust</button>
              <Link href={`/admin/inventory?tab=passbook&inventory=${r.id}`} className={btn.small} aria-label={`Passbook for ${r.name}`}><History className="h-3.5 w-3.5" aria-hidden /> Passbook</Link>
            </span>
          ) },
        ]} />
      {adjusting ? <AdjustModal row={adjusting} onClose={() => setAdjusting(null)} /> : null}
    </>
  );
}

function AdjustModal({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const router = useRouter();
  const [dir, setDir] = React.useState<"add" | "remove">("add");
  const [qty, setQty] = React.useState("");
  const [reason, setReason] = React.useState<string>("restock");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const n = Math.floor(Number(qty) || 0);
  const after = dir === "add" ? row.available + n : row.available - n;
  const submit = async () => {
    if (n <= 0) { setError("Enter how many packs."); return; }
    if (after < 0) { setError(`Only ${row.available} available; you cannot remove ${n}.`); return; }
    setBusy(true); setError(null);
    const r = await adjustStockAction({ inventoryId: row.id, delta: dir === "add" ? n : -n, reason, note });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast.success("Stock updated", `${row.name}: ${r.data.available} available now. Recorded in the passbook.`);
    onClose(); router.refresh();
  };
  return (
    <Modal open onClose={() => (busy ? undefined : onClose())} title={`Adjust stock · ${row.name}`} description={`${row.available} available · ${row.reserved} reserved for orders · ${row.physical} physical. Reserved stock only moves with orders.`} size="md"
      footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={busy} onClick={onClose}>Cancel</Button><Button className="flex-1" loading={busy} onClick={submit}>Record change</Button></div>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Direction">
          {(["add", "remove"] as const).map((d) => (
            <button key={d} type="button" onClick={() => { setDir(d); setReason(d === "add" ? "restock" : "damage"); }} className={`h-11 rounded-lg border text-sm font-semibold ${dir === d ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-card text-ink-2"}`}>{d === "add" ? "Add stock" : "Remove stock"}</button>
          ))}
        </div>
        <Input label={dir === "add" ? "Packs received" : "Packs removed"} required inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 6))} hint={n > 0 ? `${row.available} → ${Math.max(after, 0)} available` : undefined} />
        <Select label="Reason" options={STOCK_ADJUST_REASONS.filter((r) => dir === "add" ? r.value !== "damage" : r.value !== "restock").map((r) => ({ value: r.value, label: r.label }))} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="e.g. 2 tins dented in transit" />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <p className="text-xs text-ink-3">Every change is written to the inventory passbook with who made it and the balances before and after. Nothing is overwritten.</p>
      </form>
    </Modal>
  );
}
