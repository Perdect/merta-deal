"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Switch } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { adminRemoveWholesaleProductAction, adminSetWholesaleProductAction } from "@/lib/actions/wholesale";
import { formatINR } from "@/lib/utils";
import type { AdminWholesaleProduct } from "@/lib/wholesale";

type ProductOption = { id: string; name: string; pack_label: string | null; selling_price: number | null };
type Draft = { productId: string; caseSize: string; moqCases: string; maxCases: string; pricePerCase: string; isAvailable: boolean };
const blank = (productId = ""): Draft => ({ productId, caseSize: "", moqCases: "1", maxCases: "", pricePerCase: "", isAvailable: true });
const fromRow = (r: AdminWholesaleProduct): Draft => ({ productId: r.product_id, caseSize: String(r.case_size), moqCases: String(r.moq_cases), maxCases: r.max_cases == null ? "" : String(r.max_cases), pricePerCase: r.price_per_case == null ? "" : String(r.price_per_case), isAvailable: r.is_available });

/**
 * Wholesale rows per catalogue product: case size, MOQ, optional max, price per case (empty = quote required),
 * availability. Prices are entered by the admin; nothing is derived from retail prices.
 */
export function ProductEditor({ rows, options }: { rows: AdminWholesaleProduct[]; options: ProductOption[] }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    if (!draft) return;
    const caseSize = Number(draft.caseSize), moq = Number(draft.moqCases || 1), max = draft.maxCases ? Number(draft.maxCases) : null, price = draft.pricePerCase ? Number(draft.pricePerCase) : null;
    if (!draft.productId) { toast.error("Pick a product"); return; }
    if (!Number.isInteger(caseSize) || caseSize < 1) { toast.error("Case size must be a whole number of units"); return; }
    setBusy(true);
    const r = await adminSetWholesaleProductAction({ productId: draft.productId, caseSize, moqCases: moq, maxCases: max, pricePerCase: price, isAvailable: draft.isAvailable });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(price == null ? "Saved · shown as price on quote" : "Wholesale price saved"); setDraft(null); router.refresh();
  };
  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name} from the wholesale range? It is also removed from shop lists.`)) return;
    const r = await adminRemoveWholesaleProductAction(id);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Removed from wholesale"); router.refresh();
  };
  const unlisted = options.filter((o) => !rows.some((r) => r.product_id === o.id));
  const editingName = draft ? (rows.find((r) => r.product_id === draft.productId)?.name ?? options.find((o) => o.id === draft.productId)?.name ?? "") : "";
  return (
    <div className="space-y-4">
      {draft ? (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-sm font-semibold text-ink">{rows.some((r) => r.product_id === draft.productId) ? `Edit ${editingName}` : "Add a product to the wholesale range"}</p>
          {!rows.some((r) => r.product_id === draft.productId) ? (
            <label className="mt-3 block text-sm font-semibold text-ink">Product
              <select value={draft.productId} onChange={(e) => setDraft({ ...draft, productId: e.target.value })} className="mt-1 block h-11 w-full rounded-md border border-line bg-card px-3 text-sm text-ink">
                <option value="">Choose a catalogue product…</option>
                {unlisted.map((o) => <option key={o.id} value={o.id}>{o.name}{o.pack_label ? ` (${o.pack_label})` : ""}{o.selling_price != null ? ` · retail ${formatINR(o.selling_price)}` : ""}</option>)}
              </select>
            </label>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Input label="Units per case" required inputMode="numeric" value={draft.caseSize} onChange={(e) => setDraft({ ...draft, caseSize: e.target.value.replace(/\D/g, "") })} />
            <Input label="Minimum cases" required inputMode="numeric" value={draft.moqCases} onChange={(e) => setDraft({ ...draft, moqCases: e.target.value.replace(/\D/g, "") })} />
            <Input label="Maximum cases" inputMode="numeric" value={draft.maxCases} onChange={(e) => setDraft({ ...draft, maxCases: e.target.value.replace(/\D/g, "") })} hint="Blank = no cap" />
            <Input label="Price per case (₹)" inputMode="decimal" value={draft.pricePerCase} onChange={(e) => setDraft({ ...draft, pricePerCase: e.target.value.replace(/[^\d.]/g, "") })} hint="Blank = price on quote" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Switch checked={draft.isAvailable} onChange={(v) => setDraft({ ...draft, isAvailable: v })} label="Available to shops" />
            <div className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" size="sm" loading={busy}>Save</Button></div>
          </div>
          <p className="mt-2 text-xs text-ink-3">Shops see the retail stock in whole cases. Leave the price blank until the supplier price is confirmed; the product then shows as &ldquo;price on quote&rdquo; and cannot be approved in an order.</p>
        </form>
      ) : <Button size="sm" onClick={() => setDraft(blank())} disabled={unlisted.length === 0}><Plus className="h-4 w-4" /> Add product</Button>}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-3"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Case</th><th className="px-3 py-2">Min / max</th><th className="px-3 py-2">Price / case</th><th className="px-3 py-2">Stock</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-3">No wholesale products yet. Add the fast movers shops ask for; leave the price blank until the supplier confirms it.</td></tr> : null}
            {rows.map((r) => (
              <tr key={r.product_id} className={r.product_active ? "" : "opacity-60"}>
                <td className="px-3 py-2"><p className="font-semibold text-ink">{r.name}</p><p className="text-xs text-ink-3">{r.pack_label}{r.retail_price != null ? ` · retail ${formatINR(r.retail_price)}` : ""}</p></td>
                <td className="px-3 py-2 tabular">{r.case_size} units</td>
                <td className="px-3 py-2 tabular">{r.moq_cases} / {r.max_cases ?? "—"}</td>
                <td className="px-3 py-2 tabular">{r.price_per_case == null ? <span className="font-semibold text-saffron-700">Quote required</span> : <>{formatINR(r.price_per_case)} <span className="text-xs text-ink-3">({formatINR(r.price_per_case / r.case_size)}/unit)</span></>}</td>
                <td className="px-3 py-2 tabular">{r.stock_qty == null ? "—" : `${Math.floor(r.stock_qty / r.case_size)} cases`}</td>
                <td className="px-3 py-2">{!r.product_active ? "Product inactive" : r.is_available ? "Available" : "Hidden"}</td>
                <td className="px-3 py-2 text-right"><div className="inline-flex gap-1"><Button size="sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setDraft(fromRow(r))}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => remove(r.product_id, r.name)}><Trash2 className="h-4 w-4 text-danger" /></Button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
