"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Switch } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { ImageUpload } from "@/components/shared/image-upload";
import { RawImg } from "@/components/admin/raw-img";
import { saveBrandAction, deleteBrandAction, type BrandInput } from "@/lib/actions/admin";
import type { BrandRow } from "@/lib/data/admin";
import { slugify } from "@/lib/utils";

export function BrandManager({ brands, counts }: { brands: BrandRow[]; counts: Record<string, number> }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string | null; form: BrandInput } | null>(null);
  const [del, setDel] = React.useState<BrandRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [slugTouched, setSlugTouched] = React.useState(false);
  const list = brands.filter((b) => !q || b.name.toLowerCase().includes(q.toLowerCase()));
  const set = <K extends keyof BrandInput>(k: K, v: BrandInput[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  const save = async () => { if (!editing) return; setBusy(true); const r = await saveBrandAction(editing.id, { ...editing.form, slug: slugTouched ? editing.form.slug : "" }); setBusy(false); if (r.ok) { toast.success(editing.id ? "Brand saved" : "Brand created"); setEditing(null); router.refresh(); } else toast.error(r.error); };
  const remove = async () => { if (!del) return; setBusy(true); const r = await deleteBrandAction(del.id); setBusy(false); if (r.ok) { toast.success("Brand deleted"); setDel(null); router.refresh(); } else toast.error(r.error); };
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input placeholder="Filter brands" value={q} onChange={(e) => setQ(e.target.value)} wrapperClassName="sm:w-72" aria-label="Filter brands" />
        <Button size="sm" className="sm:ml-auto" onClick={() => { setSlugTouched(false); setEditing({ id: null, form: { name: "", slug: "", logo_url: null, is_active: true } }); }}><Plus className="h-4 w-4" /> New brand</Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.length === 0 ? <li className="col-span-full py-10 text-center text-sm text-ink-3">No brands match.</li> : list.map((b) => (
          <li key={b.id} className="flex items-center gap-3 rounded-lg border border-line bg-card p-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 text-ink-3">{b.logo_url ? <RawImg src={b.logo_url} className="h-full w-full object-contain" /> : <Tag className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{b.name}</p><p className="truncate text-xs text-ink-3">/{b.slug} · {counts[b.id] ?? 0} products {!b.is_active ? <Badge tone="neutral" size="xs" className="ml-1">inactive</Badge> : null}</p></div>
            <IconButton label="Edit" className="h-8 w-8" onClick={() => { setSlugTouched(true); setEditing({ id: b.id, form: { name: b.name, slug: b.slug, logo_url: b.logo_url, is_active: b.is_active } }); }}><Pencil className="h-4 w-4" /></IconButton>
            <IconButton label="Delete" className="h-8 w-8 text-danger" onClick={() => setDel(b)}><Trash2 className="h-4 w-4" /></IconButton>
          </li>
        ))}
      </ul>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? "Edit brand" : "New brand"} size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setEditing(null)}>Cancel</Button><Button fullWidth loading={busy} onClick={save}>{editing?.id ? "Save" : "Create"}</Button></div>}>
        {editing ? (
          <div className="space-y-3">
            <Input label="Name" required value={editing.form.name} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} />
            <Input label="Slug" value={editing.form.slug ?? ""} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} />
            <div><label className="mb-1.5 block text-sm font-medium text-ink-2">Logo</label><ImageUpload bucket="product-images" folder="admin/brands" value={editing.form.logo_url ?? null} onChange={(url) => set("logo_url", url)} className="max-w-32" /></div>
            <Switch checked={Boolean(editing.form.is_active)} onChange={(v) => set("is_active", v)} label="Active" />
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} tone="danger" title={`Delete “${del?.name}”?`} description={`${counts[del?.id ?? ""] ?? 0} products will become unbranded.`} confirmLabel="Delete" loading={busy} onConfirm={remove} />
    </div>
  );
}
