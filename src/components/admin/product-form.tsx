"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Barcode, ScanLine, Trash2, X } from "lucide-react";
import { Input, Select, Switch, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ProductImageManager } from "@/components/shared/product-image-manager";
import { FormSection, FormActions, useUnsavedChanges } from "@/components/admin/kit";
import { btn } from "@/components/admin/catalogue/bits";
import { WEIGHT_UNIT_OPTIONS } from "@/components/admin/constants";
import { deleteProductAction, type ProductInput } from "@/lib/actions/admin";
import { saveCatalogueProductAction, type SellerInput } from "@/lib/actions/admin-catalogue";
import { setBarcodeAction } from "@/lib/actions/scan";
import { Scanner } from "@/components/admin/scan/scanner";
import type { Product } from "@/types/app";
import { slugify } from "@/lib/utils";

type Opt = { id: string; name: string; parent_id?: string | null };

/** Comma/Enter-separated chip editor for text[] columns (tags, synonyms). */
export function ChipsInput({ label, value, onChange, placeholder, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; hint?: string }) {
  const [text, setText] = React.useState("");
  const id = React.useId();
  const add = () => { const parts = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean); if (parts.length) onChange([...new Set([...value, ...parts])]); setText(""); };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink-2">{label}</label>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-line-2 bg-card p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        {value.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full hover:text-brand-900"><X className="h-3 w-3" aria-hidden /></button></span>)}
        <input id={id} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder ?? "Type and press Enter"} className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm text-ink placeholder:text-ink-4 focus:outline-none" />
      </div>
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

type Seller = { shelf_life: string; seller_name: string; seller_address: string; seller_license: string };
type Snapshot = { f: ProductInput; nutritionText: string; seller: Seller };

function initial(product: Product | null): Snapshot {
  return {
    f: {
      name: product?.name ?? "", slug: product?.slug ?? "", brand_id: product?.brand_id ?? null, category_id: product?.category_id ?? "",
      description: product?.description ?? "", ingredients: product?.ingredients ?? "", manufacturer: product?.manufacturer ?? "", country_of_origin: product?.country_of_origin ?? "India", bin_location: product?.bin_location ?? "",
      weight_value: product?.weight_value ?? 1, weight_unit: (product?.weight_unit as ProductInput["weight_unit"]) ?? "kg", pack_label: product?.pack_label ?? "", mrp: product?.mrp ?? 0,
      image_url: product?.image_url ?? null, images: product?.images ?? [], tags: product?.tags ?? [], synonyms: product?.synonyms ?? [],
      nutrition: (product?.nutrition as Record<string, string | number> | null) ?? null,
      is_local: product?.is_local ?? false, is_veg: product?.is_veg ?? true, is_active: product?.is_active ?? true, popularity_score: product?.popularity_score ?? 0,
    },
    nutritionText: product?.nutrition ? JSON.stringify(product.nutrition, null, 2) : "",
    seller: { shelf_life: product?.shelf_life ?? "", seller_name: product?.seller_name ?? (product ? "" : "MertaDeal"), seller_address: product?.seller_address ?? "", seller_license: product?.seller_license ?? "" },
  };
}

function parseNutrition(text: string): { ok: true; value: Record<string, string | number> | null } | { ok: false } {
  if (!text.trim()) return { ok: true, value: null };
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.values(v).some((x) => typeof x !== "string" && typeof x !== "number")) return { ok: false };
    return { ok: true, value: v };
  } catch { return { ok: false }; }
}

/**
 * Full catalogue product form, grouped into labelled sections with a sticky Save / Cancel bar.
 * Saves through saveCatalogueProductAction = the existing saveProductAction (unchanged fields,
 * validation and audit) plus the seller-of-record / shelf-life columns.
 * The selling price and stock are NOT edited here; they live on the product's listing (see the product page).
 */
export function ProductForm({ product, categories, brands, barcode }: { product: Product | null; categories: Opt[]; brands: Opt[]; /** Scanned packet barcode to attach once the product exists (from Scan › unknown code). */ barcode?: string }) {
  const router = useRouter();
  const [state, setState] = React.useState<Snapshot>(() => initial(product));
  const [base, setBase] = React.useState<Snapshot>(() => initial(product));
  // Packet barcode (EAN/UPC): typed or scanned here, or handed over from Scan & pack via ?barcode=. Saved
  // through admin_set_product_barcode after the product row exists; empty clears it.
  const [bc, setBc] = React.useState(() => barcode ?? product?.barcode ?? "");
  const [scanning, setScanning] = React.useState(false);
  const bcBase = product?.barcode ?? "";
  const bcValid = bc === "" || /^[0-9]{8,14}$/.test(bc);
  const [busy, setBusy] = React.useState<"save" | "delete" | null>(null);
  const [del, setDel] = React.useState(false);
  const [slugTouched, setSlugTouched] = React.useState(Boolean(product));
  const [showErrors, setShowErrors] = React.useState(false);
  const { f, nutritionText, seller } = state;

  // Activate / deactivate in the page header changes the flag server-side; mirror it here so a later save can't revert it.
  const [prevActive, setPrevActive] = React.useState(product?.is_active);
  if (product && prevActive !== product.is_active) {
    setPrevActive(product.is_active);
    setState((s) => ({ ...s, f: { ...s.f, is_active: product.is_active } }));
    setBase((s) => ({ ...s, f: { ...s.f, is_active: product.is_active } }));
  }

  const dirty = JSON.stringify(state) !== JSON.stringify(base) || bc !== bcBase;
  const confirmDiscard = useUnsavedChanges(dirty && busy === null);
  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setState((s) => ({ ...s, f: { ...s.f, [k]: v } }));
  const setSeller = (k: keyof Seller, v: string) => setState((s) => ({ ...s, seller: { ...s.seller, [k]: v } }));
  const parentName = (id: string | null | undefined) => categories.find((c) => c.id === id)?.name;
  const catOptions = categories.map((c) => ({ value: c.id, label: c.parent_id ? `${parentName(c.parent_id) ?? ""} › ${c.name}` : c.name }));

  // Client-side checks that mirror the server schema, shown next to the fields.
  const nutrition = parseNutrition(nutritionText);
  const errors: Record<string, string | undefined> = {
    name: f.name.trim().length < 2 ? "Enter a product name (at least 2 characters)" : f.name.trim().length > 160 ? "Keep the name under 160 characters" : undefined,
    category_id: !f.category_id ? "Choose a category" : undefined,
    weight_value: !(Number(f.weight_value) > 0) ? "Enter a weight or volume above 0" : undefined,
    mrp: !(Number(f.mrp) >= 0) || f.mrp === "" ? "Enter the MRP (0 or more)" : undefined,
    popularity_score: !Number.isInteger(Number(f.popularity_score)) || Number(f.popularity_score) < 0 ? "Use a whole number, 0 or more" : undefined,
    nutrition: nutrition.ok ? undefined : "Use JSON with text or number values, e.g. {\"energy_kcal\": 340}",
    seller_address: seller.seller_address.length > 400 ? "Keep the address under 400 characters" : undefined,
    barcode: bcValid ? undefined : "A packet barcode is 8 to 14 digits (EAN-8, EAN-13, UPC)",
  };
  const errorKeys = Object.keys(errors).filter((k) => errors[k]);
  const err = (k: string) => (showErrors ? errors[k] : undefined);

  const leave = () => {
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === location.origin && ref.pathname === "/admin/products" && window.history.length > 1) { router.back(); return; }
    } catch { /* fall through */ }
    router.push("/admin/products");
  };

  const submit = async () => {
    if (errorKeys.length || !nutrition.ok) {
      setShowErrors(true);
      toast.error(errorKeys.length === 1 ? "Fix 1 field to save" : `Fix ${errorKeys.length} fields to save`, errors[errorKeys[0]]);
      document.getElementById(`pf-${errorKeys[0]}`)?.focus();
      return;
    }
    setBusy("save");
    const sellerInput: SellerInput = seller;
    const r = await saveCatalogueProductAction(product?.id ?? null, { ...f, nutrition: nutrition.value, slug: slugTouched ? f.slug : "" }, sellerInput);
    setBusy(null);
    if (!r.ok) { toast.error(product ? "Couldn't save the product" : "Couldn't create the product", r.error); return; }
    setBase(state); setShowErrors(false);
    let bcNote: string | null = null;
    if (bc !== bcBase) {
      const res = await setBarcodeAction(r.data.id, bc);
      if (!res.ok) toast.error(product ? "Saved, but the barcode was not changed" : "Product created, but the barcode was not attached", res.error);
      else bcNote = bc ? "Barcode attached." : "Barcode removed.";
    }
    if (!product) {
      toast.success("Product created", `${bcNote ? `${bcNote} ` : ""}Next: set its selling price and stock.`);
      router.push(`/admin/products/${r.data.id}`);
    }
    else { toast.success("Product saved", bcNote ?? undefined); router.refresh(); }
  };

  const remove = async () => {
    setBusy("delete");
    const r = await deleteProductAction(product!.id);
    setBusy(null);
    if (r.ok) { setBase(state); toast.success("Product deleted"); router.push("/admin/products"); }
    else { toast.error("Couldn't delete the product", r.error); setDel(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <FormSection title="Basics" description="How the product is named and filed.">
            <div className="space-y-3">
              <Input id="pf-name" label="Product name" required value={f.name} error={err("name")}
                onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(`${e.target.value} ${f.pack_label ?? ""}`)); }} />
              <Input id="pf-slug" label="Slug" value={f.slug ?? ""} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} hint="Web address: /p/<slug>. Generated from the name and pack until you edit it." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select id="pf-category_id" label="Category" required placeholder="Choose a category" options={catOptions} value={f.category_id} error={err("category_id")} onChange={(e) => set("category_id", e.target.value)} />
                <Select id="pf-brand" label="Brand" placeholder="No brand / unbranded" options={brands.map((b) => ({ value: b.id, label: b.name }))} value={f.brand_id ?? ""} onChange={(e) => set("brand_id", e.target.value || null)} />
              </div>
              <Textarea id="pf-description" label="Description" value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} hint="Shown on the product page." />
            </div>
          </FormSection>

          <FormSection title="Pack and MRP" description="The pack size and printed MRP. The selling price and stock are set on the product page.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Input id="pf-weight_value" label="Weight / volume" type="number" step="0.001" min={0} required value={f.weight_value as number} error={err("weight_value")} onChange={(e) => set("weight_value", e.target.value === "" ? "" : Number(e.target.value))} />
              <Select id="pf-weight_unit" label="Unit" options={WEIGHT_UNIT_OPTIONS} value={f.weight_unit} onChange={(e) => set("weight_unit", e.target.value as ProductInput["weight_unit"])} />
              <Input id="pf-pack_label" label="Pack label" placeholder="1 kg, Pack of 6" value={f.pack_label ?? ""} onChange={(e) => { set("pack_label", e.target.value); if (!slugTouched) set("slug", slugify(`${f.name} ${e.target.value}`)); }} />
              <Input id="pf-mrp" label="MRP (₹)" type="number" step="0.01" min={0} required value={f.mrp as number} error={err("mrp")} onChange={(e) => set("mrp", e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          </FormSection>

          <FormSection title="Packet barcode" description="Scan the printed EAN/UPC on the packet so staff can find this product with the camera in Scan & pack. Loose items without a barcode get a printed QR label instead.">
            <div className="flex flex-wrap items-end gap-2">
              <Input id="pf-barcode" label="Barcode (8–14 digits)" inputMode="numeric" placeholder="e.g. 8901030835289" value={bc} error={err("barcode")} onChange={(e) => setBc(e.target.value.replace(/\s/g, ""))} leftIcon={<Barcode className="h-4 w-4" />} wrapperClassName="min-w-[16rem] flex-1" />
              <button type="button" onClick={() => setScanning((v) => !v)} aria-pressed={scanning} className={btn.outline}><ScanLine className="h-4 w-4" aria-hidden />{scanning ? "Stop camera" : "Scan with camera"}</button>
              {bc ? <button type="button" onClick={() => { setBc(""); setScanning(false); }} className={btn.outline}><X className="h-4 w-4" aria-hidden />Clear</button> : null}
            </div>
            {scanning ? (
              <div className="mt-3">
                <Scanner active={scanning} onCode={(code) => { const c = code.replace(/\s/g, ""); if (/^[0-9]{8,14}$/.test(c)) { setBc(c); setScanning(false); toast.success("Barcode read", c); } else toast.error("That is not a packet barcode", "Point the camera at the printed EAN/UPC bars on the packet."); }} manualLabel="Or type the barcode" hint="Hold the packet's barcode inside the frame." />
              </div>
            ) : null}
          </FormSection>

          <FormSection title="Details and nutrition" description="Shown under Product details on the customer page. Leave a field empty to hide it.">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input id="pf-manufacturer" label="Manufacturer" value={f.manufacturer ?? ""} onChange={(e) => set("manufacturer", e.target.value)} />
                <Input id="pf-country" label="Country of origin" value={f.country_of_origin ?? ""} onChange={(e) => set("country_of_origin", e.target.value)} />
                <Input id="pf-bin" label="Bin / shelf location" placeholder="e.g. A-12, Cold room 2" maxLength={40} value={f.bin_location ?? ""} onChange={(e) => set("bin_location", e.target.value)} hint="Printed on pick lists so packers find it fast." />
                <Input id="pf-shelf_life" label="Shelf life" placeholder="e.g. 3 days, 6 months" maxLength={80} value={seller.shelf_life} onChange={(e) => setSeller("shelf_life", e.target.value)} />
              </div>
              <Textarea id="pf-ingredients" label="Ingredients" value={f.ingredients ?? ""} onChange={(e) => set("ingredients", e.target.value)} />
              <Textarea id="pf-nutrition" label="Nutrition (JSON)" value={nutritionText} error={err("nutrition")} onChange={(e) => setState((s) => ({ ...s, nutritionText: e.target.value }))} placeholder='{"energy_kcal": 340, "protein_g": 12}' className="font-mono text-xs" hint="Per 100 g or per serving, as printed on the pack." />
            </div>
          </FormSection>

          <FormSection title="Seller information" description="The seller of record shown on the product page. Set per product; leave empty if not applicable.">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input id="pf-seller_name" label="Seller name" maxLength={160} value={seller.seller_name} onChange={(e) => setSeller("seller_name", e.target.value)} />
                <Input id="pf-seller_license" label="Seller licence no. (FSSAI)" maxLength={80} value={seller.seller_license} onChange={(e) => setSeller("seller_license", e.target.value)} />
              </div>
              <Textarea id="pf-seller_address" label="Seller address" maxLength={400} value={seller.seller_address} error={err("seller_address")} onChange={(e) => setSeller("seller_address", e.target.value)} className="min-h-20" />
            </div>
          </FormSection>

          <FormSection title="Search and discovery" description="Helps customers find the product with the words they actually type.">
            <div className="space-y-3">
              <ChipsInput label="Synonyms (Hinglish / regional names)" value={f.synonyms ?? []} onChange={(v) => set("synonyms", v)} placeholder="aata, gehu, flour" hint="Weighted highest in search." />
              <ChipsInput label="Tags" value={f.tags ?? []} onChange={(v) => set("tags", v)} placeholder="staple, chakki, organic" />
              <Input id="pf-popularity_score" label="Popularity score" type="number" min={0} step={1} value={(f.popularity_score as number) ?? 0} error={err("popularity_score")} onChange={(e) => set("popularity_score", e.target.value === "" ? "" : Number(e.target.value))} hint="Manual boost for Best sellers and Popular rankings." />
            </div>
          </FormSection>
        </div>

        <aside className="min-w-0 space-y-4">
          <FormSection title="Images" description="Transparent cut-outs on white look best. The first image is the main photo.">
            <ProductImageManager primary={f.image_url ?? null} gallery={f.images ?? []} folder="admin" productName={f.name} brand={brands.find((b) => b.id === f.brand_id)?.name ?? null} packSize={f.pack_label ?? null} onChange={(n) => setState((s) => ({ ...s, f: { ...s.f, image_url: n.image_url, images: n.images } }))} />
          </FormSection>
          <FormSection title="Visibility" description="Customers see the product only while it is active.">
            <div className="space-y-3">
              <Switch checked={Boolean(f.is_active)} onChange={(v) => set("is_active", v)} label="Active (visible)" />
              <Switch checked={Boolean(f.is_veg)} onChange={(v) => set("is_veg", v)} label="Vegetarian" />
              <Switch checked={Boolean(f.is_local)} onChange={(v) => set("is_local", v)} label="Local product of Merta" />
            </div>
          </FormSection>
          {product ? (
            <FormSection title="Delete product" description="Products with past orders can't be deleted; deactivate them instead. Its price and stock are removed with it.">
              <button type="button" className={btn.danger} onClick={() => setDel(true)} disabled={busy !== null}><Trash2 className="h-4 w-4" aria-hidden />Delete product</button>
            </FormSection>
          ) : null}
        </aside>
      </div>

      <FormActions dirty={dirty} saving={busy === "save"} submitLabel={product ? "Save changes" : "Create product"} onCancel={() => { if (confirmDiscard()) leave(); }} />

      <ConfirmDialog open={del} onClose={() => setDel(false)} tone="danger" title={`Delete “${product?.name ?? "this product"}”?`}
        description="This can't be undone. Products with past orders can't be deleted; deactivate them instead. Its price and stock will be removed."
        confirmLabel="Delete product" loading={busy === "delete"} onConfirm={remove} />
    </form>
  );
}
