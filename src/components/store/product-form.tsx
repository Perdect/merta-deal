"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Input, Textarea, Select, Switch } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { DiscountBadge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { ProductImageManager } from "@/components/shared/product-image-manager";
import { saveStoreProductAction, type StoreProductInput } from "@/lib/actions/store";
import { WEIGHT_UNITS, type WeightUnit } from "./constants";
import type { CategoryGroup, StoreInventoryRow } from "@/lib/data/store";
import { discountPct } from "@/lib/utils";

type FormState = { name: string; category_id: string; brand_name: string; weight_value: string; weight_unit: WeightUnit; pack_label: string; mrp: string; selling_price: string; stock_qty: string; low_stock_threshold: string; max_order_qty: string; description: string; image_url: string | null; is_veg: boolean; is_local: boolean };

const blank: FormState = { name: "", category_id: "", brand_name: "", weight_value: "", weight_unit: "g", pack_label: "", mrp: "", selling_price: "", stock_qty: "10", low_stock_threshold: "5", max_order_qty: "10", description: "", image_url: null, is_veg: true, is_local: false };

function fromRow(r: StoreInventoryRow): FormState {
  const p = r.product;
  return { name: p.name, category_id: p.category_id, brand_name: p.brand?.name ?? "", weight_value: String(p.weight_value), weight_unit: (WEIGHT_UNITS as readonly string[]).includes(p.weight_unit) ? (p.weight_unit as WeightUnit) : "g", pack_label: p.pack_label ?? "", mrp: String(r.mrp), selling_price: String(r.selling_price), stock_qty: String(r.stock_qty), low_stock_threshold: String(r.low_stock_threshold), max_order_qty: String(r.max_order_qty), description: p.description ?? "", image_url: p.image_url, is_veg: p.is_veg, is_local: p.is_local };
}

/**
 * Create / edit a product listing. Saves through rpc `upsert_store_product`: master data is written only
 * for products this store created; for catalog products only the store's price/stock fields apply.
 */
export function ProductForm({ storeId, categories, item }: { storeId: string; categories: CategoryGroup[]; item?: StoreInventoryRow | null }) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(() => (item ? fromRow(item) : blank));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const catalogOwned = Boolean(item && item.product.created_by_store_id !== storeId);
  const pct = discountPct(Number(form.mrp), Number(form.selling_price));
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const catOptions = categories.flatMap((g) => g.children.map((c) => ({ value: c.id, label: `${g.parent.name} › ${c.name}` })));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErrors({});
    const input: StoreProductInput = {
      product_id: item?.product_id ?? null, name: form.name, category_id: form.category_id, brand_name: form.brand_name, weight_value: num(form.weight_value), weight_unit: form.weight_unit, pack_label: form.pack_label,
      mrp: num(form.mrp), selling_price: num(form.selling_price), stock_qty: num(form.stock_qty), low_stock_threshold: num(form.low_stock_threshold), max_order_qty: num(form.max_order_qty),
      description: form.description, image_url: form.image_url, is_veg: form.is_veg, is_local: form.is_local,
    };
    const r = await saveStoreProductAction(storeId, input);
    setBusy(false);
    if (!r.ok) { setErrors(r.fieldErrors ?? {}); toast.error(r.error); return; }
    toast.success(item ? "Product updated" : "Product added");
    if (item) router.refresh(); else { router.push(`/store/products`); router.refresh(); }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_320px]" noValidate>
      <div className="space-y-4">
        {catalogOwned ? <Alert tone="info" icon={<Lock className="h-4 w-4" />} title="Catalog product">Name, pack and image come from the shared Merta Deal catalog and are managed by admins. You control price, stock and limits below.</Alert> : null}
        <section className="rounded-lg border border-line bg-card p-4 shadow-card sm:p-5">
          <h2 className="mb-3 text-base font-bold text-ink">Product</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Product name" required value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} disabled={catalogOwned} placeholder="e.g. Aashirvaad Shudh Chakki Atta" wrapperClassName="sm:col-span-2" />
            <Select label="Category" required options={catOptions} placeholder="Choose a category" value={form.category_id} onChange={(e) => set("category_id", e.target.value)} error={errors.category_id} disabled={catalogOwned} />
            <Input label="Brand" value={form.brand_name} onChange={(e) => set("brand_name", e.target.value)} error={errors.brand_name} disabled={catalogOwned} placeholder="e.g. Aashirvaad, or leave blank for loose items" />
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <Input label="Weight / quantity" required type="number" inputMode="decimal" min={0} step="any" value={form.weight_value} onChange={(e) => set("weight_value", e.target.value)} error={errors.weight_value} disabled={catalogOwned} />
              <Select label="Unit" options={WEIGHT_UNITS.map((u) => ({ value: u, label: u }))} value={form.weight_unit} onChange={(e) => set("weight_unit", e.target.value as WeightUnit)} disabled={catalogOwned} />
            </div>
            <Input label="Pack label" value={form.pack_label} onChange={(e) => set("pack_label", e.target.value)} error={errors.pack_label} disabled={catalogOwned} placeholder={form.weight_value ? `${form.weight_value} ${form.weight_unit}` : "e.g. 5 kg bag"} hint="Shown to customers next to the name" />
          </div>
          <div className="mt-3"><Textarea label="Description" value={form.description} onChange={(e) => set("description", e.target.value)} error={errors.description} disabled={catalogOwned} placeholder="Ingredients, origin, why customers love it…" /></div>
          <div className="mt-3 flex flex-wrap gap-5">
            <Switch checked={form.is_veg} onChange={(v) => set("is_veg", v)} label={form.is_veg ? "Vegetarian" : "Non-vegetarian"} disabled={catalogOwned} />
            <Switch checked={form.is_local} onChange={(v) => set("is_local", v)} label="Local / Merta-made product" disabled={catalogOwned} />
          </div>
        </section>

        <section className="rounded-lg border border-line bg-card p-4 shadow-card sm:p-5">
          <h2 className="mb-3 text-base font-bold text-ink">Price & stock</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="MRP (₹)" required type="number" inputMode="decimal" min={0} step="0.5" value={form.mrp} onChange={(e) => set("mrp", e.target.value)} error={errors.mrp} />
            <Input label="Selling price (₹)" required type="number" inputMode="decimal" min={0} step="0.5" value={form.selling_price} onChange={(e) => set("selling_price", e.target.value)} error={errors.selling_price ?? (Number(form.selling_price) > Number(form.mrp) && form.mrp ? "Cannot be higher than MRP" : undefined)} rightSlot={pct > 0 ? <DiscountBadge pct={pct} /> : null} hint={pct > 0 ? `Customers see ${pct}% off` : "Must be at or below MRP"} />
            <Input label="Stock (units)" required type="number" inputMode="numeric" min={0} value={form.stock_qty} onChange={(e) => set("stock_qty", e.target.value)} error={errors.stock_qty} hint={item ? "Use the Inventory page for day-to-day +/- changes; this sets the exact count." : undefined} />
            <Input label="Low-stock alert at" type="number" inputMode="numeric" min={0} value={form.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} error={errors.low_stock_threshold} hint="You get a notification at this level" />
            <Input label="Max per order" type="number" inputMode="numeric" min={1} max={100} value={form.max_order_qty} onChange={(e) => set("max_order_qty", e.target.value)} error={errors.max_order_qty} />
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="rounded-lg border border-line bg-card p-4 shadow-card">
          <h2 className="mb-3 text-base font-bold text-ink">Photo</h2>
          <ProductImageManager primary={form.image_url} gallery={[]} folder={storeId} productName={form.name} brand={form.brand_name} packSize={form.pack_label} disabled={catalogOwned} max={1} onChange={(n) => set("image_url", n.image_url)} />
          <p className="mt-2 text-xs text-ink-3">{catalogOwned ? "Images for catalog products are managed by admins." : "Square photo on a plain background works best. Compressed on your phone before upload."}</p>
        </section>
        <div className="sticky bottom-0 -mx-3 border-t border-line bg-card/95 p-3 backdrop-blur safe-bottom sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="submit" size="lg" fullWidth loading={busy}>{item ? "Save changes" : "Add product"}</Button>
          {item ? <Button type="button" variant="ghost" fullWidth className="mt-2" href="/store/products">Back to products</Button> : null}
        </div>
      </aside>
    </form>
  );
}
