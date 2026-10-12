"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Tag, SearchX } from "lucide-react";
import { AdminPageHeader, DataTable, CellStack, EmptyBlock, StatusPill, IconAction, SidePanel, useUnsavedChanges } from "@/components/admin/kit";
import { Switch } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ImageUpload } from "@/components/shared/image-upload";
import { RawImg } from "@/components/admin/raw-img";
import { Field, inputCls, btn } from "@/components/admin/catalogue/bits";
import { saveBrandAction, deleteBrandAction, type BrandInput } from "@/lib/actions/admin";
import type { BrandRow } from "@/lib/data/admin-catalogue";
import { formatDate, slugify } from "@/lib/utils";

export type BrandListRow = BrandRow & { products: number };

/** Brands: server-paginated table; create / edit in a side panel; delete with a confirm. */
export function BrandManager({ rows, filtered, toolbar, footer }: { rows: BrandListRow[]; filtered: boolean; toolbar?: React.ReactNode; footer?: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ id: string | null; form: BrandInput } | null>(null);
  const [del, setDel] = React.useState<BrandListRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const openNew = () => setEditing({ id: null, form: { name: "", slug: "", logo_url: null, is_active: true } });

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    const r = await deleteBrandAction(del.id);
    setBusy(false);
    if (r.ok) { toast.success(`Deleted “${del.name}”`, del.products ? `${del.products} products are now unbranded.` : undefined); setDel(null); router.refresh(); }
    else { toast.error("Couldn't delete the brand", r.error); setDel(null); }
  };

  return (
    <>
      <AdminPageHeader title="Brands" description="Brand names and logos shown on product cards and in filters."
        actions={<button type="button" className={btn.primary} onClick={openNew}><Plus className="h-4 w-4" aria-hidden />New brand</button>} />
      {toolbar}
      <DataTable caption="Brands" rows={rows} rowKey={(b) => b.id}
        empty={filtered
          ? <EmptyBlock icon={SearchX} title="No brands match" description="Try another tab or a shorter search." />
          : <EmptyBlock icon={Tag} title="No brands yet" description="Add a brand, then pick it on the product form." action={<button type="button" className={btn.primary} onClick={openNew}><Plus className="h-4 w-4" aria-hidden />New brand</button>} />}
        columns={[
          { key: "brand", header: "Brand", render: (b) => (
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white text-ink-3">{b.logo_url ? <RawImg src={b.logo_url} alt="" className="h-full w-full object-contain p-0.5" /> : <Tag className="h-4 w-4" strokeWidth={1.9} aria-hidden />}</span>
              <CellStack className="max-w-[200px] sm:max-w-[320px]" primary={b.name} secondary={`/${b.slug}`} />
            </span>
          ) },
          { key: "products", header: "Products", align: "right", render: (b) => b.products ? <Link href={`/admin/products?brand=${b.id}`} className="tabular font-medium text-brand-700 hover:underline" aria-label={`${b.products} products by ${b.name}`}>{b.products}</Link> : <span className="tabular text-ink-4">0</span> },
          { key: "status", header: "Status", hideBelow: "sm", render: (b) => b.is_active ? <StatusPill tone="green">Active</StatusPill> : <StatusPill tone="neutral">Inactive</StatusPill> },
          { key: "added", header: "Added", hideBelow: "lg", render: (b) => <span className="whitespace-nowrap text-xs text-ink-3">{formatDate(b.created_at)}</span> },
          { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (b) => (
            <span className="inline-flex items-center justify-end">
              <IconAction label={`Edit ${b.name}`} onClick={() => setEditing({ id: b.id, form: { name: b.name, slug: b.slug, logo_url: b.logo_url, is_active: b.is_active } })}><Pencil className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
              <IconAction label={`Delete ${b.name}`} tone="danger" onClick={() => setDel(b)}><Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
            </span>
          ) },
        ]} />
      {footer}

      {editing ? <BrandEditor key={editing.id ?? "new"} id={editing.id} initial={editing.form} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} tone="danger" title={`Delete “${del?.name ?? ""}”?`}
        description={del?.products ? `Its ${del.products} ${del.products === 1 ? "product becomes" : "products become"} unbranded. This can't be undone; consider marking it inactive instead.` : "No products use this brand. This can't be undone."}
        confirmLabel="Delete brand" loading={busy} onConfirm={() => void remove()} />
    </>
  );
}

function BrandEditor({ id, initial, onClose }: { id: string | null; initial: BrandInput; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = React.useState<BrandInput>(initial);
  const [slugTouched, setSlugTouched] = React.useState(Boolean(id));
  const [saving, setSaving] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const confirmDiscard = useUnsavedChanges(dirty && !saving);
  const close = () => { if (confirmDiscard()) onClose(); };
  const set = <K extends keyof BrandInput>(k: K, v: BrandInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const name = (form.name ?? "").trim();
  const nameError = !name ? "Enter the brand name" : name.length > 80 ? "Keep it under 80 characters" : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameError) { setShowErrors(true); return; }
    setSaving(true);
    const r = await saveBrandAction(id, { ...form, slug: slugTouched ? form.slug : "" });
    setSaving(false);
    if (r.ok) { toast.success(id ? "Brand saved" : "Brand created"); onClose(); router.refresh(); }
    else toast.error(id ? "Couldn't save the brand" : "Couldn't create the brand", r.error);
  };

  return (
    <SidePanel open onClose={close} width="sm" title={id ? "Edit brand" : "New brand"} description={id ? initial.name : undefined}
      footer={<div className="flex justify-end gap-2"><button type="button" className={btn.outline} onClick={close} disabled={saving}>Cancel</button><button type="submit" form="brand-form" className={btn.primary} disabled={saving}>{saving ? "Saving…" : id ? "Save changes" : "Create brand"}</button></div>}>
      <form id="brand-form" onSubmit={save} noValidate className="space-y-4">
        <Field label="Name" htmlFor="brand-name" error={showErrors ? nameError : null}>
          <input id="brand-name" required value={form.name ?? ""} aria-invalid={Boolean(showErrors && nameError)} className={inputCls} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} />
        </Field>
        <Field label="Slug" htmlFor="brand-slug" hint="Generated from the name until you edit it.">
          <input id="brand-slug" value={form.slug ?? ""} className={inputCls} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} />
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">Logo <span className="font-normal text-ink-3">(optional)</span></p>
          <ImageUpload bucket="product-images" folder="admin/brands" value={form.logo_url ?? null} onChange={(url) => set("logo_url", url)} className="max-w-32" />
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-3">
          <Switch checked={Boolean(form.is_active)} onChange={(v) => set("is_active", v)} label="Active" />
        </div>
      </form>
    </SidePanel>
  );
}
