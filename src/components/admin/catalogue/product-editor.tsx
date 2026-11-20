"use client";
import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Barcode, ExternalLink, History, Image as ImageIcon, Info, Ruler, ScanLine, Search, Tags, Trash2, X } from "lucide-react";
import { Input, Select, Switch, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ProductImage } from "@/components/shop/product-image";
import { ProductImageManager } from "@/components/shared/product-image-manager";
import { CollapsibleSection, FormActions, StatusPill, useUnsavedChanges, card, rupees } from "@/components/admin/kit";
import { btn, StockPill } from "./bits";
import { WEIGHT_UNIT_OPTIONS } from "@/components/admin/constants";
import { deleteProductAction, type ProductInput } from "@/lib/actions/admin";
import { saveCatalogueProductAction, updateListingAction, createListingAction, type SellerInput } from "@/lib/actions/admin-catalogue";
import { setBarcodeAction } from "@/lib/actions/scan";
import type { Listing, StockMovement } from "@/lib/data/admin-catalogue";
import type { ScanProduct } from "@/lib/scan/types";
import type { Product } from "@/types/app";
import { cn, formatDateTime, slugify, timeAgo } from "@/lib/utils";
import { categoryOptions, isCategoryHidden, type CategoryLike } from "@/lib/categories";

/* The camera and the QR label pull in their own libraries; neither is needed to edit a product, so
   both load only when their section is opened. */
const Scanner = dynamic(() => import("@/components/admin/scan/scanner").then((m) => m.Scanner), { ssr: false, loading: () => <p className="text-sm text-ink-3">Starting the camera…</p> });
const ProductIdentity = dynamic(() => import("@/components/admin/scan/product-identity").then((m) => m.ProductIdentity), { ssr: false, loading: () => <p className="text-sm text-ink-3">Loading the label…</p> });

type Opt = { id: string; name: string };

/** Comma/Enter-separated chip editor for text[] columns (tags, synonyms). */
export function ChipsInput({ label, value, onChange, placeholder, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; hint?: string }) {
  const [text, setText] = React.useState("");
  const id = React.useId();
  const add = () => { const parts = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean); if (parts.length) onChange([...new Set([...value, ...parts])]); setText(""); };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink-2">{label}</label>
      <div className="flex flex-wrap gap-1.5 rounded-sm border border-line-2 bg-card p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        {value.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full hover:text-brand-900"><X className="h-3 w-3" aria-hidden /></button></span>)}
        <input id={id} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder ?? "Type and press Enter"} className="min-w-32 flex-1 bg-transparent px-1 py-1 text-base text-ink placeholder:text-ink-4 focus:outline-none sm:text-[15px]" />
      </div>
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Form state: the catalogue product, its seller-of-record columns, and its listing (price + stock).
 * ---------------------------------------------------------------------------------------------- */

type Seller = { shelf_life: string; seller_name: string; seller_address: string; seller_license: string };
type Reason = "restock" | "manual_adjust" | "damage";
const REASONS: { value: Reason; label: string }[] = [
  { value: "restock", label: "Restock (goods received)" },
  { value: "manual_adjust", label: "Correction (stock count)" },
  { value: "damage", label: "Damaged or expired" },
];
/** The listing (inventory row): what customers pay and what is on the shelf. */
type Offer = { selling_price: string; mrp: string; stock: string; reason: Reason; reasonTouched: boolean; note: string; on_sale: boolean; low: string; max: string };
type Snapshot = { f: ProductInput; nutritionText: string; seller: Seller; o: Offer };

const numStr = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));

function initial(product: Product | null, listing: Listing | null): Snapshot {
  return {
    f: {
      name: product?.name ?? "", slug: product?.slug ?? "", brand_id: product?.brand_id ?? null, category_id: product?.category_id ?? "",
      description: product?.description ?? "", ingredients: product?.ingredients ?? "", manufacturer: product?.manufacturer ?? "", country_of_origin: product?.country_of_origin ?? "India", bin_location: product?.bin_location ?? "",
      weight_value: product?.weight_value ?? 1, weight_unit: (product?.weight_unit as ProductInput["weight_unit"]) ?? "kg", pack_label: product?.pack_label ?? "", mrp: product?.mrp ?? 0,
      image_url: product?.image_url ?? null, images: product?.images ?? [], tags: product?.tags ?? [], synonyms: product?.synonyms ?? [],
      nutrition: (product?.nutrition as Record<string, string | number> | null) ?? null,
      is_local: product?.is_local ?? false, is_veg: product?.is_veg ?? true, is_active: product?.is_active ?? true, popularity_score: product?.popularity_score ?? 0,
      eggless_option: product?.eggless_option ?? false, eggless_extra: product?.eggless_extra ?? 0, cake_message: product?.cake_message ?? false,
    },
    nutritionText: product?.nutrition ? JSON.stringify(product.nutrition, null, 2) : "",
    seller: { shelf_life: product?.shelf_life ?? "", seller_name: product?.seller_name ?? (product ? "" : "MertaDeal"), seller_address: product?.seller_address ?? "", seller_license: product?.seller_license ?? "" },
    o: {
      selling_price: listing ? numStr(listing.selling_price) : "",
      // A new listing starts from the printed MRP; after that the listing carries its own.
      mrp: listing ? numStr(listing.mrp) : numStr(product?.mrp) || "",
      stock: listing ? String(listing.stock_qty) : "",
      reason: "restock", reasonTouched: false, note: "",
      on_sale: listing ? listing.is_active : true,
      low: listing ? String(listing.low_stock_threshold) : "", max: listing ? String(listing.max_order_qty) : "",
    },
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

const isWhole = (v: string) => /^\d+$/.test(v.trim());
const money = (v: string) => (v.trim() === "" ? NaN : Number(v));

type SectionId = "pack" | "photos" | "details" | "seo" | "options" | "label" | "stock" | "danger";
/** Which section holds each field, so a failed save opens the right one and focuses the field. */
const SECTION_OF: Record<string, SectionId | "essentials"> = {
  name: "essentials", category_id: "essentials", selling_price: "essentials", offer_mrp: "essentials", stock: "essentials",
  weight_value: "pack", mrp: "pack",
  nutrition: "details", seller_address: "details",
  popularity_score: "seo",
  eggless_extra: "options",
  barcode: "label",
  low: "stock", max: "stock",
};

/**
 * The product page's one editor: the five things that change every day sit at the top, everything
 * else is in a section that opens when it is needed.
 *
 * It saves through the existing actions and nothing else: `saveCatalogueProductAction` for the
 * catalogue row and the seller columns, `setBarcodeAction` for the packet barcode, and
 * `updateListingAction` / `createListingAction` for the price and stock — so stock still moves only
 * through `adjust_stock` with a reason, and a price under cost still needs an explicit confirmation.
 */
export function ProductEditor({ product, listing, movements = [], scan = null, siteUrl, categories, brands, barcode }: {
  product: Product | null; listing: Listing | null; movements?: StockMovement[]; scan?: ScanProduct | null; siteUrl?: string;
  categories: CategoryLike[]; brands: Opt[];
  /** Scanned packet barcode to attach once the product exists (from Scan › unknown code). */ barcode?: string;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<Snapshot>(() => initial(product, listing));
  const [base, setBase] = React.useState<Snapshot>(() => initial(product, listing));
  const [bc, setBc] = React.useState(() => barcode ?? product?.barcode ?? "");
  const [scanning, setScanning] = React.useState(false);
  const bcBase = product?.barcode ?? "";
  const bcValid = bc === "" || /^[0-9]{8,14}$/.test(bc);
  const [busy, setBusy] = React.useState<"save" | "delete" | null>(null);
  const [del, setDel] = React.useState(false);
  const [slugTouched, setSlugTouched] = React.useState(Boolean(product));
  const [showErrors, setShowErrors] = React.useState(false);
  const { f, nutritionText, seller, o } = state;

  const [open, setOpen] = React.useState<Record<SectionId, boolean>>({ pack: false, photos: false, details: false, seo: false, options: false, label: Boolean(barcode), stock: false, danger: false });
  const toggle = (id: SectionId) => (v: boolean) => setOpen((s) => ({ ...s, [id]: v }));

  // Focus moves after the section holding the field has been opened, so the field is on screen.
  const pendingFocus = React.useRef<string | null>(null);
  const [focusTick, setFocusTick] = React.useState(0);
  React.useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    const el = document.getElementById(id);
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusTick]);

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
  const setOffer = <K extends keyof Offer>(k: K, v: Offer[K]) => setState((s) => ({ ...s, o: { ...s.o, [k]: v } }));

  // Grouped under the four top-level lines, in the shop's own order; the switched-off shelves sit
  // in one group at the end, still selectable because a product may already be filed in one.
  const catOptions = React.useMemo(() => categoryOptions(categories, { topLabel: (name) => `${name} (top level)` }), [categories]);
  const catHidden = isCategoryHidden(categories, f.category_id);
  const brandName = brands.find((b) => b.id === f.brand_id)?.name ?? null;

  /* ---- price and stock -------------------------------------------------------------------- */
  const sp = money(o.selling_price); const offerMrp = money(o.mrp);
  const currentStock = listing?.stock_qty ?? 0;
  const stockTyped = o.stock.trim();
  // Without a listing the product is not on sale; typing a price or an opening stock asks for one.
  const wantsListing = Boolean(listing) || o.selling_price.trim() !== "" || stockTyped !== "";
  const delta = listing && isWhole(stockTyped) ? Number(stockTyped) - currentStock : 0;
  const reason: Reason = o.reasonTouched ? o.reason : delta > 0 ? "restock" : "manual_adjust";
  const discount = sp > 0 && offerMrp > 0 && sp < offerMrp ? Math.round((1 - sp / offerMrp) * 100) : 0;

  const nutrition = parseNutrition(nutritionText);
  const errors: Record<string, string | undefined> = {
    name: f.name.trim().length < 2 ? "Enter a product name (at least 2 characters)" : f.name.trim().length > 160 ? "Keep the name under 160 characters" : undefined,
    category_id: !f.category_id ? "Choose a category" : undefined,
    selling_price: !wantsListing ? undefined : !(sp > 0) ? "Enter the price customers pay, above ₹0" : offerMrp > 0 && sp > offerMrp ? "The selling price cannot be higher than the MRP" : undefined,
    offer_mrp: !wantsListing ? undefined : !(offerMrp > 0) ? "Enter the MRP shown to customers, above ₹0" : undefined,
    stock: stockTyped !== "" && !isWhole(stockTyped) ? "Use a whole number of packs, 0 or more" : undefined,
    weight_value: !(Number(f.weight_value) > 0) ? "Enter a weight or volume above 0" : undefined,
    mrp: !(Number(f.mrp) >= 0) || f.mrp === "" ? "Enter the printed MRP (0 or more)" : undefined,
    popularity_score: !Number.isInteger(Number(f.popularity_score)) || Number(f.popularity_score) < 0 ? "Use a whole number, 0 or more" : undefined,
    eggless_extra: f.eggless_option && !(Number(f.eggless_extra) >= 0) ? "Enter the extra for eggless (0 = no extra)" : undefined,
    nutrition: nutrition.ok ? undefined : "Use JSON with text or number values, e.g. {\"energy_kcal\": 340}",
    seller_address: seller.seller_address.length > 400 ? "Keep the address under 400 characters" : undefined,
    barcode: bcValid ? undefined : "A packet barcode is 8 to 14 digits (EAN-8, EAN-13, UPC)",
    low: listing && o.low.trim() !== "" && !isWhole(o.low) ? "Use a whole number" : undefined,
    max: listing && o.max.trim() !== "" && (!isWhole(o.max) || Number(o.max) < 1 || Number(o.max) > 100) ? "A number between 1 and 100" : undefined,
  };
  const errorKeys = Object.keys(errors).filter((k) => errors[k]);
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const sectionHasError = (id: SectionId) => showErrors && errorKeys.some((k) => SECTION_OF[k] === id);

  const leave = () => {
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === location.origin && ref.pathname === "/admin/products" && window.history.length > 1) { router.back(); return; }
    } catch { /* fall through */ }
    router.push("/admin/products");
  };

  /** Price, stock and on-sale, through the same actions the quick edit uses. */
  const saveOffer = async (productId: string, confirmBelowCost = false): Promise<{ ok: true; note: string | null } | { ok: false; error: string; belowCost?: string }> => {
    if (!wantsListing) return { ok: true, note: null };
    if (listing) {
      const changed = sp !== Number(listing.selling_price) || offerMrp !== Number(listing.mrp) || o.on_sale !== listing.is_active || delta !== 0
        || (o.low.trim() !== "" && Number(o.low) !== listing.low_stock_threshold) || (o.max.trim() !== "" && Number(o.max) !== listing.max_order_qty);
      if (!changed) return { ok: true, note: null };
      const r = await updateListingAction(listing.id, {
        selling_price: sp, mrp: offerMrp, is_active: o.on_sale, stock_delta: delta, stock_reason: reason, stock_note: o.note,
        low_stock_threshold: o.low.trim() === "" ? undefined : Number(o.low), max_order_qty: o.max.trim() === "" ? undefined : Number(o.max),
        confirm_below_cost: confirmBelowCost,
      });
      if (!r.ok) return /below cost/i.test(r.error) ? { ok: false, error: r.error, belowCost: r.error } : { ok: false, error: r.error };
      return { ok: true, note: delta !== 0 ? `Stock is now ${r.data.stock_qty}.` : null };
    }
    const r = await createListingAction(productId, { selling_price: sp, mrp: offerMrp, stock_qty: isWhole(stockTyped) ? Number(stockTyped) : 0, is_active: o.on_sale });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, note: "It is on sale now." };
  };

  const [belowCost, setBelowCost] = React.useState<string | null>(null);
  const [savedId, setSavedId] = React.useState<string | null>(null);

  const finish = (id: string, note: string | null) => {
    setBase({ ...state, o: { ...state.o, note: "", reasonTouched: false, reason: "restock" } });
    setState((s) => ({ ...s, o: { ...s.o, note: "", reasonTouched: false, reason: "restock" } }));
    setShowErrors(false);
    if (!product) { toast.success("Product created", note ?? "Next: add its photo and details."); router.push(`/admin/products/${id}`); }
    else { toast.success("Product saved", note ?? undefined); router.refresh(); }
  };

  const submit = async () => {
    if (errorKeys.length) {
      setShowErrors(true);
      const first = errorKeys[0];
      const section = SECTION_OF[first];
      if (section && section !== "essentials") setOpen((s) => ({ ...s, [section]: true }));
      pendingFocus.current = `pe-${first}`;
      setFocusTick((n) => n + 1);
      toast.error(errorKeys.length === 1 ? "Fix 1 field to save" : `Fix ${errorKeys.length} fields to save`, errors[first]);
      return;
    }
    setBusy("save");
    const r = await saveCatalogueProductAction(product?.id ?? null, { ...f, nutrition: nutrition.ok ? nutrition.value : null, slug: slugTouched ? f.slug : "" }, seller as SellerInput);
    if (!r.ok) { setBusy(null); toast.error(product ? "Couldn't save the product" : "Couldn't create the product", r.error); return; }
    const productId = r.data.id;
    setSavedId(productId);

    const notes: string[] = [];
    if (bc !== bcBase) {
      const res = await setBarcodeAction(productId, bc);
      if (!res.ok) toast.error(product ? "Saved, but the barcode was not changed" : "Created, but the barcode was not attached", res.error);
      else notes.push(bc ? "Barcode attached." : "Barcode removed.");
    }
    const offer = await saveOffer(productId);
    setBusy(null);
    if (!offer.ok) {
      if (offer.belowCost) { setBelowCost(offer.error); return; }
      toast.error("The product was saved, but its price and stock were not", offer.error);
      router.refresh();
      return;
    }
    if (offer.note) notes.push(offer.note);
    finish(productId, notes.join(" ") || null);
  };

  const confirmBelowCost = async () => {
    const id = savedId ?? product?.id;
    if (!id) return;
    setBelowCost(null); setBusy("save");
    const offer = await saveOffer(id, true);
    setBusy(null);
    if (!offer.ok) { toast.error("The price was not changed", offer.error); return; }
    finish(id, offer.note);
  };

  const remove = async () => {
    setBusy("delete");
    const r = await deleteProductAction(product!.id);
    setBusy(null);
    if (r.ok) { setBase(state); toast.success("Product deleted"); router.push("/admin/products"); }
    else { toast.error("Couldn't delete the product", r.error); setDel(false); }
  };

  /* ---- summaries shown on a shut section --------------------------------------------------- */
  const packSummary = [f.pack_label || `${f.weight_value} ${f.weight_unit}`, f.mrp === "" || f.mrp === null ? "no printed MRP" : `printed MRP ${rupees(Number(f.mrp))}`].filter(Boolean).join(" · ");
  const photoCount = (f.image_url ? 1 : 0) + (f.images?.length ?? 0);
  const detailBits = [f.description, f.ingredients, f.manufacturer, seller.shelf_life, seller.seller_name, nutritionText].filter((v) => (v ?? "").toString().trim()).length;
  const seoBits = (f.synonyms?.length ?? 0) + (f.tags?.length ?? 0);

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        {/* Preview: first on a phone, a sticky column on a desktop. */}
        <aside className="min-w-0 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4">
          <Preview name={f.name} brand={brandName} pack={f.pack_label} image={f.image_url} slug={f.slug} price={sp} mrp={offerMrp} discount={discount}
            stock={listing ? (isWhole(stockTyped) ? Number(stockTyped) : currentStock) : isWhole(stockTyped) ? Number(stockTyped) : null}
            onSale={o.on_sale} listed={Boolean(listing) || wantsListing} isActive={Boolean(f.is_active)} live={Boolean(product)} />
        </aside>

        <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
          {/* ---------- Essentials: what changes every day ---------- */}
          <section className={cn(card, "p-4 sm:p-5")}>
            <h2 className="text-[15px] font-semibold text-ink">{product ? "Essentials" : "New product"}</h2>
            <p className="mt-0.5 text-xs text-ink-3">{product ? "What customers see and what you change most often." : "Name it and file it; a price and stock can go in now or later."}</p>
            <div className="mt-4 space-y-3">
              <Input id="pe-name" label="Product name" required placeholder="e.g. Cadbury Dairy Milk Silk" value={f.name} error={err("name")}
                onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(`${e.target.value} ${f.pack_label ?? ""}`)); }} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select id="pe-category_id" label="Category" required placeholder="Choose a category" options={catOptions} value={f.category_id} error={err("category_id")}
                  hint={catHidden ? "This shelf is switched off, so the product won't appear on the site." : undefined} onChange={(e) => set("category_id", e.target.value)} />
                <Select id="pe-brand" label="Brand" placeholder="No brand / unbranded" options={brands.map((b) => ({ value: b.id, label: b.name }))} value={f.brand_id ?? ""} onChange={(e) => set("brand_id", e.target.value || null)} />
              </div>

              <div className="rounded-xl bg-surface-2 p-3 sm:p-3.5">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">Price and stock</h3>
                  {listing ? <StockPill status={listing.status} isActive={listing.is_active} qty={currentStock} /> : <StatusPill tone="neutral">Not on sale yet</StatusPill>}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input id="pe-selling_price" label="Selling price (₹)" required={Boolean(listing)} type="number" inputMode="decimal" step="0.01" min={0} placeholder="e.g. 45" value={o.selling_price}
                    error={err("selling_price")} hint={!err("selling_price") && discount ? `${discount}% below MRP` : undefined} onChange={(e) => setOffer("selling_price", e.target.value)} />
                  <Input id="pe-offer_mrp" label="MRP (₹)" required={Boolean(listing)} type="number" inputMode="decimal" step="0.01" min={0} placeholder="e.g. 50" value={o.mrp}
                    error={err("offer_mrp")} hint={!err("offer_mrp") ? "Struck through on the product card." : undefined} onChange={(e) => setOffer("mrp", e.target.value)} />
                  <Input id="pe-stock" label={listing ? "Stock (packs)" : "Opening stock"} type="number" inputMode="numeric" step="1" min={0} placeholder={listing ? String(currentStock) : "e.g. 12"} value={o.stock}
                    error={err("stock")} hint={!err("stock") && listing && delta !== 0 ? `${delta > 0 ? `+${delta}` : delta} from ${currentStock}` : undefined} onChange={(e) => setOffer("stock", e.target.value)} />
                </div>
                {listing && delta !== 0 && dirty ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Select id="pe-reason" label="Why did the stock change?" options={REASONS} value={reason} onChange={(e) => setState((s) => ({ ...s, o: { ...s.o, reason: e.target.value as Reason, reasonTouched: true } }))} hint="Saved in the stock history." />
                    <Input id="pe-note" label="Note (optional)" maxLength={200} placeholder="e.g. Invoice 1123 from the distributor" value={o.note} onChange={(e) => setOffer("note", e.target.value)} />
                  </div>
                ) : null}
                {listing || wantsListing ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <Switch checked={o.on_sale} onChange={(v) => setOffer("on_sale", v)} label={o.on_sale ? "On sale: customers can buy it" : "Paused: customers can't buy it"} />
                  </div>
                ) : <p className="mt-2 text-xs text-ink-3">Leave these empty to add the product to the catalogue without putting it on sale.</p>}
              </div>

              {product && !f.is_active ? <p className="text-xs font-medium text-warning">This product is deactivated, so customers don&apos;t see it. Use Activate at the top of the page.</p> : null}
              {!product ? <Switch checked={Boolean(f.is_active)} onChange={(v) => set("is_active", v)} label="Active (customers can see it)" /> : null}
            </div>
          </section>

          {/* ---------- Photos ---------- */}
          <CollapsibleSection id="pe-photos" title="Photos" icon={ImageIcon} open={open.photos} onOpenChange={toggle("photos")}
            summary={photoCount ? `${photoCount} image${photoCount > 1 ? "s" : ""}` : "No photo yet — products without one show a neutral tile"}
            description="Transparent cut-outs on white look best. The first image is the main photo.">
            <ProductImageManager primary={f.image_url ?? null} gallery={f.images ?? []} folder="admin" productName={f.name} brand={brandName} packSize={f.pack_label ?? null}
              onChange={(n) => setState((s) => ({ ...s, f: { ...s.f, image_url: n.image_url, images: n.images } }))} />
          </CollapsibleSection>

          {/* ---------- Pack and size ---------- */}
          <CollapsibleSection id="pe-pack" title="Pack and size" icon={Ruler} open={open.pack} onOpenChange={toggle("pack")} alert={sectionHasError("pack")} summary={packSummary}
            description="The size on the packet and the MRP printed on it. The price customers pay is in Essentials.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Input id="pe-weight_value" label="Weight / volume" type="number" step="0.001" min={0} required value={f.weight_value as number} error={err("weight_value")} onChange={(e) => set("weight_value", e.target.value === "" ? "" : Number(e.target.value))} />
              <Select id="pe-weight_unit" label="Unit" options={WEIGHT_UNIT_OPTIONS} value={f.weight_unit} onChange={(e) => set("weight_unit", e.target.value as ProductInput["weight_unit"])} />
              <Input id="pe-pack_label" label="Pack label" placeholder="1 kg, Pack of 6" value={f.pack_label ?? ""} onChange={(e) => { set("pack_label", e.target.value); if (!slugTouched) set("slug", slugify(`${f.name} ${e.target.value}`)); }} />
              <Input id="pe-mrp" label="Printed MRP (₹)" type="number" step="0.01" min={0} required value={f.mrp as number} error={err("mrp")} onChange={(e) => set("mrp", e.target.value === "" ? "" : Number(e.target.value))}
                hint={listing && Number(f.mrp) !== offerMrp && offerMrp > 0 ? `Customers see ${rupees(offerMrp)} (Essentials).` : "Used as the MRP when the product is first put on sale."} />
            </div>
          </CollapsibleSection>

          {/* ---------- Product details ---------- */}
          <CollapsibleSection id="pe-details" title="Product details" icon={Info} open={open.details} onOpenChange={toggle("details")} alert={sectionHasError("details")}
            summary={detailBits ? `${detailBits} of 6 filled in` : "Description, ingredients, seller of record — all optional"}
            description="Shown under Product details on the customer page. Leave a field empty to hide it.">
            <div className="space-y-3">
              <Textarea id="pe-description" label="Description" placeholder="e.g. Smooth milk chocolate bar, 55 g" value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input id="pe-manufacturer" label="Manufacturer" value={f.manufacturer ?? ""} onChange={(e) => set("manufacturer", e.target.value)} />
                <Input id="pe-country" label="Country of origin" maxLength={80} value={f.country_of_origin ?? ""} onChange={(e) => set("country_of_origin", e.target.value)} />
                <Input id="pe-shelf_life" label="Shelf life" placeholder="e.g. 3 days, 6 months" maxLength={80} value={seller.shelf_life} onChange={(e) => setSeller("shelf_life", e.target.value)} />
              </div>
              <Input id="pe-bin" label="Bin / shelf location" placeholder="e.g. A-12, Cold room 2" maxLength={40} value={f.bin_location ?? ""} onChange={(e) => set("bin_location", e.target.value)} hint="Printed on pick lists so packers find it fast. Customers never see it." />
              <Textarea id="pe-ingredients" label="Ingredients" value={f.ingredients ?? ""} onChange={(e) => set("ingredients", e.target.value)} />
              <Textarea id="pe-nutrition" label="Nutrition (JSON)" value={nutritionText} error={err("nutrition")} onChange={(e) => setState((s) => ({ ...s, nutritionText: e.target.value }))} placeholder='{"energy_kcal": 340, "protein_g": 12}' className="font-mono text-xs" hint="Per 100 g or per serving, as printed on the pack." />
              <fieldset className="rounded-xl border border-line p-3">
                <legend className="px-1 text-xs font-semibold text-ink-2">Seller of record</legend>
                <p className="mb-2.5 text-xs text-ink-3">Shown on the product page. Leave empty if it does not apply.</p>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input id="pe-seller_name" label="Seller name" maxLength={160} value={seller.seller_name} onChange={(e) => setSeller("seller_name", e.target.value)} />
                    <Input id="pe-seller_license" label="Seller licence no. (FSSAI)" maxLength={80} value={seller.seller_license} onChange={(e) => setSeller("seller_license", e.target.value)} />
                  </div>
                  <Textarea id="pe-seller_address" label="Seller address" maxLength={400} value={seller.seller_address} error={err("seller_address")} onChange={(e) => setSeller("seller_address", e.target.value)} className="min-h-20" />
                </div>
              </fieldset>
            </div>
          </CollapsibleSection>

          {/* ---------- Options ---------- */}
          <CollapsibleSection id="pe-options" title="Options and labels" icon={Tags} open={open.options} onOpenChange={toggle("options")} alert={sectionHasError("options")}
            summary={[f.is_veg ? "Vegetarian" : "Non-vegetarian", f.is_local ? "Local product" : null, f.eggless_option ? "Eggless option" : null, f.cake_message ? "Message on cake" : null].filter(Boolean).join(" · ")}>
            <div className="space-y-3">
              <Switch checked={Boolean(f.is_veg)} onChange={(v) => set("is_veg", v)} label="Vegetarian" description="Shows the green mark on the product card." />
              <Switch checked={Boolean(f.is_local)} onChange={(v) => set("is_local", v)} label="Local product of Merta" />
              <div className="rounded-xl border border-line p-3">
                <p className="text-sm font-semibold text-ink">Made to order (cakes)</p>
                <p className="mb-2.5 text-xs text-ink-3">Lets the customer choose an eggless version and type a message for the cake. Both reach the packing slip and the rider.</p>
                <div className="space-y-3">
                  <Switch checked={Boolean(f.eggless_option)} onChange={(v) => set("eggless_option", v)} label="Offer an eggless version" />
                  {f.eggless_option ? <Input id="pe-eggless_extra" label="Extra for eggless (₹ per cake)" type="number" step="1" min={0} value={f.eggless_extra as number} error={err("eggless_extra")} onChange={(e) => set("eggless_extra", e.target.value === "" ? "" : Number(e.target.value))} hint="0 means no extra charge." /> : null}
                  <Switch checked={Boolean(f.cake_message)} onChange={(v) => set("cake_message", v)} label="Accept a message on the cake (up to 40 characters)" />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* ---------- Search and SEO ---------- */}
          <CollapsibleSection id="pe-seo" title="Search and web address" icon={Search} open={open.seo} onOpenChange={toggle("seo")} alert={sectionHasError("seo")}
            summary={seoBits ? `${seoBits} search word${seoBits > 1 ? "s" : ""} · /p/${f.slug || "…"}` : `/p/${f.slug || "…"}`}
            description="Helps customers find the product with the words they actually type.">
            <div className="space-y-3">
              <ChipsInput label="Synonyms (Hinglish / regional names)" value={f.synonyms ?? []} onChange={(v) => set("synonyms", v)} placeholder="aata, gehu, flour" hint="Weighted highest in search." />
              <ChipsInput label="Tags" value={f.tags ?? []} onChange={(v) => set("tags", v)} placeholder="staple, chakki, organic" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input id="pe-slug" label="Web address (slug)" value={f.slug ?? ""} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} hint="/p/<slug>. Generated from the name and pack until you edit it." />
                <Input id="pe-popularity_score" label="Popularity score" type="number" min={0} step={1} value={(f.popularity_score as number) ?? 0} error={err("popularity_score")} onChange={(e) => set("popularity_score", e.target.value === "" ? "" : Number(e.target.value))} hint="Manual boost for Best sellers and Popular rankings." />
              </div>
            </div>
          </CollapsibleSection>

          {/* ---------- Barcode and label ---------- */}
          <CollapsibleSection id="pe-label" title="Barcode and label" icon={Barcode} open={open.label} onOpenChange={toggle("label")} alert={sectionHasError("label")}
            summary={bc ? `Packet barcode ${bc}` : "No packet barcode — a printed QR label is used instead"}
            description="Scan the printed EAN/UPC on the packet so staff can find this product with the camera in Scan & pack.">
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <Input id="pe-barcode" label="Barcode (8–14 digits)" inputMode="numeric" placeholder="e.g. 8901030835289" value={bc} error={err("barcode")} onChange={(e) => setBc(e.target.value.replace(/\s/g, ""))} leftIcon={<Barcode className="h-4 w-4" />} wrapperClassName="min-w-[16rem] flex-1" />
                <button type="button" onClick={() => setScanning((v) => !v)} aria-pressed={scanning} className={btn.outline}><ScanLine className="h-4 w-4" aria-hidden />{scanning ? "Stop camera" : "Scan with camera"}</button>
                {bc ? <button type="button" onClick={() => { setBc(""); setScanning(false); }} className={btn.outline}><X className="h-4 w-4" aria-hidden />Clear</button> : null}
              </div>
              {scanning ? (
                <Scanner active={scanning} onCode={(code) => { const c = code.replace(/\s/g, ""); if (/^[0-9]{8,14}$/.test(c)) { setBc(c); setScanning(false); toast.success("Barcode read", c); } else toast.error("That is not a packet barcode", "Point the camera at the printed EAN/UPC bars on the packet."); }} manualLabel="Or type the barcode" hint="Hold the packet's barcode inside the frame." />
              ) : null}
              {scan && siteUrl && open.label ? (
                <div className="border-t border-line pt-4">
                  <p className="mb-2 text-sm font-semibold text-ink">Printed label</p>
                  <ProductIdentity product={scan} siteUrl={siteUrl} showBarcode={false} />
                </div>
              ) : null}
            </div>
          </CollapsibleSection>

          {/* ---------- Stock settings and history ---------- */}
          {listing ? (
            <CollapsibleSection id="pe-stock" title="Stock settings and history" icon={History} open={open.stock} onOpenChange={toggle("stock")} alert={sectionHasError("stock")}
              summary={`Low-stock alert at ${listing.low_stock_threshold} · max ${listing.max_order_qty} per order · ${listing.sold_count} sold`}>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input id="pe-low" label="Low-stock alert at" type="number" inputMode="numeric" step="1" min={0} value={o.low} error={err("low")} onChange={(e) => setOffer("low", e.target.value)} hint="The dashboard warns you at this count." />
                  <Input id="pe-max" label="Max per order" type="number" inputMode="numeric" step="1" min={1} max={100} value={o.max} error={err("max")} onChange={(e) => setOffer("max", e.target.value)} hint="Packs one customer can buy in one order." />
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-ink">Recent stock changes</p>
                  {movements.length ? (
                    <ul className="divide-y divide-line border-t border-line text-sm">
                      {movements.map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
                          <span className={m.delta > 0 ? "w-12 font-semibold tabular text-success" : "w-12 font-semibold tabular text-danger"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                          <span className="text-ink-2">{REASON_LABEL[m.reason] ?? m.reason}</span>
                          <span className="text-xs text-ink-3">{m.actor?.full_name ?? ""}</span>
                          {m.note ? <span className="w-full truncate pl-[60px] text-xs text-ink-4">{m.note}</span> : null}
                          <span className="ml-auto text-xs text-ink-3" title={formatDateTime(m.created_at)}>{timeAgo(m.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-ink-3">No stock movements yet.</p>}
                </div>
              </div>
            </CollapsibleSection>
          ) : null}

          {/* ---------- Delete ---------- */}
          {product ? (
            <CollapsibleSection id="pe-danger" title="Delete product" icon={Trash2} open={open.danger} onOpenChange={toggle("danger")} summary="Products with past orders can't be deleted">
              <div className="space-y-3">
                <p className="text-sm text-ink-2">A product with past orders can&apos;t be deleted — deactivate it instead, which keeps its price, stock and history. Deleting removes its price and stock with it.</p>
                <button type="button" className={btn.danger} onClick={() => setDel(true)} disabled={busy !== null}><Trash2 className="h-4 w-4" aria-hidden />Delete product</button>
              </div>
            </CollapsibleSection>
          ) : null}
        </div>
      </div>

      <FormActions dirty={dirty} saving={busy === "save"} submitLabel={product ? "Save changes" : "Create product"} onCancel={() => { if (confirmDiscard()) leave(); }} />

      <ConfirmDialog open={del} onClose={() => setDel(false)} tone="danger" title={`Delete “${product?.name ?? "this product"}”?`}
        description="This can't be undone. Products with past orders can't be deleted; deactivate them instead. Its price and stock will be removed."
        confirmLabel="Delete product" loading={busy === "delete"} onConfirm={remove} />

      <ConfirmDialog open={belowCost !== null} onClose={() => setBelowCost(null)} tone="danger" title="Sell below cost?"
        description={`${belowCost ?? ""} The rest of the product is saved. This is recorded against your name in the price history.`}
        confirmLabel="Yes, set this price" loading={busy === "save"} onConfirm={confirmBelowCost} />
    </form>
  );
}

const REASON_LABEL: Record<string, string> = { order: "Order", cancel_restock: "Order cancelled, restocked", reject_restock: "Order rejected, restocked", manual_adjust: "Correction", restock: "Restock", damage: "Damaged or expired" };

/** What the product looks like to a customer right now, from the values in the form. */
function Preview({ name, brand, pack, image, slug, price, mrp, discount, stock, onSale, listed, isActive, live }: {
  name: string; brand: string | null; pack: string | null | undefined; image: string | null | undefined; slug: string | null | undefined;
  price: number; mrp: number; discount: number; stock: number | null; onSale: boolean; listed: boolean; isActive: boolean; live: boolean;
}) {
  const visible = isActive && listed && onSale && (stock === null || stock > 0);
  return (
    <div className={cn(card, "overflow-hidden")}>
      <p className="hidden border-b border-line px-4 py-2 text-xs font-semibold text-ink-3 lg:block">Customer preview</p>
      {/* A compact strip on a phone — the fields matter more there than a big picture — and the
          full card beside the form on a desktop. */}
      <div className="flex items-start gap-3 p-3 lg:block lg:p-4">
        <ProductImage image={image ?? null} productName={name || "Product"} brand={brand} packSize={pack ?? null} sizes="(max-width: 1024px) 80px, 260px" rounded="rounded-xl" className="h-20 w-20 shrink-0 border border-line lg:mx-auto lg:aspect-square lg:h-auto lg:w-full" />
        <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold text-ink lg:mt-3">{name || "Product name"}</p>
        <p className="mt-0.5 truncate text-xs text-ink-3">{[brand, pack].filter(Boolean).join(" · ") || "No brand · no pack size"}</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          {price > 0 ? <span className="font-display text-xl font-bold text-ink">{rupees(price)}</span> : <span className="text-sm text-ink-3">No price yet</span>}
          {price > 0 && mrp > price ? <span className="text-sm text-ink-4 line-through">{rupees(mrp)}</span> : null}
          {discount ? <span className="text-xs font-semibold text-success">{discount}% off</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {!listed ? <StatusPill tone="neutral">Not on sale</StatusPill>
            : !onSale ? <StatusPill tone="neutral">Paused</StatusPill>
            : stock === null ? <StatusPill tone="neutral">No stock set</StatusPill>
            : stock > 0 ? <StatusPill tone="green">{stock} in stock</StatusPill>
            : <StatusPill tone="red">Out of stock</StatusPill>}
          {isActive ? null : <StatusPill tone="neutral">Deactivated</StatusPill>}
        </div>
        <p className="mt-2.5 text-xs text-ink-3">{visible ? "Customers can buy this now." : "Customers can't buy this right now."}</p>
        {live && slug && visible ? (
          <Link href={`/p/${slug}`} target="_blank" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
            View on site<ExternalLink className="h-3 w-3" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
          </Link>
        ) : null}
        </div>
      </div>
    </div>
  );
}
