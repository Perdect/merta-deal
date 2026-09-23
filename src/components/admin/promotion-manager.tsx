"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Megaphone, ImageIcon } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select, Switch, Textarea } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { ImageUpload } from "@/components/shared/image-upload";
import { RawImg } from "@/components/admin/raw-img";
import { ChipsInput } from "@/components/admin/product-form";
import { BANNER_PLACEMENT_OPTIONS, PROMO_TYPE_OPTIONS } from "@/components/admin/constants";
import { saveBannerAction, deleteBannerAction, savePromotionAction, deletePromotionAction, type BannerInput, type PromotionInput } from "@/lib/actions/admin";
import type { BannerRow, PromotionRow, CityRow } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";

type Opt = { id: string; name: string };
const toLocal = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const now = () => Date.now();
const liveState = (r: { is_active: boolean; starts_at: string; ends_at: string | null }) => (!r.is_active ? "inactive" : new Date(r.starts_at).getTime() > now() ? "scheduled" : r.ends_at && new Date(r.ends_at).getTime() < now() ? "ended" : "live");
const stateTone = { live: "success", scheduled: "info", ended: "neutral", inactive: "neutral" } as const;

export function BannerManager({ banners, cities }: { banners: BannerRow[]; cities: CityRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ id: string | null; form: BannerInput } | null>(null);
  const [del, setDel] = React.useState<BannerRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const blank = (): BannerInput => ({ title: "", subtitle: "", cta_label: "Shop now", link_url: "/categories", image_url: null, bg_color: "#0B6E4F", text_color: "#FFFFFF", placement: "home_hero", sort_order: 0, starts_at: toLocal(new Date().toISOString()), ends_at: "", is_active: true, city_id: null });
  const set = <K extends keyof BannerInput>(k: K, v: BannerInput[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  const openEdit = (b: BannerRow) => setEditing({ id: b.id, form: { title: b.title, subtitle: b.subtitle ?? "", cta_label: b.cta_label ?? "", link_url: b.link_url ?? "", image_url: b.image_url, bg_color: b.bg_color ?? "#0B6E4F", text_color: b.text_color ?? "#FFFFFF", placement: b.placement, sort_order: b.sort_order, starts_at: toLocal(b.starts_at), ends_at: toLocal(b.ends_at), is_active: b.is_active, city_id: b.city_id } });
  const save = async () => { if (!editing) return; setBusy(true); const r = await saveBannerAction(editing.id, editing.form); setBusy(false); if (r.ok) { toast.success(editing.id ? "Banner saved" : "Banner created"); setEditing(null); router.refresh(); } else toast.error(r.error); };
  const remove = async () => { if (!del) return; setBusy(true); const r = await deleteBannerAction(del.id); setBusy(false); if (r.ok) { toast.success("Banner deleted"); setDel(null); router.refresh(); } else toast.error(r.error); };
  const f = editing?.form;
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => setEditing({ id: null, form: blank() })}><Plus className="h-4 w-4" /> New banner</Button></div>
      {banners.length === 0 ? <div className="rounded-lg border border-line bg-card py-12 text-center text-sm text-ink-3"><ImageIcon className="mx-auto mb-2 h-7 w-7 text-ink-4" />No banners yet. The home hero shows a default until you add one.</div> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {banners.map((b) => { const st = liveState(b); return (
            <li key={b.id} className="overflow-hidden rounded-lg border border-line bg-card">
              <div className="relative flex h-28 items-end p-3" style={{ backgroundColor: b.bg_color ?? "#0B6E4F", color: b.text_color ?? "#fff" }}>
                {b.image_url ? <RawImg src={b.image_url} className="absolute inset-0 h-full w-full object-cover opacity-70" /> : null}
                <div className="relative"><p className="font-display text-base font-bold leading-tight">{b.title}</p>{b.subtitle ? <p className="text-xs opacity-90">{b.subtitle}</p> : null}{b.cta_label ? <span className="mt-1 inline-block rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-ink">{b.cta_label}</span> : null}</div>
              </div>
              <div className="flex items-center gap-2 p-3 text-xs">
                <Badge tone={stateTone[st]} size="xs">{st}</Badge><span className="text-ink-3">{BANNER_PLACEMENT_OPTIONS.find((o) => o.value === b.placement)?.label} · #{b.sort_order}{b.city_id ? ` · ${cities.find((c) => c.id === b.city_id)?.name ?? "city"}` : ""}</span>
                <span className="ml-auto text-ink-4">{formatDate(b.starts_at)}{b.ends_at ? ` → ${formatDate(b.ends_at)}` : ""}</span>
                <IconButton label="Edit" className="h-8 w-8" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></IconButton><IconButton label="Delete" className="h-8 w-8 text-danger" onClick={() => setDel(b)}><Trash2 className="h-4 w-4" /></IconButton>
              </div>
            </li>
          ); })}
        </ul>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? "Edit banner" : "New banner"} size="lg" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setEditing(null)}>Cancel</Button><Button fullWidth loading={busy} onClick={save}>{editing?.id ? "Save" : "Create"}</Button></div>}>
        {f ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Title" required value={f.title} onChange={(e) => set("title", e.target.value)} />
            <Input label="Subtitle" value={f.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} />
            <Input label="CTA label" value={f.cta_label ?? ""} onChange={(e) => set("cta_label", e.target.value)} placeholder="Shop now" />
            <Input label="Link" value={f.link_url ?? ""} onChange={(e) => set("link_url", e.target.value)} placeholder="/c/grocery or https://…" />
            <div className="sm:col-span-2"><label className="mb-1.5 block text-sm font-medium text-ink-2">Image</label><ImageUpload bucket="banners" folder="admin" value={f.image_url ?? null} onChange={(url) => set("image_url", url)} aspect="wide" /></div>
            <div className="space-y-1.5"><label className="block text-sm font-medium text-ink-2">Background</label><div className="flex gap-2"><input type="color" aria-label="Background colour" value={f.bg_color ?? "#0B6E4F"} onChange={(e) => set("bg_color", e.target.value)} className="h-11 w-14 rounded-sm border border-line-2 bg-card p-1" /><Input aria-label="Background hex" value={f.bg_color ?? ""} onChange={(e) => set("bg_color", e.target.value)} /></div></div>
            <div className="space-y-1.5"><label className="block text-sm font-medium text-ink-2">Text colour</label><div className="flex gap-2"><input type="color" aria-label="Text colour" value={f.text_color ?? "#FFFFFF"} onChange={(e) => set("text_color", e.target.value)} className="h-11 w-14 rounded-sm border border-line-2 bg-card p-1" /><Input aria-label="Text hex" value={f.text_color ?? ""} onChange={(e) => set("text_color", e.target.value)} /></div></div>
            <Select label="Placement" options={BANNER_PLACEMENT_OPTIONS} value={f.placement ?? "home_hero"} onChange={(e) => set("placement", e.target.value as BannerInput["placement"])} />
            <Input label="Sort order" type="number" min={0} value={(f.sort_order as number) ?? 0} onChange={(e) => set("sort_order", Number(e.target.value))} />
            <Input label="Starts" type="datetime-local" required value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
            <Input label="Ends" type="datetime-local" value={f.ends_at ?? ""} onChange={(e) => set("ends_at", e.target.value)} hint="Blank = no end" />
            <Select label="City" placeholder="All cities" options={cities.map((c) => ({ value: c.id, label: c.name }))} value={f.city_id ?? ""} onChange={(e) => set("city_id", e.target.value || null)} />
            <div className="pt-6"><Switch checked={Boolean(f.is_active)} onChange={(v) => set("is_active", v)} label="Active" /></div>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} tone="danger" title="Delete this banner?" confirmLabel="Delete" loading={busy} onConfirm={remove} />
    </div>
  );
}

export function PromotionManager({ promotions, categories, productNames }: { promotions: PromotionRow[]; categories: Opt[]; productNames: Record<string, string> }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ id: string | null; form: PromotionInput } | null>(null);
  const [del, setDel] = React.useState<PromotionRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const blank = (): PromotionInput => ({ title: "", description: "", promo_type: "collection", product_ids: [], category_id: null, discount_percent: null, starts_at: toLocal(new Date().toISOString()), ends_at: "", is_active: true, sort_order: 0 });
  const set = <K extends keyof PromotionInput>(k: K, v: PromotionInput[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  const openEdit = (p: PromotionRow) => setEditing({ id: p.id, form: { title: p.title, description: p.description ?? "", promo_type: p.promo_type as PromotionInput["promo_type"], product_ids: p.product_ids, category_id: p.category_id, discount_percent: p.discount_percent, starts_at: toLocal(p.starts_at), ends_at: toLocal(p.ends_at), is_active: p.is_active, sort_order: p.sort_order } });
  const save = async () => { if (!editing) return; setBusy(true); const r = await savePromotionAction(editing.id, editing.form); setBusy(false); if (r.ok) { toast.success(editing.id ? "Promotion saved" : "Promotion created"); setEditing(null); router.refresh(); } else toast.error(r.error); };
  const remove = async () => { if (!del) return; setBusy(true); const r = await deletePromotionAction(del.id); setBusy(false); if (r.ok) { toast.success("Promotion deleted"); setDel(null); router.refresh(); } else toast.error(r.error); };
  const f = editing?.form;
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => setEditing({ id: null, form: blank() })}><Plus className="h-4 w-4" /> New promotion</Button></div>
      {promotions.length === 0 ? <div className="rounded-lg border border-line bg-card py-12 text-center text-sm text-ink-3"><Megaphone className="mx-auto mb-2 h-7 w-7 text-ink-4" />No promotions yet.</div> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-card px-4">
          {promotions.map((p) => { const st = liveState(p); return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{p.title} <Badge tone={stateTone[st]} size="xs" className="ml-1">{st}</Badge> <Badge tone="neutral" size="xs">{PROMO_TYPE_OPTIONS.find((o) => o.value === p.promo_type)?.label ?? p.promo_type}</Badge></p>
                <p className="text-xs text-ink-3">{p.product_ids.length} products{p.category_id ? ` · ${categories.find((c) => c.id === p.category_id)?.name ?? "category"}` : ""}{p.discount_percent ? ` · ${p.discount_percent}% off` : ""} · {formatDate(p.starts_at)}{p.ends_at ? ` → ${formatDate(p.ends_at)}` : ""}</p>
                {p.product_ids.length ? <p className="mt-0.5 truncate text-[11px] text-ink-4">{p.product_ids.slice(0, 6).map((id) => productNames[id] ?? id.slice(0, 8)).join(", ")}{p.product_ids.length > 6 ? "…" : ""}</p> : null}
              </div>
              <IconButton label="Edit" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></IconButton><IconButton label="Delete" className="h-8 w-8 text-danger" onClick={() => setDel(p)}><Trash2 className="h-4 w-4" /></IconButton>
            </li>
          ); })}
        </ul>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? "Edit promotion" : "New promotion"} size="lg" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setEditing(null)}>Cancel</Button><Button fullWidth loading={busy} onClick={save}>{editing?.id ? "Save" : "Create"}</Button></div>}>
        {f ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Title" required value={f.title} onChange={(e) => set("title", e.target.value)} />
            <Select label="Type" options={PROMO_TYPE_OPTIONS} value={f.promo_type ?? "collection"} onChange={(e) => set("promo_type", e.target.value as PromotionInput["promo_type"])} />
            <div className="sm:col-span-2"><Textarea label="Description" value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
            <div className="sm:col-span-2"><ChipsInput label="Product IDs" value={f.product_ids ?? []} onChange={(v) => set("product_ids", v)} placeholder="Paste product UUIDs" hint="Copy IDs from the product page URL (/admin/products/<id>). Comma-separated or one per Enter." /></div>
            <Select label="Category" placeholder="None" options={categories.map((c) => ({ value: c.id, label: c.name }))} value={f.category_id ?? ""} onChange={(e) => set("category_id", e.target.value || null)} />
            <Input label="Discount %" type="number" min={0} max={100} placeholder="Display only" value={(f.discount_percent as number | null) ?? ""} onChange={(e) => set("discount_percent", e.target.value === "" ? null : Number(e.target.value))} />
            <Input label="Starts" type="datetime-local" required value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
            <Input label="Ends" type="datetime-local" value={f.ends_at ?? ""} onChange={(e) => set("ends_at", e.target.value)} />
            <Input label="Sort order" type="number" min={0} value={(f.sort_order as number) ?? 0} onChange={(e) => set("sort_order", Number(e.target.value))} />
            <div className="pt-6"><Switch checked={Boolean(f.is_active)} onChange={(v) => set("is_active", v)} label="Active" /></div>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} tone="danger" title="Delete this promotion?" confirmLabel="Delete" loading={busy} onConfirm={remove} />
    </div>
  );
}
