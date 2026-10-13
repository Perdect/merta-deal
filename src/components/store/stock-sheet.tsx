"use client";
import * as React from "react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { adjustStockAction } from "@/lib/actions/store";
import { STOCK_REASONS } from "./constants";
import { cn } from "@/lib/utils";

export type StockTarget = { id: string; name: string; stock: number };
type Mode = "add" | "remove" | "set";
const MODES: [Mode, string][] = [["add", "Add"], ["remove", "Remove"], ["set", "Set to"]];
const DEFAULT_REASON: Record<Mode, string> = { add: "restock", remove: "damage", set: "stock_count" };

/**
 * "Update stock" sheet: add, remove or set an exact count, with a reason (logged to inventory_movements
 * by the adjust_stock RPC). The current count stays on screen until the server confirms the new one;
 * a failure keeps the sheet open with the entered values and the reason it failed.
 */
export function StockSheet({ target, onClose, onDone }: { target: StockTarget | null; onClose: () => void; onDone: (stock: number) => void }) {
  const [mode, setMode] = React.useState<Mode>("add");
  const [qty, setQty] = React.useState("");
  const [reason, setReason] = React.useState(DEFAULT_REASON.add);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inflight = React.useRef(false);
  const [seen, setSeen] = React.useState(target);
  if (seen !== target) { setSeen(target); setMode("add"); setQty(""); setReason(DEFAULT_REASON.add); setNote(""); setError(null); }
  if (!target) return null;

  const n = qty.trim() === "" ? NaN : Number(qty);
  const delta = mode === "add" ? n : mode === "remove" ? -n : n - target.stock;
  const qtyError = qty.trim() === "" ? null
    : !Number.isInteger(n) || n < 0 ? "Enter a whole number (0 or more)."
    : mode !== "set" && n === 0 ? "Enter a quantity above 0."
    : mode === "remove" && n > target.stock ? `Only ${target.stock} in stock — you can remove up to ${target.stock}.`
    : mode === "set" && delta === 0 ? `Stock is already ${target.stock}.`
    : n > 10000 ? "That's more than 10,000 — check the number." : null;
  const valid = qty.trim() !== "" && !qtyError;
  const after = valid ? target.stock + delta : null;

  const apply = async () => {
    if (!valid || inflight.current) return;
    inflight.current = true; setBusy(true); setError(null);
    const r = await adjustStockAction(target.id, delta, reason, note);
    inflight.current = false; setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast.success(`Stock updated to ${r.data.stock_qty}`, target.name);
    onDone(r.data.stock_qty);
  };

  return (
    <BottomSheet open onClose={busy ? () => {} : onClose} title="Update stock" description={`${target.name} · ${target.stock} in stock now`}
      footer={<Button fullWidth size="lg" loading={busy} disabled={!valid} onClick={apply}>{busy ? "Saving…" : valid ? `Save · stock becomes ${after}` : "Save"}</Button>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void apply(); }} noValidate>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Change type">
          {MODES.map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => { setMode(v); setReason(DEFAULT_REASON[v]); }}
              className={cn("min-h-11 rounded-sm border text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-600", mode === v ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line-2 text-ink-2")}>{l}</button>
          ))}
        </div>
        <Input label={mode === "set" ? "New stock count" : mode === "add" ? "Units to add" : "Units to remove"} type="number" inputMode="numeric" min={0} step={1} value={qty} onChange={(e) => setQty(e.target.value)} error={qtyError ?? undefined} hint={after !== null ? `${target.stock} → ${after}` : undefined} autoFocus />
        <Select label="Reason" options={STOCK_REASONS} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" placeholder="e.g. 2 packets torn" maxLength={200} />
        {error ? <Alert tone="danger" title="Stock not updated">{error} The count is still {target.stock}.</Alert> : null}
      </form>
    </BottomSheet>
  );
}
