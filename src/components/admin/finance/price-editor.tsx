"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Check, CalendarClock, AlertTriangle, XCircle } from "lucide-react";
import { Panel, DataTable, CellStack } from "@/components/admin/kit";
import { Input, Select, Checkbox } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { pricePreviewAction, priceApplyAction, cancelScheduledPriceAction, type PricePreviewRow, type PriceMode, type PriceFilter } from "@/lib/actions/finance";
import { cn, formatINR, formatDateTime } from "@/lib/utils";

type Opt = { value: string; label: string };
export type ScheduledRow = { id: string; product_name: string; pack_label: string | null; new_price: number; new_mrp: number | null; effective_at: string; status: string; reason: string | null; created_by_name: string | null; error: string | null };
export type HistoryRow = { id: string; product_name: string; pack_label: string | null; old_price: number | null; new_price: number; below_cost: boolean; reason: string | null; changed_by_name: string | null; created_at: string };

const MODES: { value: PriceMode; label: string; hint: string }[] = [
  { value: "percent", label: "Change by %", hint: "+10 raises prices by 10%, −5 lowers them by 5%" },
  { value: "amount", label: "Change by ₹", hint: "+2 adds ₹2 to every price" },
  { value: "set", label: "Set a price", hint: "Every matching product gets this price" },
  { value: "margin", label: "Margin over cost %", hint: "Price = cost × (1 + margin). Needs a recorded cost." },
  { value: "mrp_discount", label: "Discount off MRP %", hint: "Price = MRP − discount" },
];

/**
 * Bulk price changes with a preview first. Nothing changes until "Apply"; a below-cost result needs
 * an explicit tick. A future date schedules the change instead of applying it.
 */
export function PriceEditor({ categories, brands, canSeeCosts, scheduled, history }: { categories: Opt[]; brands: Opt[]; canSeeCosts: boolean; scheduled: ScheduledRow[]; history: HistoryRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<PriceFilter>({});
  const [mode, setMode] = React.useState<PriceMode>("percent");
  const [value, setValue] = React.useState("");
  const [rows, setRows] = React.useState<PricePreviewRow[] | null>(null);
  const [reason, setReason] = React.useState("");
  const [when, setWhen] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState<"preview" | "apply" | null>(null);
  const below = rows?.filter((r) => r.below_cost).length ?? 0;
  const invalid = rows?.filter((r) => r.invalid).length ?? 0;
  const valid = (rows?.length ?? 0) - invalid;

  const preview = async () => {
    if (busy) return;
    const v = Number(value);
    if (!Number.isFinite(v)) { toast.error("Enter a number"); return; }
    setBusy("preview"); setRows(null); setConfirm(false);
    try {
      const r = await pricePreviewAction(filter, mode, v);
      if (!r.ok) { toast.error("Could not preview", r.error); return; }
      setRows(r.data);
      if (!r.data.length) toast.info("No products match that filter");
    } finally { setBusy(null); }
  };
  const apply = async () => {
    if (busy || !rows) return;
    setBusy("apply");
    try {
      const r = await priceApplyAction(filter, mode, Number(value), reason, when ? new Date(when).toISOString() : null, confirm);
      if (!r.ok) { toast.error("Not applied", r.error); return; }
      toast.success(r.data.scheduled ? `${r.data.count} price changes scheduled` : `${r.data.count} prices updated`, r.data.skipped ? `${r.data.skipped} skipped (no valid new price)` : undefined);
      setRows(null); setReason(""); setWhen(""); setConfirm(false); router.refresh();
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <Panel title="Change prices" description="Choose which products, how the price should move, preview, then apply or schedule.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Category" options={categories} placeholder="Any category" value={filter.category_id ?? ""} onChange={(e) => setFilter({ ...filter, category_id: e.target.value || undefined })} />
          <Select label="Brand" options={brands} placeholder="Any brand" value={filter.brand_id ?? ""} onChange={(e) => setFilter({ ...filter, brand_id: e.target.value || undefined })} />
          <Input label="Name contains" value={filter.q ?? ""} onChange={(e) => setFilter({ ...filter, q: e.target.value || undefined })} placeholder="e.g. atta" />
          <Select label="How" options={MODES.filter((m) => canSeeCosts || m.value !== "margin")} value={mode} onChange={(e) => setMode(e.target.value as PriceMode)} hint={MODES.find((m) => m.value === mode)?.hint} />
          <Input label={mode === "set" ? "New price (₹)" : mode === "amount" ? "Amount (₹, negative to lower)" : "Percent (negative to lower)"} type="number" inputMode="decimal" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
          <div className="flex items-end"><Button onClick={preview} loading={busy === "preview"} disabled={busy !== null} className="w-full sm:w-auto"><Eye className="h-4 w-4" /> Preview</Button></div>
        </div>
      </Panel>

      {rows ? (
        <Panel title={`Preview · ${rows.length} products`} description={`${valid} would change${below ? ` · ${below} below cost` : ""}${invalid ? ` · ${invalid} skipped` : ""}. Nothing has changed yet.`} flush
          footer={
            <div className="flex flex-col gap-3 px-4 py-3 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px]">
                <Input label="Reason (goes in the price history)" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Supplier price up from 1 Dec" maxLength={120} />
                <Input label="Apply on (leave empty for now)" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              </div>
              {below > 0 ? <Checkbox checked={confirm} onChange={(e) => setConfirm(e.target.checked)} label={<span className="text-sm"><AlertTriangle className="mr-1 inline h-4 w-4 text-danger" aria-hidden />I understand {below} {below === 1 ? "product goes" : "products go"} below cost; apply anyway. This is recorded against my name.</span>} /> : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={busy !== null} onClick={() => setRows(null)}>Discard</Button>
                <Button loading={busy === "apply"} disabled={busy !== null || !valid || reason.trim().length < 3 || (below > 0 && !confirm)} onClick={apply}>{when ? <><CalendarClock className="h-4 w-4" /> Schedule {valid}</> : <><Check className="h-4 w-4" /> Apply to {valid}</>}</Button>
              </div>
            </div>
          }>
          <DataTable caption="Price preview" rows={rows} rowKey={(r) => r.inventory_id} maxHeight="60vh"
            columns={[
              { key: "p", header: "Product", render: (r) => <CellStack primary={r.name} secondary={[r.pack_label, r.sku].filter(Boolean).join(" · ")} /> },
              { key: "cost", header: "Cost", align: "right", hideBelow: "md", render: (r) => <span className="tabular text-ink-3">{r.cost != null ? formatINR(r.cost, { precise: true }) : "—"}</span> },
              { key: "now", header: "Now", align: "right", render: (r) => <span className="tabular">{formatINR(r.price)}</span> },
              { key: "new", header: "New", align: "right", render: (r) => r.invalid ? <Badge tone="neutral" size="xs">skipped</Badge> : <span className={cn("tabular font-semibold", r.below_cost ? "text-danger" : Number(r.new_price) > Number(r.price) ? "text-success" : "text-ink")}>{formatINR(r.new_price ?? 0)}</span> },
              { key: "mrp", header: "MRP", align: "right", hideBelow: "lg", render: (r) => <span className="tabular text-ink-3">{r.new_mrp != null ? formatINR(r.new_mrp) : "—"}</span> },
              { key: "flag", header: "", render: (r) => (r.below_cost ? <Badge tone="danger" size="xs">below cost</Badge> : null) },
            ]} />
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Scheduled changes" description="Applied automatically when due (checked every time an admin dashboard is open, and by the cron)." flush>
          {scheduled.length === 0 ? <p className="px-4 py-4 text-sm text-ink-3">Nothing scheduled.</p> : (
            <ul className="divide-y divide-line border-t border-line text-sm">
              {scheduled.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2 sm:px-5">
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{s.product_name} <span className="text-ink-3">{s.pack_label ?? ""}</span></span><span className="block text-xs text-ink-3">{formatDateTime(s.effective_at)} · {s.reason ?? "no reason"}{s.created_by_name ? ` · ${s.created_by_name}` : ""}{s.error ? ` · ${s.error}` : ""}</span></span>
                  <span className="tabular font-semibold">{formatINR(s.new_price)}</span>
                  <Badge tone={s.status === "scheduled" ? "warning" : s.status === "applied" ? "success" : s.status === "failed" ? "danger" : "neutral"} size="xs">{s.status}</Badge>
                  {s.status === "scheduled" ? <button type="button" aria-label="Cancel scheduled change" className="tap flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-danger-50 hover:text-danger" onClick={async () => { const r = await cancelScheduledPriceAction(s.id); if (!r.ok) toast.error(r.error); else { toast.success("Cancelled"); router.refresh(); } }}><XCircle className="h-4 w-4" /></button> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Recent price changes" description="Every change, whoever made it and why." flush>
          {history.length === 0 ? <p className="px-4 py-4 text-sm text-ink-3">No changes recorded yet.</p> : (
            <ul className="divide-y divide-line border-t border-line text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-2 sm:px-5">
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{h.product_name} <span className="text-ink-3">{h.pack_label ?? ""}</span></span><span className="block text-xs text-ink-3">{formatDateTime(h.created_at)}{h.changed_by_name ? ` · ${h.changed_by_name}` : ""}{h.reason ? ` · ${h.reason}` : ""}</span></span>
                  <span className="tabular text-xs text-ink-3">{h.old_price != null ? formatINR(h.old_price) : "—"} →</span>
                  <span className={cn("tabular font-semibold", h.below_cost && "text-danger")}>{formatINR(h.new_price)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
