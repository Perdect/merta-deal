"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { Spinner, EmptyState } from "@/components/ui/states";
import { VegMark } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { ProductImage } from "@/components/shop/product-image";
import { addFromCatalogAction } from "@/lib/actions/store";
import type { ProductCard, SearchResult } from "@/types/app";
import { formatINR, discountPct } from "@/lib/utils";

/**
 * "Add from catalog": typeahead over the shared product catalog (rpc search_products, browser client),
 * then price/stock for this store → inventory row. Products already listed here are marked.
 */
export function CatalogPicker({ storeId, listedProductIds }: { storeId: string; listedProductIds: string[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const dq = useDebouncedValue(q, 300);
  const [items, setItems] = React.useState<ProductCard[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [pick, setPick] = React.useState<ProductCard | null>(null);
  const [form, setForm] = React.useState({ selling_price: "", mrp: "", stock_qty: "10" });
  const [busy, setBusy] = React.useState(false);
  const listed = React.useMemo(() => new Set(listedProductIds), [listedProductIds]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase.rpc("search_products", { p_query: dq.trim() || undefined, p_page_size: 12, p_sort: dq.trim() ? "relevance" : "popular" });
      if (cancelled) return;
      setLoading(false);
      if (error) { toast.error("Catalog search failed", error.message); return; }
      const res = data as unknown as SearchResult;
      // Catalog rows are one per product (best offer); we only need master data here.
      const seen = new Set<string>();
      setItems(res.items.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))));
    };
    run();
    return () => { cancelled = true; };
  }, [dq]);

  const open = (p: ProductCard) => { setPick(p); setForm({ selling_price: String(p.selling_price ?? p.base_mrp), mrp: String(p.mrp ?? p.base_mrp), stock_qty: "10" }); };
  const add = async () => {
    if (!pick) return;
    setBusy(true);
    const r = await addFromCatalogAction(storeId, { product_id: pick.id, selling_price: Number(form.selling_price), mrp: Number(form.mrp), stock_qty: Number(form.stock_qty) });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Added to your store", pick.name);
    setPick(null); router.push(`/store/products/${r.data.inventory_id}`); router.refresh();
  };
  const pct = discountPct(Number(form.mrp), Number(form.selling_price));

  return (
    <div className="space-y-3">
      <Input placeholder="Search the Merta Deal catalog (e.g. Aashirvaad atta)" value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<Search className="h-4 w-4" />} rightSlot={loading ? <Spinner size={16} /> : null} aria-label="Search catalog" autoFocus />
      {items.length === 0 && !loading ? <EmptyState compact title="Nothing found" description="Try the brand or product name, or add it as a new product below." /> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-card">
          {items.map((p) => {
            const done = listed.has(p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <ProductImage image={p.image_url} brand={p.brand_name} productName={p.name} packSize={p.pack_label} className="h-12 w-12 shrink-0 rounded-sm" sizes="48px" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[11px] text-ink-3"><VegMark veg={p.is_veg} />{p.brand_name ?? p.category_name}</p>
                  <p className="line-clamp-1 text-sm font-medium text-ink">{p.name}</p>
                  <p className="text-xs text-ink-3">{p.pack_label ?? `${p.weight_value} ${p.weight_unit}`} · MRP {formatINR(p.base_mrp)}</p>
                </div>
                {done ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><Check className="h-4 w-4" /> Listed</span> : <Button size="xs" variant="secondary" onClick={() => open(p)}><Plus className="h-3.5 w-3.5" /> Add</Button>}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={Boolean(pick)} onClose={() => setPick(null)} title="Add to your store" description={pick?.name} size="sm"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setPick(null)}>Cancel</Button><Button className="flex-1" loading={busy} onClick={add}>Add product</Button></div>}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="MRP (₹)" type="number" inputMode="decimal" min={1} step="0.5" value={form.mrp} onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))} />
          <Input label="Your price (₹)" type="number" inputMode="decimal" min={1} step="0.5" value={form.selling_price} onChange={(e) => setForm((f) => ({ ...f, selling_price: e.target.value }))} error={Number(form.selling_price) > Number(form.mrp) ? "Cannot exceed MRP" : undefined} hint={pct > 0 ? `${pct}% off MRP` : undefined} />
          <Input label="Stock (units)" type="number" inputMode="numeric" min={0} value={form.stock_qty} onChange={(e) => setForm((f) => ({ ...f, stock_qty: e.target.value }))} wrapperClassName="col-span-2" />
        </div>
      </Modal>
    </div>
  );
}
