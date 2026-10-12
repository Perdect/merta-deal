"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackagePlus, SlidersHorizontal, Store as StoreIcon } from "lucide-react";
import { SidePanel, IconAction, EmptyBlock, StatusPill, rupees, useUnsavedChanges } from "@/components/admin/kit";
import { Switch } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { updateStoreOfferAction, createMainStoreOfferAction, setProductVisibilityAction } from "@/lib/actions/admin-catalogue";
import type { StoreOffer } from "@/lib/data/admin-catalogue";
import { cn } from "@/lib/utils";
import { ProductThumb, ProductStatusPill, StockPill, Field, inputCls, btn } from "./bits";

export type QuickEditProduct = { id: string; name: string; slug: string; pack_label: string | null; image_url: string | null; brand: string | null; mrp: number; is_active: boolean; is_approved: boolean };

type Mode = "add" | "remove" | "set";
type Reason = "restock" | "manual_adjust" | "damage";
const REASONS: { value: Reason; label: string }[] = [
  { value: "restock", label: "Restock (goods received)" },
  { value: "manual_adjust", label: "Correction (stock count)" },
  { value: "damage", label: "Damaged or expired" },
];

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const isWhole = (v: string) => /^\d+$/.test(v.trim());

/**
 * Quick edit for one product's offer at the main store: selling price, MRP, stock (via adjust_stock,
 * so each change is logged with a reason) and offer on/off; optionally the catalogue visibility flags.
 * Catalogue details (name, pack, photos…) stay on the full product page.
 */
export function OfferQuickEdit({ product, offer, storeName, showFlags = true, variant = "icon" }: {
  product: QuickEditProduct; offer: StoreOffer | null; storeName: string | null; showFlags?: boolean; variant?: "icon" | "button";
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {variant === "icon"
        ? <IconAction label={`Quick edit price and stock for ${product.name}`} onClick={() => setOpen(true)}><SlidersHorizontal className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
        : <button type="button" onClick={() => setOpen(true)} className={btn.small}><SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />{offer ? "Quick edit" : "List at store"}</button>}
      {open ? <QuickEditPanel product={product} offer={offer} storeName={storeName} showFlags={showFlags} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function QuickEditPanel({ product, offer, storeName, showFlags, onClose }: { product: QuickEditProduct; offer: StoreOffer | null; storeName: string | null; showFlags: boolean; onClose: () => void }) {
  const router = useRouter();
  const init = React.useMemo(() => ({
    selling_price: offer ? String(Number(offer.selling_price)) : "",
    mrp: offer ? String(Number(offer.mrp)) : product.mrp ? String(Number(product.mrp)) : "",
    offer_active: offer ? offer.is_active : true,
    mode: "add" as Mode, amount: "", reason: "restock" as Reason, note: "",
    opening: "",
    low: offer ? String(offer.low_stock_threshold) : "5",
    max: offer ? String(offer.max_order_qty) : "10",
    is_active: product.is_active, is_approved: product.is_approved,
  }), [offer, product]);
  const [f, setF] = React.useState(init);
  const [saving, setSaving] = React.useState(false);
  const [listing, setListing] = React.useState(Boolean(offer));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const offerDirty = offer
    ? f.selling_price !== init.selling_price || f.mrp !== init.mrp || f.offer_active !== init.offer_active || f.amount.trim() !== "" || f.low !== init.low || f.max !== init.max
    : listing && (f.selling_price !== "" || f.opening !== "");
  const flagsDirty = showFlags && (f.is_active !== init.is_active || f.is_approved !== init.is_approved);
  const dirty = offerDirty || flagsDirty;

  const confirmDiscard = useUnsavedChanges(dirty && !saving);
  const close = () => { if (confirmDiscard()) onClose(); };

  // Validation (mirrors the server).
  const sp = num(f.selling_price); const mrp = num(f.mrp);
  const current = offer?.stock_qty ?? 0;
  const amount = f.amount.trim() === "" ? 0 : Number(f.amount);
  const delta = !offer ? 0 : f.mode === "add" ? amount : f.mode === "remove" ? -amount : amount - current;
  const after = current + delta;
  const errors: Record<string, string | null> = {};
  if (offer || listing) {
    if (!(sp > 0)) errors.selling_price = "Enter a selling price above ₹0";
    if (!(mrp > 0)) errors.mrp = "Enter an MRP above ₹0";
    if (sp > 0 && mrp > 0 && sp > mrp) errors.selling_price = "Selling price cannot be higher than MRP";
  }
  if (offer) {
    if (f.amount.trim() && !isWhole(f.amount)) errors.amount = "Use a whole number";
    else if (after < 0) errors.amount = `Only ${current} in stock; you can remove at most ${current}`;
    if (!isWhole(f.low)) errors.low = "Use a whole number";
    if (!isWhole(f.max) || Number(f.max) < 1 || Number(f.max) > 100) errors.max = "Between 1 and 100";
  } else if (listing && f.opening.trim() && !isWhole(f.opening)) errors.opening = "Use a whole number";
  const hasErrors = Object.values(errors).some(Boolean);
  const [showErrors, setShowErrors] = React.useState(false);
  const err = (k: string) => (showErrors ? errors[k] ?? null : null);
  const discount = sp > 0 && mrp > 0 && sp < mrp ? Math.round((1 - sp / mrp) * 100) : 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) { onClose(); return; }
    if (hasErrors) { setShowErrors(true); return; }
    setSaving(true);
    const done: string[] = [];
    if (offerDirty && offer) {
      const r = await updateStoreOfferAction(offer.id, {
        selling_price: sp, mrp, is_active: f.offer_active, stock_delta: delta, stock_reason: f.mode === "set" ? "manual_adjust" : f.reason, stock_note: f.note,
        low_stock_threshold: Number(f.low), max_order_qty: Number(f.max),
      });
      if (!r.ok) { setSaving(false); toast.error("Couldn't save the store offer", r.error); return; }
      done.push(delta ? `stock now ${r.data.stock_qty}` : "price and offer saved");
    } else if (offerDirty && !offer) {
      const r = await createMainStoreOfferAction(product.id, { selling_price: sp, mrp, stock_qty: f.opening.trim() ? Number(f.opening) : 0, is_active: f.offer_active });
      if (!r.ok) { setSaving(false); toast.error(`Couldn't list at ${storeName ?? "the store"}`, r.error); return; }
      done.push(`listed at ${storeName ?? "the store"}`);
    }
    if (flagsDirty) {
      const patch: { is_active?: boolean; is_approved?: boolean } = {};
      if (f.is_active !== init.is_active) patch.is_active = f.is_active;
      if (f.is_approved !== init.is_approved) patch.is_approved = f.is_approved;
      const r = await setProductVisibilityAction(product.id, patch);
      if (!r.ok) { setSaving(false); toast.error(done.length ? "Store offer saved, but visibility was not" : "Couldn't update visibility", r.error); router.refresh(); return; }
      done.push("visibility updated");
    }
    setSaving(false);
    toast.success(`${product.name} updated`, done.join(" · ").replace(/^./, (c) => c.toUpperCase()));
    onClose();
    router.refresh();
  };

  return (
    <SidePanel open onClose={close} title="Quick edit" description={<span className="block truncate">{product.name}{product.pack_label ? ` · ${product.pack_label}` : ""}</span>}
      footer={
        <div className="flex items-center gap-2">
          <Link href={`/admin/products/${product.id}`} className="mr-auto text-xs font-semibold text-brand-700 hover:underline">Full product page</Link>
          <button type="button" onClick={close} disabled={saving} className={btn.outline}>Cancel</button>
          <button type="submit" form="quick-edit-form" disabled={saving || (!dirty)} className={btn.primary}>
            {saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden /> : null}{saving ? "Saving…" : "Save"}
          </button>
        </div>
      }>
      <form id="quick-edit-form" onSubmit={save} noValidate className="space-y-5">
        <div className="flex items-center gap-3">
          <ProductThumb image={product.image_url} name={product.name} brand={product.brand} pack={product.pack_label} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{product.name}</p>
            <p className="truncate text-xs text-ink-3">{[product.brand, product.pack_label, `Catalogue MRP ${rupees(product.mrp)}`].filter(Boolean).join(" · ")}</p>
          </div>
          <ProductStatusPill isActive={product.is_active} isApproved={product.is_approved} />
        </div>

        <section aria-labelledby="qe-offer" className="space-y-3 rounded-[12px] border border-line p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 id="qe-offer" className="flex items-center gap-1.5 text-sm font-semibold text-ink"><StoreIcon className="h-4 w-4 text-ink-3" aria-hidden />Store price and stock</h3>
              <p className="text-xs text-ink-3">{storeName ? `What customers pay at ${storeName}. Doesn't change the catalogue.` : "Store-specific price and stock."}</p>
            </div>
            {offer ? <StockPill status={offer.status} isActive={offer.is_active} qty={offer.stock_qty} /> : null}
          </div>

          {!offer && !storeName ? (
            <EmptyBlock icon={StoreIcon} title="The Merta Deal store isn't set up" description="Create or reopen the store under Stores, then list this product there." action={<Link href="/admin/stores" className={btn.outline}>Go to stores</Link>} />
          ) : !offer && !listing ? (
            <EmptyBlock icon={PackagePlus} title={`Not listed at ${storeName}`} description="Customers can't buy this product until a store lists it with a price and stock." action={<button type="button" onClick={() => setListing(true)} className={btn.primary}>List at {storeName}</button>} />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Selling price (₹)" htmlFor="qe-sp" error={err("selling_price")} hint={discount ? `${discount}% below MRP` : undefined}>
                  <input id="qe-sp" inputMode="decimal" type="number" step="0.01" min="0" value={f.selling_price} onChange={(e) => set("selling_price", e.target.value)} aria-invalid={Boolean(err("selling_price"))} className={inputCls} />
                </Field>
                <Field label="MRP (₹)" htmlFor="qe-mrp" error={err("mrp")}>
                  <input id="qe-mrp" inputMode="decimal" type="number" step="0.01" min="0" value={f.mrp} onChange={(e) => set("mrp", e.target.value)} aria-invalid={Boolean(err("mrp"))} className={inputCls} />
                </Field>
              </div>

              {offer ? (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-ink">Stock <span className="font-normal text-ink-3">· {current} now</span></legend>
                  <div className="inline-flex rounded-lg border border-line-2 bg-card p-0.5" role="radiogroup" aria-label="Stock change">
                    {([["add", "Add"], ["remove", "Remove"], ["set", "Set count"]] as const).map(([m, label]) => (
                      <button key={m} type="button" role="radio" aria-checked={f.mode === m} onClick={() => setF((s) => ({ ...s, mode: m, reason: m === "add" ? "restock" : m === "remove" ? "damage" : "manual_adjust" }))}
                        className={cn("h-8 rounded-md px-3 text-xs font-semibold transition-colors duration-150", f.mode === m ? "bg-brand-600 text-white" : "text-ink-2 hover:bg-surface-2")}>{label}</button>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={f.mode === "set" ? "Counted stock" : f.mode === "add" ? "Units to add" : "Units to remove"} htmlFor="qe-amount" error={err("amount")}
                      hint={f.amount.trim() && !errors.amount ? `After saving: ${after} in stock` : "Leave empty for no change"}>
                      <input id="qe-amount" inputMode="numeric" type="number" step="1" min="0" value={f.amount} onChange={(e) => set("amount", e.target.value)} aria-invalid={Boolean(err("amount"))} className={inputCls} />
                    </Field>
                    {f.mode !== "set" ? (
                      <Field label="Reason" htmlFor="qe-reason">
                        <select id="qe-reason" value={f.reason} onChange={(e) => set("reason", e.target.value as Reason)} className={inputCls}>
                          {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </Field>
                    ) : <p className="self-end pb-2 text-xs text-ink-3">Logged as a stock-count correction.</p>}
                  </div>
                  <Field label="Note (optional)" htmlFor="qe-note" hint="Saved in the stock history.">
                    <input id="qe-note" maxLength={200} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. Invoice 1123 from distributor" className={inputCls} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Low-stock alert at" htmlFor="qe-low" error={err("low")}>
                      <input id="qe-low" inputMode="numeric" type="number" step="1" min="0" value={f.low} onChange={(e) => set("low", e.target.value)} aria-invalid={Boolean(err("low"))} className={inputCls} />
                    </Field>
                    <Field label="Max per order" htmlFor="qe-max" error={err("max")}>
                      <input id="qe-max" inputMode="numeric" type="number" step="1" min="1" max="100" value={f.max} onChange={(e) => set("max", e.target.value)} aria-invalid={Boolean(err("max"))} className={inputCls} />
                    </Field>
                  </div>
                </fieldset>
              ) : (
                <Field label="Opening stock" htmlFor="qe-opening" error={err("opening")} hint="Logged as a restock in the stock history.">
                  <input id="qe-opening" inputMode="numeric" type="number" step="1" min="0" value={f.opening} onChange={(e) => set("opening", e.target.value)} placeholder="0" aria-invalid={Boolean(err("opening"))} className={inputCls} />
                </Field>
              )}

              <div className="rounded-lg bg-surface-2 px-3 py-2.5">
                <Switch checked={f.offer_active} onChange={(v) => set("offer_active", v)} label={f.offer_active ? "Offer active: customers can buy it here" : "Offer paused: hidden at this store"} />
              </div>
            </>
          )}
        </section>

        {showFlags ? (
          <section aria-labelledby="qe-flags" className="space-y-3 rounded-[12px] border border-line p-3.5">
            <div>
              <h3 id="qe-flags" className="text-sm font-semibold text-ink">Catalogue visibility</h3>
              <p className="text-xs text-ink-3">Customers see the product only when it is both active and approved.</p>
            </div>
            <Switch checked={f.is_active} onChange={(v) => set("is_active", v)} label="Active" />
            <Switch checked={f.is_approved} onChange={(v) => set("is_approved", v)} label="Approved" />
            {!f.is_active || !f.is_approved ? <StatusPill tone="neutral">Hidden from customers after saving</StatusPill> : null}
          </section>
        ) : null}

        {showErrors && hasErrors ? <p className="text-sm font-medium text-danger" role="alert">Fix the highlighted fields to save.</p> : null}
      </form>
    </SidePanel>
  );
}
