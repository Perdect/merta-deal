"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, FolderTree, SearchX, CornerDownRight } from "lucide-react";
import { AdminPageHeader, DataTable, CellStack, EmptyBlock, StatusPill, IconAction, SidePanel, useUnsavedChanges } from "@/components/admin/kit";
import { Switch } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ImageUpload } from "@/components/shared/image-upload";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { RawImg } from "@/components/admin/raw-img";
import { CATEGORY_ICON_OPTIONS } from "@/components/admin/constants";
import { Field, inputCls, btn } from "@/components/admin/catalogue/bits";
import { saveCategoryAction, deleteCategoryAction, moveCategoryAction, type CategoryInput } from "@/lib/actions/admin";
import type { CategoryRow } from "@/lib/data/admin-catalogue";
import { cn, slugify } from "@/lib/utils";

const DEFAULT_COLOR = "#329537";
const empty = (parent_id: string | null = null): CategoryInput => ({ name: "", slug: "", parent_id, description: "", icon: "basket", image_url: null, color: DEFAULT_COLOR, sort_order: 0, is_active: true, is_featured: false });
const toForm = (c: CategoryRow): CategoryInput => ({ name: c.name, slug: c.slug, parent_id: c.parent_id, description: c.description ?? "", icon: c.icon ?? "basket", image_url: c.image_url, color: c.color ?? DEFAULT_COLOR, sort_order: c.sort_order, is_active: c.is_active, is_featured: c.is_featured });

export type CategoryListRow = { cat: CategoryRow; depth: 0 | 1 };

/** A 40px tile: the category image, or its icon on its colour. */
function CategoryTile({ c }: { c: Pick<CategoryRow, "image_url" | "icon" | "color" | "name"> }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line text-white" style={{ backgroundColor: c.image_url ? "#fff" : c.color || DEFAULT_COLOR }}>
      {c.image_url ? <RawImg src={c.image_url} alt="" className="h-full w-full object-contain" /> : <DynamicIcon name={c.icon} className="h-[18px] w-[18px]" />}
    </span>
  );
}

/**
 * Categories: a two-level tree shown as a table. Create / edit in a side panel, reorder with the
 * arrows (within the same parent; disabled while a search or filter is applied), delete with a confirm.
 */
export function CategoryManager({ categories, counts, rows, filtered, toolbar }: { categories: CategoryRow[]; counts: Record<string, number>; rows: CategoryListRow[]; filtered: boolean; toolbar?: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ id: string | null; form: CategoryInput; base: CategoryInput } | null>(null);
  const [del, setDel] = React.useState<CategoryRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const parents = categories.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);
  const siblingsOf = (c: CategoryRow) => (c.parent_id ? childrenOf(c.parent_id) : parents);
  const nameOf = (id: string | null) => categories.find((c) => c.id === id)?.name;

  const openNew = (parent_id: string | null) => { const f = empty(parent_id); setEditing({ id: null, form: f, base: f }); };
  const openEdit = (c: CategoryRow) => { const f = toForm(c); setEditing({ id: c.id, form: f, base: f }); };
  const move = async (c: CategoryRow, dir: "up" | "down") => {
    setBusy(c.id);
    const r = await moveCategoryAction(c.id, dir);
    setBusy(null);
    if (r.ok) { toast.success(`Moved “${c.name}” ${dir}`); router.refresh(); } else toast.error("Couldn't reorder", r.error);
  };
  const remove = async () => {
    if (!del) return;
    setBusy("del");
    const r = await deleteCategoryAction(del.id);
    setBusy(null);
    if (r.ok) { toast.success(`Deleted “${del.name}”`); setDel(null); router.refresh(); } else { toast.error("Couldn't delete the category", r.error); setDel(null); }
  };

  const top = parents.length; const sub = categories.length - parents.length;

  return (
    <>
      <AdminPageHeader title="Categories" description={`${top} top-level ${top === 1 ? "category" : "categories"} and ${sub} ${sub === 1 ? "subcategory" : "subcategories"}. Order here is the order customers see.`}
        actions={<button type="button" className={btn.primary} onClick={() => openNew(null)}><Plus className="h-4 w-4" aria-hidden />New category</button>} />
      {toolbar}

      <DataTable caption="Categories" rows={rows} rowKey={(r) => r.cat.id}
        empty={filtered
          ? <EmptyBlock icon={SearchX} title="No categories match" description="Try another tab or clear the search." />
          : <EmptyBlock icon={FolderTree} title="No categories yet" description="Create the first category; products are filed under one." action={<button type="button" className={btn.primary} onClick={() => openNew(null)}><Plus className="h-4 w-4" aria-hidden />New category</button>} />}
        columns={[
          { key: "name", header: "Category", render: ({ cat: c, depth }) => (
            <span className={cn("flex min-w-0 items-center gap-3", depth && !filtered && "pl-5 sm:pl-8")}>
              {depth && !filtered ? <CornerDownRight className="-ml-5 h-3.5 w-3.5 shrink-0 text-ink-4 sm:-ml-6" aria-hidden /> : null}
              <CategoryTile c={c} />
              <CellStack className="max-w-[200px] sm:max-w-[320px]" primary={c.name} secondary={`${c.parent_id && filtered ? `in ${nameOf(c.parent_id) ?? "—"} · ` : ""}/c/${c.slug}`} />
            </span>
          ) },
          { key: "products", header: "Products", align: "right", render: ({ cat: c }) => {
            const n = counts[c.id] ?? 0;
            return n ? <Link href={`/admin/products?category=${c.id}`} className="tabular font-medium text-brand-700 hover:underline" aria-label={`${n} products in ${c.name}`}>{n}</Link> : <span className="tabular text-ink-4">0</span>;
          } },
          { key: "subs", header: "Subcategories", align: "right", hideBelow: "md", render: ({ cat: c }) => c.parent_id ? <span className="text-ink-4">—</span> : <span className="tabular text-ink-3">{childrenOf(c.id).length}</span> },
          { key: "status", header: "Status", hideBelow: "sm", render: ({ cat: c }) => (
            <span className="flex flex-wrap gap-1">{c.is_active ? <StatusPill tone="green">Visible</StatusPill> : <StatusPill tone="neutral">Hidden</StatusPill>}{c.is_featured ? <StatusPill tone="violet">Featured</StatusPill> : null}</span>
          ) },
          { key: "order", header: "Order", hideBelow: "sm", render: ({ cat: c }) => {
            const sib = siblingsOf(c); const idx = sib.findIndex((s) => s.id === c.id);
            const why = filtered ? "Clear search and filters to reorder" : null;
            return (
              <span className="inline-flex items-center">
                <IconAction label={why ?? `Move ${c.name} up`} disabled={Boolean(why) || idx <= 0 || busy !== null} onClick={() => void move(c, "up")}><ChevronUp className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
                <IconAction label={why ?? `Move ${c.name} down`} disabled={Boolean(why) || idx >= sib.length - 1 || busy !== null} onClick={() => void move(c, "down")}><ChevronDown className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
              </span>
            );
          } },
          { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: ({ cat: c }) => (
            <span className="inline-flex items-center justify-end">
              {!c.parent_id ? <IconAction label={`Add a subcategory to ${c.name}`} onClick={() => openNew(c.id)}><Plus className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction> : null}
              <IconAction label={`Edit ${c.name}`} onClick={() => openEdit(c)}><Pencil className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
              <IconAction label={`Delete ${c.name}`} tone="danger" onClick={() => setDel(c)}><Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
            </span>
          ) },
        ]} />

      {editing ? <CategoryEditor key={editing.id ?? `new-${editing.form.parent_id ?? "top"}`} editing={editing} parents={parents} childCount={editing.id ? childrenOf(editing.id).length : 0} onClose={() => setEditing(null)} /> : null}

      {del && (counts[del.id] ?? 0) > 0 ? (
        <Modal open onClose={() => setDel(null)} title={`“${del.name}” still has products`} size="sm"
          footer={<div className="flex gap-2"><button type="button" className={cn(btn.outline, "h-11 flex-1")} onClick={() => setDel(null)}>Close</button><Link href={`/admin/products?category=${del.id}`} className={cn(btn.primary, "h-11 flex-1")}>View its products</Link></div>}>
          <p className="text-sm text-ink-2">Move its {counts[del.id]} {counts[del.id] === 1 ? "product" : "products"} to another category first (edit each product&apos;s category), or hide the category instead of deleting it.</p>
        </Modal>
      ) : (
        <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} tone="danger" title={`Delete “${del?.name ?? ""}”?`}
          description={del && !del.parent_id && childrenOf(del.id).length ? `It has no products. Its ${childrenOf(del.id).length} subcategories become top-level categories. This can't be undone.` : "It has no products. This can't be undone."}
          confirmLabel="Delete category" loading={busy === "del"} onConfirm={() => void remove()} />
      )}
    </>
  );
}

function CategoryEditor({ editing, parents, childCount, onClose }: { editing: { id: string | null; form: CategoryInput; base: CategoryInput }; parents: CategoryRow[]; childCount: number; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = React.useState<CategoryInput>(editing.form);
  const [slugTouched, setSlugTouched] = React.useState(Boolean(editing.id));
  const [saving, setSaving] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(editing.base);
  const confirmDiscard = useUnsavedChanges(dirty && !saving);
  const close = () => { if (confirmDiscard()) onClose(); };
  const set = <K extends keyof CategoryInput>(k: K, v: CategoryInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const name = (form.name ?? "").trim();
  const errors: Record<string, string | null> = {
    name: name.length < 2 ? "Enter a name (at least 2 characters)" : name.length > 80 ? "Keep it under 80 characters" : null,
    color: form.color && !/^#[0-9a-fA-F]{6}$/.test(String(form.color)) ? "Use a hex colour like #329537" : null,
    sort_order: !/^\d+$/.test(String(form.sort_order ?? 0)) ? "Use a whole number, 0 or more" : null,
    parent_id: editing.id && form.parent_id && childCount > 0 ? "This category has subcategories, so it must stay top-level" : null,
  };
  const err = (k: string) => (showErrors ? errors[k] : null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.values(errors).some(Boolean)) { setShowErrors(true); return; }
    setSaving(true);
    const r = await saveCategoryAction(editing.id, { ...form, slug: slugTouched ? form.slug : "" });
    setSaving(false);
    if (r.ok) { toast.success(editing.id ? "Category saved" : "Category created"); onClose(); router.refresh(); }
    else toast.error(editing.id ? "Couldn't save the category" : "Couldn't create the category", r.error);
  };

  const title = editing.id ? "Edit category" : form.parent_id ? "New subcategory" : "New category";
  return (
    <SidePanel open onClose={close} title={title} description={editing.id ? editing.base.name : "Shown in the shop's category list and filters."}
      footer={<div className="flex justify-end gap-2"><button type="button" className={btn.outline} onClick={close} disabled={saving}>Cancel</button><button type="submit" form="category-form" className={btn.primary} disabled={saving}>{saving ? "Saving…" : editing.id ? "Save changes" : "Create category"}</button></div>}>
      <form id="category-form" onSubmit={save} noValidate className="space-y-4">
        <Field label="Name" htmlFor="cat-name" error={err("name")}>
          <input id="cat-name" required value={form.name ?? ""} aria-invalid={Boolean(err("name"))} className={inputCls} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} />
        </Field>
        <Field label="Slug" htmlFor="cat-slug" hint="Web address: /c/<slug>. Generated from the name until you edit it.">
          <input id="cat-slug" value={form.slug ?? ""} className={inputCls} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} />
        </Field>
        <Field label="Parent" htmlFor="cat-parent" error={err("parent_id")} hint="Leave as top-level, or file it under another category.">
          <select id="cat-parent" value={form.parent_id ?? ""} className={inputCls} onChange={(e) => set("parent_id", e.target.value || null)}>
            <option value="">Top-level category</option>
            {parents.filter((p) => p.id !== editing.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Icon" htmlFor="cat-icon">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: String(form.color || DEFAULT_COLOR) }}><DynamicIcon name={form.icon} className="h-5 w-5" /></span>
              <select id="cat-icon" value={form.icon ?? "basket"} className={inputCls} onChange={(e) => set("icon", e.target.value)}>
                {CATEGORY_ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </Field>
          <Field label="Tile colour" htmlFor="cat-color" error={err("color")}>
            <div className="flex gap-2">
              <input type="color" aria-label="Pick tile colour" value={/^#[0-9a-fA-F]{6}$/.test(String(form.color)) ? String(form.color) : DEFAULT_COLOR} onChange={(e) => set("color", e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line-2 bg-card p-1" />
              <input id="cat-color" value={form.color ?? ""} placeholder={DEFAULT_COLOR} aria-invalid={Boolean(err("color"))} className={inputCls} onChange={(e) => set("color", e.target.value)} />
            </div>
          </Field>
        </div>
        <Field label="Sort order" htmlFor="cat-sort" error={err("sort_order")} hint="Lower shows first. The arrows in the list reorder quickly.">
          <input id="cat-sort" type="number" min={0} step={1} inputMode="numeric" value={String(form.sort_order ?? 0)} aria-invalid={Boolean(err("sort_order"))} className={inputCls} onChange={(e) => set("sort_order", e.target.value === "" ? "" : Number(e.target.value))} />
        </Field>
        <Field label="Description" htmlFor="cat-desc">
          <textarea id="cat-desc" rows={3} value={form.description ?? ""} className={cn(inputCls, "h-auto py-2.5")} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">Image <span className="font-normal text-ink-3">(optional, replaces the icon)</span></p>
          <ImageUpload bucket="product-images" folder="admin/categories" value={form.image_url ?? null} onChange={(url) => set("image_url", url)} aspect="square" className="max-w-36" />
        </div>
        <div className="space-y-3 rounded-lg bg-surface-2 px-3 py-3">
          <Switch checked={Boolean(form.is_active)} onChange={(v) => set("is_active", v)} label="Visible to customers" />
          <Switch checked={Boolean(form.is_featured)} onChange={(v) => set("is_featured", v)} label="Featured on the home page" />
        </div>
        {showErrors && Object.values(errors).some(Boolean) ? <p className="text-sm font-medium text-danger" role="alert">Fix the highlighted fields to save.</p> : null}
      </form>
    </SidePanel>
  );
}
