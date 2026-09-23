"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, EyeOff, Star } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select, Switch, Textarea } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { ImageUpload } from "@/components/shared/image-upload";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { RawImg } from "@/components/admin/raw-img";
import { CATEGORY_ICON_OPTIONS } from "@/components/admin/constants";
import { saveCategoryAction, deleteCategoryAction, moveCategoryAction, type CategoryInput } from "@/lib/actions/admin";
import type { CategoryRow } from "@/lib/data/admin";
import { cn, slugify } from "@/lib/utils";

const empty = (parent_id: string | null = null): CategoryInput => ({ name: "", slug: "", parent_id, description: "", icon: "basket", image_url: null, color: "#0B6E4F", sort_order: 0, is_active: true, is_featured: false });

export function CategoryManager({ categories, counts }: { categories: CategoryRow[]; counts: Record<string, number> }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ id: string | null; form: CategoryInput } | null>(null);
  const [del, setDel] = React.useState<CategoryRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [slugTouched, setSlugTouched] = React.useState(false);
  const parents = categories.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);

  const openNew = (parent_id: string | null) => { setSlugTouched(false); setEditing({ id: null, form: empty(parent_id) }); };
  const openEdit = (c: CategoryRow) => { setSlugTouched(true); setEditing({ id: c.id, form: { name: c.name, slug: c.slug, parent_id: c.parent_id, description: c.description ?? "", icon: c.icon ?? "basket", image_url: c.image_url, color: c.color ?? "#0B6E4F", sort_order: c.sort_order, is_active: c.is_active, is_featured: c.is_featured } }); };
  const set = <K extends keyof CategoryInput>(k: K, v: CategoryInput[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  const save = async () => {
    if (!editing) return; setBusy("save");
    const r = await saveCategoryAction(editing.id, { ...editing.form, slug: slugTouched ? editing.form.slug : "" });
    setBusy(null);
    if (r.ok) { toast.success(editing.id ? "Category saved" : "Category created"); setEditing(null); router.refresh(); } else toast.error(r.error);
  };
  const move = async (id: string, dir: "up" | "down") => { setBusy(id); const r = await moveCategoryAction(id, dir); setBusy(null); if (r.ok) router.refresh(); else toast.error(r.error); };
  const remove = async () => { if (!del) return; setBusy("del"); const r = await deleteCategoryAction(del.id); setBusy(null); if (r.ok) { toast.success("Category deleted"); setDel(null); router.refresh(); } else toast.error(r.error); };

  const RowView = ({ c, depth, siblings }: { c: CategoryRow; depth: number; siblings: CategoryRow[] }) => {
    const idx = siblings.findIndex((s) => s.id === c.id);
    return (
      <li className={cn("flex items-center gap-3 py-2", depth ? "pl-10" : "")}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white" style={{ backgroundColor: c.color ?? "#0B6E4F" }}>{c.image_url ? <RawImg src={c.image_url} className="h-9 w-9 rounded-md object-cover" /> : <DynamicIcon name={c.icon} className="h-4.5 w-4.5" />}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">{c.name}{!c.is_active ? <EyeOff className="h-3.5 w-3.5 text-ink-4" aria-label="Hidden" /> : null}{c.is_featured ? <Star className="h-3.5 w-3.5 fill-saffron-500 text-saffron-500" aria-label="Featured" /> : null}</p>
          <p className="truncate text-xs text-ink-3">/{c.slug} · {counts[c.id] ?? 0} products{depth === 0 ? ` · ${childrenOf(c.id).length} sub` : ""}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="Move up" disabled={idx <= 0 || busy === c.id} onClick={() => move(c.id, "up")} className="h-8 w-8"><ChevronUp className="h-4 w-4" /></IconButton>
          <IconButton label="Move down" disabled={idx >= siblings.length - 1 || busy === c.id} onClick={() => move(c.id, "down")} className="h-8 w-8"><ChevronDown className="h-4 w-4" /></IconButton>
          {depth === 0 ? <IconButton label="Add subcategory" onClick={() => openNew(c.id)} className="h-8 w-8"><Plus className="h-4 w-4" /></IconButton> : null}
          <IconButton label="Edit" onClick={() => openEdit(c)} className="h-8 w-8"><Pencil className="h-4 w-4" /></IconButton>
          <IconButton label="Delete" onClick={() => setDel(c)} className="h-8 w-8 text-danger"><Trash2 className="h-4 w-4" /></IconButton>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => openNew(null)}><Plus className="h-4 w-4" /> New category</Button></div>
      <ul className="divide-y divide-line rounded-lg border border-line bg-card px-4">
        {parents.length === 0 ? <li className="py-10 text-center text-sm text-ink-3">No categories yet.</li> : parents.map((p) => (
          <React.Fragment key={p.id}>
            <RowView c={p} depth={0} siblings={parents} />
            {childrenOf(p.id).length ? <ul className="divide-y divide-line border-t border-line">{childrenOf(p.id).map((ch) => <RowView key={ch.id} c={ch} depth={1} siblings={childrenOf(p.id)} />)}</ul> : null}
          </React.Fragment>
        ))}
      </ul>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? "Edit category" : editing?.form.parent_id ? "New subcategory" : "New category"} size="lg" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setEditing(null)}>Cancel</Button><Button fullWidth loading={busy === "save"} onClick={save}>{editing?.id ? "Save" : "Create"}</Button></div>}>
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name" required value={editing.form.name} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} />
            <Input label="Slug" value={editing.form.slug ?? ""} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} hint="URL: /c/<slug>" />
            <Select label="Parent" placeholder="Top-level category" options={parents.filter((p) => p.id !== editing.id).map((p) => ({ value: p.id, label: p.name }))} value={editing.form.parent_id ?? ""} onChange={(e) => set("parent_id", e.target.value || null)} />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ink-2">Icon</label>
              <div className="flex items-center gap-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-white" style={{ backgroundColor: editing.form.color || "#0B6E4F" }}><DynamicIcon name={editing.form.icon} className="h-5 w-5" /></span>
                <Select aria-label="Icon" options={CATEGORY_ICON_OPTIONS.map((i) => ({ value: i, label: i }))} value={editing.form.icon ?? "basket"} onChange={(e) => set("icon", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ink-2">Tile colour</label>
              <div className="flex gap-2"><input type="color" aria-label="Colour picker" value={editing.form.color || "#0B6E4F"} onChange={(e) => set("color", e.target.value)} className="h-11 w-14 cursor-pointer rounded-sm border border-line-2 bg-card p-1" /><Input aria-label="Colour hex" value={editing.form.color ?? ""} onChange={(e) => set("color", e.target.value)} placeholder="#0B6E4F" /></div>
            </div>
            <Input label="Sort order" type="number" min={0} value={(editing.form.sort_order as number) ?? 0} onChange={(e) => set("sort_order", Number(e.target.value))} hint="Lower shows first; use the arrows on the list for quick reordering." />
            <div className="sm:col-span-2"><Textarea label="Description" value={editing.form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
            <div><label className="mb-1.5 block text-sm font-medium text-ink-2">Image (optional)</label><ImageUpload bucket="product-images" folder="admin/categories" value={editing.form.image_url ?? null} onChange={(url) => set("image_url", url)} aspect="square" className="max-w-40" /></div>
            <div className="space-y-3 pt-6">
              <Switch checked={Boolean(editing.form.is_active)} onChange={(v) => set("is_active", v)} label="Active (visible to customers)" />
              <Switch checked={Boolean(editing.form.is_featured)} onChange={(v) => set("is_featured", v)} label="Featured on home" />
            </div>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} tone="danger" title={`Delete “${del?.name}”?`} description={<span>{counts[del?.id ?? ""] ? <Badge tone="danger">{counts[del!.id]} products</Badge> : "No products"} in this category. Subcategories become top-level.</span>} confirmLabel="Delete" loading={busy === "del"} onConfirm={remove} />
    </div>
  );
}
