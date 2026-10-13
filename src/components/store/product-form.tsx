"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Lock, PackagePlus } from "lucide-react";
import { Input, Textarea, Select, Switch } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { DiscountBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ProductImageManager } from "@/components/shared/product-image-manager";
import { saveStoreProductAction, type StoreProductInput } from "@/lib/actions/store";
import { StockSheet, type StockTarget } from "./stock-sheet";
import { afterOverlayClose } from "@/hooks/use-back-to-close";
import { WEIGHT_UNITS, type WeightUnit } from "./constants";
import type { CategoryGroup, StoreInventoryRow } from "@/lib/data/store";
import { discountPct } from "@/lib/utils";
import { categoryOptions } from "./category-options";

type FormState = { name: string; category_id: string; brand_name: string; weight_value: string; weight_unit: WeightUnit; pack_label: string; mrp: string; selling_price: string; stock_qty: string; low_stock_threshold: string; max_order_qty: string; description: string; image_url: string | null; is_veg: boolean; is_local: boolean; is_active: boolean };
type Errors = Partial<Record<keyof FormState, string>>;

const blank: FormState = { name: "", category_id: "", brand_name: "", weight_value: "", weight_unit: "g", pack_label: "", mrp: "", selling_price: "", stock_qty: "10", low_stock_threshold: "5", max_order_qty: "5", description: "", image_url: null, is_veg: true, is_local: false, is_active: true };
/** Field order on screen — the first invalid one gets focus. */
const FIELD_ORDER: (keyof FormState)[] = ["name", "category_id", "brand_name", "weight_value", "pack_label", "description", "mrp", "selling_price", "stock_qty", "low_stock_threshold", "max_order_qty"];

function fromRow(r: StoreInventoryRow): FormState {
  const p = r.product;
  return { name: p.name, category_id: p.category_id, brand_name: p.brand?.name ?? "", weight_value: String(p.weight_value), weight_unit: (WEIGHT_UNITS as readonly string[]).includes(p.weight_unit) ? (p.weight_unit as WeightUnit) : "g", pack_label: p.pack_label ?? "", mrp: String(r.mrp), selling_price: String(r.selling_price), stock_qty: String(r.stock_qty), low_stock_threshold: String(r.low_stock_threshold), max_order_qty: String(r.max_order_qty), description: p.description ?? "", image_url: p.image_url, is_veg: p.is_veg, is_local: p.is_local, is_active: r.is_active };
}
const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const isInt = (v: string) => /^\d+$/.test(v.trim());

/** Same rules as the server (saveStoreProductAction), checked before sending so errors show per field at once. */
function validate(f: FormState, opts: { editing: boolean; catalogOwned: boolean }): Errors {
  const e: Errors = {};
  if (!opts.catalogOwned) {
    if (f.name.trim().length < 2) e.name = "Enter the product name (at least 2 letters).";
    else if (f.name.trim().length > 120) e.name = "Keep the name under 120 characters.";
    if (!f.category_id) e.category_id = "Pick a category.";
    if (!(num(f.weight_value) > 0)) e.weight_value = "Enter the weight or quantity, e.g. 500.";
    if (f.pack_label.trim().length > 40) e.pack_label = "Keep this under 40 characters.";
    if (f.brand_name.trim().length > 60) e.brand_name = "Keep this under 60 characters.";
  }
  const mrp = num(f.mrp); const sp = num(f.selling_price);
  if (!(mrp > 0)) e.mrp = "Enter the MRP printed on the pack.";
  else if (mrp > 1_000_000) e.mrp = "That's more than ₹10,00,000 — check the number.";
  if (!(sp > 0)) e.selling_price = "Enter your selling price.";
  else if (mrp > 0 && sp > mrp) e.selling_price = "Selling price can't be higher than MRP.";
  if (!opts.editing) {
    if (!isInt(f.stock_qty)) e.stock_qty = "Enter a whole number, 0 or more.";
    else if (Number(f.stock_qty) > 100000) e.stock_qty = "That's more than 100,000 — check the number.";
  }
  if (!isInt(f.low_stock_threshold) || Number(f.low_stock_threshold) > 1000) e.low_stock_threshold = "Enter a whole number from 0 to 1,000.";
  if (!isInt(f.max_order_qty) || Number(f.max_order_qty) < 1 || Number(f.max_order_qty) > 100) e.max_order_qty = "Enter a whole number from 1 to 100.";
  return e;
}

/**
 * Create / edit a listing. Phones: full-screen form (own top bar, sticky Save bar that stays above the
 * keyboard); desktop: page with the photo + save panel on the right.
 * - Sections: details, pricing, stock, visibility. Visibility ("Visible to customers") is separate from stock.
 * - Editing never overwrites stock: the count is shown live and changed via "Update stock" (logged), so an
 *   order placed while the form is open is never undone.
 * - Field errors are shown inline and the first one is focused; Save can't be sent twice; values stay put on
 *   failure; leaving with unsaved changes asks first.
 */
export function ProductForm({ storeId, categories, item, backHref = "/store/products", embedded = false }: { storeId: string; categories: CategoryGroup[]; item?: StoreInventoryRow | null; backHref?: string; embedded?: boolean }) {
  const router = useRouter();
  const editing = Boolean(item);
  const [form, setForm] = React.useState<FormState>(() => (item ? fromRow(item) : blank));
  const [saved, setSaved] = React.useState<FormState>(() => (item ? fromRow(item) : blank));
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [leaveTo, setLeaveTo] = React.useState<string | null>(null);
  const [stock, setStock] = React.useState(item?.stock_qty ?? 0);
  const [stockFor, setStockFor] = React.useState<StockTarget | null>(null);
  const inflight = React.useRef(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  // A fresh server copy (after save or router.refresh) resets the baseline but never discards typing.
  const [seenItem, setSeenItem] = React.useState(item);
  if (seenItem !== item) { setSeenItem(item); if (item) { setStock(item.stock_qty); } }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e)); setResult(null); };
  const catalogOwned = Boolean(item && item.product.created_by_store_id !== storeId);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const pct = discountPct(num(form.mrp), num(form.selling_price));
  const catOptions = categoryOptions(categories, item?.product.category ? { id: item.product.category.id, name: item.product.category.name } : null);
  const errorCount = Object.values(errors).filter(Boolean).length;

  // Unsaved changes: warn on reload/close, and on in-app links (captured before Next handles the click).
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      e.preventDefault(); e.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", onBeforeUnload); document.removeEventListener("click", onClick, true); };
  }, [dirty]);

  // Keep focused fields clear of the sticky Save bar (and the on-screen keyboard, which resizes the viewport).
  React.useEffect(() => {
    const html = document.documentElement; const prev = html.style.scrollPaddingBottom;
    html.style.scrollPaddingBottom = "112px";
    return () => { html.style.scrollPaddingBottom = prev; };
  }, []);

  const leave = (href: string) => { if (dirty) setLeaveTo(href); else router.push(href); };

  const focusFirst = (errs: Errors) => {
    const k = FIELD_ORDER.find((f) => errs[f]);
    if (!k) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[name="${k}"]`);
    el?.focus({ preventScroll: true }); el?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inflight.current) return;
    const errs = validate(form, { editing, catalogOwned });
    if (Object.values(errs).some(Boolean)) { setErrors(errs); setResult({ tone: "danger", text: "Fix the highlighted fields, then save again." }); focusFirst(errs); return; }
    inflight.current = true; setBusy(true); setErrors({}); setResult(null);
    const input: StoreProductInput = {
      product_id: item?.product_id ?? null, name: form.name.trim(), category_id: form.category_id, brand_name: form.brand_name, weight_value: num(form.weight_value), weight_unit: form.weight_unit, pack_label: form.pack_label,
      mrp: num(form.mrp), selling_price: num(form.selling_price),
      stock_qty: editing ? null : Number(form.stock_qty),
      low_stock_threshold: Number(form.low_stock_threshold), max_order_qty: Number(form.max_order_qty),
      description: form.description, image_url: form.image_url, is_veg: form.is_veg, is_local: form.is_local, is_active: form.is_active,
    };
    try {
      const r = await saveStoreProductAction(storeId, input);
      if (!r.ok) {
        const fe = (r.fieldErrors ?? {}) as Errors;
        setErrors(fe); setResult({ tone: "danger", text: `${r.error} Your changes are still here — nothing was saved.` }); focusFirst(fe);
        return;
      }
      setSaved(form);
      if (!editing) {
        toast.success("Product added", form.is_active ? "Customers can see it now." : "Hidden from customers until you switch it on.");
        router.push(backHref); router.refresh();
        return;
      }
      setResult({ tone: "success", text: "Changes saved." });
      toast.success("Product updated", form.name);
      router.refresh();
    } catch {
      setResult({ tone: "danger", text: "Couldn't reach the server. Check your connection and save again — your changes are still here." });
    } finally {
      inflight.current = false; setBusy(false);
    }
  };

  const title = editing ? "Edit product" : "New product";
  const saveLabel = busy ? "Saving…" : editing ? "Save changes" : "Add product";

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-busy={busy} className={embedded ? undefined : "max-lg:-mx-4 max-lg:-mt-4"}>
      {/* Phones/tablets: full-screen form header (the store tabs are hidden on this route). */}
      {embedded ? null : <>
      <div className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line bg-card px-2 lg:hidden" style={{ paddingTop: "var(--safe-top)" }}>
        <button type="button" onClick={() => leave(backHref)} aria-label="Back to products" className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold text-ink">{title}</h1>
        {dirty ? <span className="mr-2 shrink-0 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-[#6b4d00]">Unsaved</span> : null}
      </div>

      <div className="hidden items-center gap-3 pb-4 lg:flex">
        <Button type="button" variant="ghost" size="sm" onClick={() => leave(backHref)}><ArrowLeft className="h-4 w-4" aria-hidden /> Products</Button>
        <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-extrabold text-ink">{editing ? form.name || title : title}</h1>
        {dirty ? <span className="rounded-full bg-warning-50 px-2.5 py-1 text-xs font-semibold text-[#6b4d00]">Unsaved changes</span> : null}
      </div>
      </>}

      <div className={embedded ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" : "grid gap-4 max-lg:px-4 max-lg:pt-4 lg:grid-cols-[minmax(0,1fr)_320px]"}>
        <div className="min-w-0 space-y-4">
          {result ? <Alert tone={result.tone} title={result.tone === "success" ? "Saved" : errorCount ? (errorCount === 1 ? "1 field needs attention" : `${errorCount} fields need attention`) : "Not saved"} icon={result.tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : undefined}>{result.text}</Alert> : null}
          {catalogOwned ? <Alert tone="info" icon={<Lock className="h-4 w-4" />} title="Catalog product">Name, pack, description and photo come from the shared Merta Deal catalog and are managed by admins. You control price, stock, limits and visibility.</Alert> : null}

          <section aria-labelledby="sec-details" className="rounded-lg border border-line bg-card p-4 shadow-card sm:p-5">
            <h2 id="sec-details" className="mb-3 text-base font-bold text-ink">Product details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="name" label="Product name" required value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} disabled={catalogOwned} placeholder="e.g. Aashirvaad Shudh Chakki Atta" wrapperClassName="sm:col-span-2" maxLength={120} autoComplete="off" />
              <Select name="category_id" label="Category" required options={catOptions} placeholder="Choose a category" value={form.category_id} onChange={(e) => set("category_id", e.target.value)} error={errors.category_id} disabled={catalogOwned} />
              <Input name="brand_name" label="Brand (optional)" value={form.brand_name} onChange={(e) => set("brand_name", e.target.value)} error={errors.brand_name} disabled={catalogOwned} placeholder="Leave blank for loose items" maxLength={60} autoComplete="off" />
              <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                <Input name="weight_value" label="Weight / quantity" required type="number" inputMode="decimal" min={0} step="any" value={form.weight_value} onChange={(e) => set("weight_value", e.target.value)} error={errors.weight_value} disabled={catalogOwned} />
                <Select name="weight_unit" label="Unit" options={WEIGHT_UNITS.map((u) => ({ value: u, label: u }))} value={form.weight_unit} onChange={(e) => set("weight_unit", e.target.value as WeightUnit)} disabled={catalogOwned} />
              </div>
              <Input name="pack_label" label="Pack size shown to customers" value={form.pack_label} onChange={(e) => set("pack_label", e.target.value)} error={errors.pack_label} disabled={catalogOwned} placeholder={form.weight_value ? `${form.weight_value} ${form.weight_unit}` : "e.g. 5 kg bag"} hint="Leave blank to use the weight" maxLength={40} />
            </div>
            <div className="mt-3"><Textarea name="description" label="Description (optional)" value={form.description} onChange={(e) => set("description", e.target.value)} error={errors.description} disabled={catalogOwned} placeholder="Ingredients, origin, why customers love it…" maxLength={2000} /></div>
            <div className="mt-2 flex flex-wrap gap-x-6">
              <Switch checked={form.is_veg} onChange={(v) => set("is_veg", v)} label={form.is_veg ? "Vegetarian" : "Non-vegetarian"} disabled={catalogOwned} />
              <Switch checked={form.is_local} onChange={(v) => set("is_local", v)} label="Local / Merta-made" disabled={catalogOwned} />
            </div>
          </section>

          <section aria-labelledby="sec-price" className="rounded-lg border border-line bg-card p-4 shadow-card sm:p-5">
            <h2 id="sec-price" className="mb-3 text-base font-bold text-ink">Pricing</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="mrp" label="MRP (₹)" required type="number" inputMode="decimal" min={0} step="0.5" value={form.mrp} onChange={(e) => set("mrp", e.target.value)} error={errors.mrp} hint="Printed on the pack" />
              <Input name="selling_price" label="Selling price (₹)" required type="number" inputMode="decimal" min={0} step="0.5" value={form.selling_price} onChange={(e) => set("selling_price", e.target.value)}
                error={errors.selling_price ?? (num(form.selling_price) > num(form.mrp) ? "Selling price can't be higher than MRP." : undefined)} rightSlot={pct > 0 ? <DiscountBadge pct={pct} /> : null} hint={pct > 0 ? `Customers see ${pct}% off` : "At or below MRP"} />
            </div>
          </section>

          <section aria-labelledby="sec-stock" className="rounded-lg border border-line bg-card p-4 shadow-card sm:p-5">
            <h2 id="sec-stock" className="mb-3 text-base font-bold text-ink">Stock</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {editing ? (
                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface px-3.5 py-3">
                  <div><p className="text-sm text-ink-2">In stock now</p><p className="text-2xl font-extrabold text-ink tabular" aria-live="polite">{stock} <span className="text-sm font-semibold text-ink-3">unit{stock === 1 ? "" : "s"}</span></p></div>
                  <Button type="button" variant="secondary" onClick={() => item && setStockFor({ id: item.id, name: form.name || item.product.name, stock })}><PackagePlus className="h-4 w-4" aria-hidden /> Update stock</Button>
                  <p className="w-full text-xs text-ink-3">Stock changes are saved straight away and logged, so orders placed while you edit are never undone.</p>
                </div>
              ) : (
                <Input name="stock_qty" label="Opening stock (units)" required type="number" inputMode="numeric" min={0} step={1} value={form.stock_qty} onChange={(e) => set("stock_qty", e.target.value)} error={errors.stock_qty} />
              )}
              <Input name="low_stock_threshold" label="Low-stock alert at" type="number" inputMode="numeric" min={0} step={1} value={form.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} error={errors.low_stock_threshold} hint="You get a notification at this level" />
              <Input name="max_order_qty" label="Max per order" type="number" inputMode="numeric" min={1} max={100} step={1} value={form.max_order_qty} onChange={(e) => set("max_order_qty", e.target.value)} error={errors.max_order_qty} hint="Packs one customer can buy in an order" />
            </div>
          </section>

          <section aria-labelledby="sec-visibility" className="rounded-lg border border-line bg-card p-4 shadow-card sm:p-5">
            <h2 id="sec-visibility" className="mb-1 text-base font-bold text-ink">Visibility</h2>
            <Switch checked={form.is_active} onChange={(v) => set("is_active", v)} label="Visible to customers" description={form.is_active ? "Shown in the shop. If stock runs out, customers see “Out of stock”." : "Hidden from the shop. Stock and price are kept for later."} />
            {item && (item.product.is_active === false || item.product.is_approved === false || item.product.category?.is_active === false) ? (
              <Alert tone="warning" className="mt-2" title="Hidden by Merta Deal admin">
                {item.product.is_active === false ? "This product is switched off in the shared catalog" : item.product.is_approved === false ? "This product is waiting for admin approval" : `The “${item.product.category?.name}” category is switched off`}, so customers can&apos;t see it even when the switch above is on. Contact Merta Deal support to turn it back on.
              </Alert>
            ) : null}
          </section>
        </div>

        <aside className="min-w-0 space-y-4">
          <section aria-labelledby="sec-photo" className="rounded-lg border border-line bg-card p-4 shadow-card">
            <h2 id="sec-photo" className="mb-3 text-base font-bold text-ink">Photo</h2>
            <ProductImageManager primary={form.image_url} gallery={[]} folder={storeId} productName={form.name} brand={form.brand_name} packSize={form.pack_label} disabled={catalogOwned} max={1} onChange={(n) => set("image_url", n.image_url)} />
            <p className="mt-2 text-xs text-ink-3">{catalogOwned ? "Photos of catalog products are managed by admins." : "Square photo on a plain background works best. It's compressed on your phone before upload."}</p>
          </section>
          {/* Save bar: sticky at the bottom on phones (above the keyboard), part of the side panel on desktop. */}
          <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-card/95 px-4 pt-3 backdrop-blur lg:static lg:mx-0 lg:rounded-lg lg:border lg:bg-card lg:p-4 lg:shadow-card" style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}>
            <div className="flex gap-2 lg:flex-col">
              <Button type="button" variant="outline" size="lg" className="flex-1 lg:order-2" onClick={() => leave(backHref)} disabled={busy}>Cancel</Button>
              <Button type="submit" size="lg" className="flex-[2] lg:order-1" loading={busy} disabled={busy || (editing && !dirty)}>{saveLabel}</Button>
            </div>
            {editing && !dirty && !busy ? <p className="mt-2 text-center text-xs text-ink-3">No unsaved changes</p> : null}
          </div>
        </aside>
      </div>

      <ConfirmDialog open={leaveTo !== null} onClose={() => setLeaveTo(null)} tone="danger" title="Discard unsaved changes?" description="Your edits to this product haven't been saved." confirmLabel="Discard"
        onConfirm={() => { const to = leaveTo!; setSaved(form); setLeaveTo(null); afterOverlayClose(() => router.push(to)); }} />
      <StockSheet target={stockFor} onClose={() => setStockFor(null)} onDone={(n) => { setStock(n); setStockFor(null); router.refresh(); }} />
    </form>
  );
}
