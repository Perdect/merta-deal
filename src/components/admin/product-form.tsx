"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Switch, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ProductImageManager } from "@/components/shared/product-image-manager";
import { WEIGHT_UNIT_OPTIONS } from "@/components/admin/constants";
import { saveProductAction, deleteProductAction, type ProductInput } from "@/lib/actions/admin";
import type { Product } from "@/types/app";
import { slugify } from "@/lib/utils";

type Opt = { id: string; name: string; parent_id?: string | null };

/** Comma/Enter-separated chip editor for text[] columns (tags, synonyms). */
export function ChipsInput({ label, value, onChange, placeholder, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; hint?: string }) {
  const [text, setText] = React.useState("");
  const add = () => { const parts = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean); if (parts.length) onChange([...new Set([...value, ...parts])]); setText(""); };
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink-2">{label}</label>
      <div className="flex flex-wrap gap-1.5 rounded-sm border border-line-2 bg-card p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        {value.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}><X className="h-3 w-3" /></button></span>)}
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder ?? "Type and press Enter"} className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm text-ink placeholder:text-ink-4 focus:outline-none" />
      </div>
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function ProductForm({ product, categories, brands }: { product: Product | null; categories: Opt[]; brands: Opt[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [del, setDel] = React.useState(false);
  const [f, setF] = React.useState<ProductInput>({
    name: product?.name ?? "", slug: product?.slug ?? "", brand_id: product?.brand_id ?? null, category_id: product?.category_id ?? "",
    description: product?.description ?? "", ingredients: product?.ingredients ?? "", manufacturer: product?.manufacturer ?? "", country_of_origin: product?.country_of_origin ?? "India",
    weight_value: product?.weight_value ?? 1, weight_unit: (product?.weight_unit as ProductInput["weight_unit"]) ?? "kg", pack_label: product?.pack_label ?? "", mrp: product?.mrp ?? 0,
    image_url: product?.image_url ?? null, images: product?.images ?? [], tags: product?.tags ?? [], synonyms: product?.synonyms ?? [],
    nutrition: (product?.nutrition as Record<string, string | number> | null) ?? null,
    is_local: product?.is_local ?? false, is_veg: product?.is_veg ?? true, is_active: product?.is_active ?? true, is_approved: product?.is_approved ?? true, popularity_score: product?.popularity_score ?? 0,
  });
  const [slugTouched, setSlugTouched] = React.useState(Boolean(product));
  const [nutritionText, setNutritionText] = React.useState(product?.nutrition ? JSON.stringify(product.nutrition, null, 2) : "");
  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const catOptions = categories.map((c) => ({ value: c.id, label: c.parent_id ? `— ${c.name}` : c.name }));

  const submit = async () => {
    let nutrition: Record<string, string | number> | null = null;
    if (nutritionText.trim()) { try { nutrition = JSON.parse(nutritionText); } catch { toast.error("Nutrition must be valid JSON, e.g. {\"energy_kcal\": 340}"); return; } }
    setBusy(true);
    const r = await saveProductAction(product?.id ?? null, { ...f, nutrition, slug: slugTouched ? f.slug : "" });
    setBusy(false);
    if (r.ok) { toast.success(product ? "Product saved" : "Product created"); if (!product) router.push(`/admin/products/${r.data.id}`); else router.refresh(); }
    else toast.error(r.error);
  };
  const remove = async () => { setBusy(true); const r = await deleteProductAction(product!.id); setBusy(false); if (r.ok) { toast.success("Product deleted"); router.push("/admin/products"); } else { toast.error(r.error); setDel(false); } };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <section className="space-y-3 rounded-lg border border-line bg-card p-4">
          <h2 className="text-base font-semibold text-ink">Basics</h2>
          <Input label="Product name" required value={f.name} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(`${e.target.value} ${f.pack_label ?? ""}`)); }} />
          <Input label="Slug" value={f.slug ?? ""} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} hint="URL: /p/<slug>. Auto-generated from name + pack." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Category" required placeholder="Choose category" options={catOptions} value={f.category_id} onChange={(e) => set("category_id", e.target.value)} />
            <Select label="Brand" placeholder="No brand / unbranded" options={brands.map((b) => ({ value: b.id, label: b.name }))} value={f.brand_id ?? ""} onChange={(e) => set("brand_id", e.target.value || null)} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Input label="Weight / volume" type="number" step="0.001" min={0} required value={f.weight_value as number} onChange={(e) => set("weight_value", Number(e.target.value))} />
            <Select label="Unit" options={WEIGHT_UNIT_OPTIONS} value={f.weight_unit} onChange={(e) => set("weight_unit", e.target.value as ProductInput["weight_unit"])} />
            <Input label="Pack label" placeholder="1 kg, Pack of 6" value={f.pack_label ?? ""} onChange={(e) => { set("pack_label", e.target.value); if (!slugTouched) set("slug", slugify(`${f.name} ${e.target.value}`)); }} />
            <Input label="MRP (₹)" type="number" step="0.01" min={0} required value={f.mrp as number} onChange={(e) => set("mrp", Number(e.target.value))} />
          </div>
          <Textarea label="Description" value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </section>

        <section className="space-y-3 rounded-lg border border-line bg-card p-4">
          <h2 className="text-base font-semibold text-ink">Search & discovery</h2>
          <ChipsInput label="Synonyms (Hinglish / regional names)" value={f.synonyms ?? []} onChange={(v) => set("synonyms", v)} placeholder="aata, gehu, flour" hint="Weighted highest in search. Use the words customers actually type." />
          <ChipsInput label="Tags" value={f.tags ?? []} onChange={(v) => set("tags", v)} placeholder="staple, chakki, organic" />
          <Input label="Popularity score" type="number" min={0} value={(f.popularity_score as number) ?? 0} onChange={(e) => set("popularity_score", Number(e.target.value))} hint="Manual boost for ranking in Best sellers / Popular." />
        </section>

        <section className="space-y-3 rounded-lg border border-line bg-card p-4">
          <h2 className="text-base font-semibold text-ink">Details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Manufacturer" value={f.manufacturer ?? ""} onChange={(e) => set("manufacturer", e.target.value)} />
            <Input label="Country of origin" value={f.country_of_origin ?? ""} onChange={(e) => set("country_of_origin", e.target.value)} />
          </div>
          <Textarea label="Ingredients" value={f.ingredients ?? ""} onChange={(e) => set("ingredients", e.target.value)} />
          <Textarea label="Nutrition (JSON)" value={nutritionText} onChange={(e) => setNutritionText(e.target.value)} placeholder='{"energy_kcal": 340, "protein_g": 12}' className="font-mono text-xs" />
        </section>
      </div>

      <aside className="space-y-4">
        <section className="space-y-3 rounded-lg border border-line bg-card p-4">
          <h2 className="text-base font-semibold text-ink">Images</h2>
          <ProductImageManager primary={f.image_url ?? null} gallery={f.images ?? []} folder="admin" productName={f.name} brand={brands.find((b) => b.id === f.brand_id)?.name ?? null} packSize={f.pack_label ?? null} onChange={(n) => { set("image_url", n.image_url); set("images", n.images); }} />
        </section>
        <section className="space-y-3 rounded-lg border border-line bg-card p-4">
          <h2 className="text-base font-semibold text-ink">Flags</h2>
          <Switch checked={Boolean(f.is_active)} onChange={(v) => set("is_active", v)} label="Active (visible)" />
          <Switch checked={Boolean(f.is_approved)} onChange={(v) => set("is_approved", v)} label="Approved" />
          <Switch checked={Boolean(f.is_veg)} onChange={(v) => set("is_veg", v)} label="Vegetarian" />
          <Switch checked={Boolean(f.is_local)} onChange={(v) => set("is_local", v)} label="Local product of Merta" />
        </section>
        <div className="flex gap-2">
          <Button type="submit" loading={busy} fullWidth>{product ? "Save changes" : <><Plus className="h-4 w-4" /> Create product</>}</Button>
          {product ? <Button type="button" variant="outline" className="text-danger" onClick={() => setDel(true)} aria-label="Delete product"><Trash2 className="h-4 w-4" /></Button> : null}
        </div>
      </aside>
      <ConfirmDialog open={del} onClose={() => setDel(false)} tone="danger" title="Delete this product?" description="Products with past orders cannot be deleted; deactivate them instead. Store inventory rows for this product will be removed." confirmLabel="Delete" loading={busy} onConfirm={remove} />
    </form>
  );
}
