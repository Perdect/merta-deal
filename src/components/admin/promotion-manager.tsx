"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Megaphone, Pencil, Plus, Trash2, X } from "lucide-react";
import { AdminPageHeader, Panel, DataTable, CellStack, EmptyBlock, IconAction, StatusPill, type Tone } from "@/components/admin/kit";
import { Input, Select, Switch, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ImageUpload } from "@/components/shared/image-upload";
import { RawImg } from "@/components/admin/raw-img";
import { FormPanel, FieldGroup, toLocalInput, fromLocalInput, hasErrors, type Errors } from "@/components/admin/care/form-panel";
import { btn, Field } from "@/components/admin/care/shared";
import { BANNER_PLACEMENT_OPTIONS, PROMO_TYPE_OPTIONS } from "@/components/admin/constants";
import { saveBannerAction, deleteBannerAction, savePromotionAction, deletePromotionAction, type BannerInput, type PromotionInput } from "@/lib/actions/admin";
import type { BannerRow, PromotionRow, CityRow } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";
import { categoryOptions, type CategoryLike } from "@/lib/categories";

type Scheduled = { is_active: boolean; starts_at: string; ends_at: string | null };

function liveState(r: Scheduled, now: number): { label: string; tone: Tone; detail: string } {
  if (!r.is_active) return { label: "Inactive", tone: "neutral", detail: "Switched off" };
  if (Date.parse(r.starts_at) > now) return { label: "Scheduled", tone: "blue", detail: `Starts ${formatDate(r.starts_at)}` };
  if (r.ends_at && Date.parse(r.ends_at) < now) return { label: "Ended", tone: "neutral", detail: `Ended ${formatDate(r.ends_at)}` };
  return { label: "Live", tone: "green", detail: r.ends_at ? `Until ${formatDate(r.ends_at)}` : "No end date" };
}
const schedule = (r: Scheduled) => `${formatDate(r.starts_at)} – ${r.ends_at ? formatDate(r.ends_at) : "no end"}`;
const HEX = /^#[0-9a-fA-F]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tableCls = "rounded-none border-0 border-t shadow-none";

/* ------------------------------------------------------------------------------------------------
 * Banner form
 * ---------------------------------------------------------------------------------------------- */

type BannerForm = { title: string; subtitle: string; cta_label: string; link_url: string; image_url: string | null; bg_color: string; text_color: string; placement: NonNullable<BannerInput["placement"]>; sort_order: string; starts_at: string; ends_at: string; is_active: boolean; city_id: string };
type BKey = keyof BannerForm;
const blankBanner = (): BannerForm => ({ title: "", subtitle: "", cta_label: "Shop now", link_url: "/categories", image_url: null, bg_color: "#329537", text_color: "#FFFFFF", placement: "home_hero", sort_order: "0", starts_at: toLocalInput(new Date().toISOString()), ends_at: "", is_active: true, city_id: "" });
const fromBanner = (b: BannerRow): BannerForm => ({ title: b.title, subtitle: b.subtitle ?? "", cta_label: b.cta_label ?? "", link_url: b.link_url ?? "", image_url: b.image_url, bg_color: b.bg_color ?? "#329537", text_color: b.text_color ?? "#FFFFFF", placement: b.placement, sort_order: String(b.sort_order), starts_at: toLocalInput(b.starts_at), ends_at: toLocalInput(b.ends_at), is_active: b.is_active, city_id: b.city_id ?? "" });
function validateBanner(f: BannerForm): Errors<BKey> {
  const e: Errors<BKey> = {};
  const t = f.title.trim().length;
  if (t < 2 || t > 120) e.title = "Enter a title of 2–120 characters.";
  if (f.link_url.trim() && !/^(\/|https?:\/\/)\S*$/i.test(f.link_url.trim())) e.link_url = "Start with / for a page on this site, or https:// for an external link.";
  if (!HEX.test(f.bg_color)) e.bg_color = "Use a hex colour like #329537.";
  if (!HEX.test(f.text_color)) e.text_color = "Use a hex colour like #FFFFFF.";
  if (!/^\d+$/.test(f.sort_order)) e.sort_order = "Enter a whole number, 0 or more.";
  if (!f.starts_at) e.starts_at = "Choose when the banner starts.";
  if (f.ends_at && f.starts_at && Date.parse(fromLocalInput(f.ends_at)) <= Date.parse(fromLocalInput(f.starts_at))) e.ends_at = "The end must be after the start.";
  return e;
}

/* ------------------------------------------------------------------------------------------------
 * Collection (promotion) form
 * ---------------------------------------------------------------------------------------------- */

type PromoForm = { title: string; description: string; promo_type: NonNullable<PromotionInput["promo_type"]>; product_ids: string[]; category_id: string; discount_percent: string; starts_at: string; ends_at: string; is_active: boolean; sort_order: string };
type PKey = keyof PromoForm;
const blankPromo = (): PromoForm => ({ title: "", description: "", promo_type: "collection", product_ids: [], category_id: "", discount_percent: "", starts_at: toLocalInput(new Date().toISOString()), ends_at: "", is_active: true, sort_order: "0" });
const fromPromo = (p: PromotionRow): PromoForm => ({ title: p.title, description: p.description ?? "", promo_type: (PROMO_TYPE_OPTIONS.some((o) => o.value === p.promo_type) ? p.promo_type : "collection") as PromoForm["promo_type"], product_ids: p.product_ids, category_id: p.category_id ?? "", discount_percent: p.discount_percent != null ? String(p.discount_percent) : "", starts_at: toLocalInput(p.starts_at), ends_at: toLocalInput(p.ends_at), is_active: p.is_active, sort_order: String(p.sort_order) });
function validatePromo(f: PromoForm): Errors<PKey> {
  const e: Errors<PKey> = {};
  const t = f.title.trim().length;
  if (t < 2 || t > 120) e.title = "Enter a title of 2–120 characters.";
  if (f.product_ids.length > 200) e.product_ids = "A collection can hold up to 200 products.";
  if (f.discount_percent.trim()) { const d = Number(f.discount_percent); if (!Number.isFinite(d) || d < 0 || d > 100) e.discount_percent = "Enter 0–100, or leave blank."; }
  if (!/^\d+$/.test(f.sort_order)) e.sort_order = "Enter a whole number, 0 or more.";
  if (!f.starts_at) e.starts_at = "Choose when the collection starts.";
  if (f.ends_at && f.starts_at && Date.parse(fromLocalInput(f.ends_at)) <= Date.parse(fromLocalInput(f.starts_at))) e.ends_at = "The end must be after the start.";
  return e;
}

/* ------------------------------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------------------------------- */

export function PromotionsWorkspace({ banners, promotions, cities, categories, productNames, nowIso }: { banners: BannerRow[]; promotions: PromotionRow[]; cities: CityRow[]; categories: CategoryLike[]; productNames: Record<string, string>; nowIso: string }) {
  const router = useRouter();
  const now = Date.parse(nowIso);
  const [saving, setSaving] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const [banner, setBanner] = React.useState<{ id: string | null; initial: BannerForm; form: BannerForm } | null>(null);
  const [bErrors, setBErrors] = React.useState<Errors<BKey>>({});
  const [promo, setPromo] = React.useState<{ id: string | null; initial: PromoForm; form: PromoForm } | null>(null);
  const [pErrors, setPErrors] = React.useState<Errors<PKey>>({});
  const [del, setDel] = React.useState<{ kind: "banner" | "promotion"; id: string; title: string } | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const openBanner = (id: string | null, form: BannerForm) => { setBanner({ id, initial: form, form }); setBErrors({}); setServerError(null); };
  const openPromo = (id: string | null, form: PromoForm) => { setPromo({ id, initial: form, form }); setPErrors({}); setServerError(null); };
  const setB = <K extends BKey>(k: K, v: BannerForm[K]) => { setBanner((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e)); if (bErrors[k]) setBErrors((x) => ({ ...x, [k]: undefined })); };
  const setP = <K extends PKey>(k: K, v: PromoForm[K]) => { setPromo((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e)); if (pErrors[k]) setPErrors((x) => ({ ...x, [k]: undefined })); };

  const saveBanner = async () => {
    if (!banner) return;
    const f = banner.form; const e = validateBanner(f); setBErrors(e); setServerError(null);
    if (hasErrors(e)) return;
    setSaving(true);
    const r = await saveBannerAction(banner.id, { title: f.title.trim(), subtitle: f.subtitle.trim() || null, cta_label: f.cta_label.trim() || null, link_url: f.link_url.trim() || null, image_url: f.image_url, bg_color: f.bg_color, text_color: f.text_color, placement: f.placement, sort_order: Number(f.sort_order), starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at) || null, is_active: f.is_active, city_id: f.city_id || null });
    setSaving(false);
    if (r.ok) { toast.success(banner.id ? "Banner saved" : "Banner created"); setBanner(null); router.refresh(); } else { setServerError(r.error); toast.error("Couldn't save the banner", r.error); }
  };
  const savePromo = async () => {
    if (!promo) return;
    const f = promo.form; const e = validatePromo(f); setPErrors(e); setServerError(null);
    if (hasErrors(e)) return;
    setSaving(true);
    const r = await savePromotionAction(promo.id, { title: f.title.trim(), description: f.description.trim() || null, promo_type: f.promo_type, product_ids: f.product_ids, category_id: f.category_id || null, discount_percent: f.discount_percent.trim() ? Number(f.discount_percent) : null, starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at) || null, is_active: f.is_active, sort_order: Number(f.sort_order) });
    setSaving(false);
    if (r.ok) { toast.success(promo.id ? "Collection saved" : "Collection created"); setPromo(null); router.refresh(); } else { setServerError(r.error); toast.error("Couldn't save the collection", r.error); }
  };
  const remove = async () => {
    if (!del) return;
    setDeleting(true);
    const r = del.kind === "banner" ? await deleteBannerAction(del.id) : await deletePromotionAction(del.id);
    setDeleting(false);
    if (r.ok) { toast.success(del.kind === "banner" ? "Banner deleted" : "Collection deleted"); setDel(null); router.refresh(); } else toast.error("Couldn't delete", r.error);
  };

  const placementLabel = (v: string) => BANNER_PLACEMENT_OPTIONS.find((o) => o.value === v)?.label ?? v;
  const bf = banner?.form; const pf = promo?.form;

  return (
    <>
      <AdminPageHeader title="Promotions" description="Banners on the customer site and curated collections. Each shows by its own schedule."
        actions={<>
          <button type="button" className={btn.secondary} onClick={() => openPromo(null, blankPromo())}><Plus className="h-4 w-4" aria-hidden />New collection</button>
          <button type="button" className={btn.primary} onClick={() => openBanner(null, blankBanner())}><Plus className="h-4 w-4" aria-hidden />New banner</button>
        </>} />

      <Panel title="Banners" description={`${banners.length} ${banners.length === 1 ? "banner" : "banners"} · shown by placement, sort order and schedule`} flush>
        <DataTable caption="Banners" className={tableCls} maxHeight={null} rows={banners} rowKey={(b) => b.id}
          empty={<EmptyBlock icon={ImageIcon} title="No banners yet" description="The home hero shows its default until you add a banner." action={<button type="button" className={btn.primary} onClick={() => openBanner(null, blankBanner())}><Plus className="h-4 w-4" aria-hidden />New banner</button>} />}
          columns={[
            { key: "banner", header: "Banner", render: (b) => (
              <span className="flex min-w-0 items-center gap-3">
                <span className="relative hidden h-10 w-16 shrink-0 overflow-hidden rounded-md ring-1 ring-line sm:block" style={{ backgroundColor: b.bg_color ?? "#329537" }} aria-hidden>
                  {b.image_url ? <RawImg src={b.image_url} className="absolute inset-0 h-full w-full object-cover opacity-80" /> : null}
                </span>
                <span className="min-w-0 max-w-[260px]">
                  <button type="button" onClick={() => openBanner(b.id, fromBanner(b))} className="block truncate text-left font-medium text-ink hover:text-brand-700 hover:underline">{b.title}</button>
                  <span className="block truncate text-xs text-ink-3">{b.subtitle || b.link_url || "No subtitle"}</span>
                </span>
              </span>
            ) },
            { key: "status", header: "Status", render: (b) => { const s = liveState(b, now); return <span className="flex flex-col items-start gap-0.5"><StatusPill tone={s.tone}>{s.label}</StatusPill><span className="hidden text-[11px] text-ink-4 sm:block">{s.detail}</span></span>; } },
            { key: "placement", header: "Placement", hideBelow: "md", render: (b) => <CellStack primary={placementLabel(b.placement)} secondary={`Position ${b.sort_order}${b.city_id ? ` · ${cities.find((c) => c.id === b.city_id)?.name ?? "One city"}` : " · All cities"}`} /> },
            { key: "schedule", header: "Schedule", hideBelow: "lg", render: (b) => <span className="whitespace-nowrap text-xs text-ink-3">{schedule(b)}</span> },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (b) => (
              <span className="inline-flex items-center gap-0.5">
                <IconAction label={`Edit banner ${b.title}`} onClick={() => openBanner(b.id, fromBanner(b))}><Pencil className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
                <IconAction label={`Delete banner ${b.title}`} tone="danger" onClick={() => setDel({ kind: "banner", id: b.id, title: b.title })}><Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
              </span>
            ) },
          ]} />
      </Panel>

      <Panel className="mt-4" title="Collections and campaigns" description={`${promotions.length} ${promotions.length === 1 ? "collection" : "collections"} · curated product groups on the customer site`} flush>
        <DataTable caption="Collections" className={tableCls} maxHeight={null} rows={promotions} rowKey={(p) => p.id}
          empty={<EmptyBlock icon={Megaphone} title="No collections yet" description="Group products into a collection, flash sale or BOGO campaign." action={<button type="button" className={btn.primary} onClick={() => openPromo(null, blankPromo())}><Plus className="h-4 w-4" aria-hidden />New collection</button>} />}
          columns={[
            { key: "title", header: "Collection", render: (p) => (
              <span className="block min-w-0 max-w-[300px]">
                <button type="button" onClick={() => openPromo(p.id, fromPromo(p))} className="block truncate text-left font-medium text-ink hover:text-brand-700 hover:underline">{p.title}</button>
                <span className="block truncate text-xs text-ink-3">{PROMO_TYPE_OPTIONS.find((o) => o.value === p.promo_type)?.label ?? p.promo_type}{p.discount_percent ? ` · ${p.discount_percent}% off (display)` : ""}</span>
              </span>
            ) },
            { key: "status", header: "Status", render: (p) => { const s = liveState(p, now); return <span className="flex flex-col items-start gap-0.5"><StatusPill tone={s.tone}>{s.label}</StatusPill><span className="hidden text-[11px] text-ink-4 sm:block">{s.detail}</span></span>; } },
            { key: "products", header: "Products", hideBelow: "md", render: (p) => <CellStack primary={`${p.product_ids.length} ${p.product_ids.length === 1 ? "product" : "products"}${p.category_id ? ` · ${categories.find((c) => c.id === p.category_id)?.name ?? "category"}` : ""}`} secondary={p.product_ids.length ? `${p.product_ids.slice(0, 4).map((id) => productNames[id] ?? "Unknown product").join(", ")}${p.product_ids.length > 4 ? "…" : ""}` : undefined} /> },
            { key: "schedule", header: "Schedule", hideBelow: "lg", render: (p) => <span className="whitespace-nowrap text-xs text-ink-3">{schedule(p)}<span className="block text-ink-4">Position {p.sort_order}</span></span> },
            { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (p) => (
              <span className="inline-flex items-center gap-0.5">
                <IconAction label={`Edit collection ${p.title}`} onClick={() => openPromo(p.id, fromPromo(p))}><Pencil className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
                <IconAction label={`Delete collection ${p.title}`} tone="danger" onClick={() => setDel({ kind: "promotion", id: p.id, title: p.title })}><Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
              </span>
            ) },
          ]} />
      </Panel>

      <FormPanel open={Boolean(banner)} title={banner?.id ? "Edit banner" : "New banner"} description="Shown on the customer site for its placement and schedule." width="lg"
        dirty={Boolean(banner && JSON.stringify(banner.form) !== JSON.stringify(banner.initial))} saving={saving} error={serverError} onClose={() => setBanner(null)} onSubmit={saveBanner} submitLabel={banner?.id ? "Save banner" : "Create banner"}>
        {bf ? (
          <>
            <div className="relative flex h-28 items-end overflow-hidden rounded-xl p-3" style={{ backgroundColor: HEX.test(bf.bg_color) ? bf.bg_color : "#329537", color: HEX.test(bf.text_color) ? bf.text_color : "#fff" }} aria-label="Banner preview">
              {bf.image_url ? <RawImg src={bf.image_url} className="absolute inset-0 h-full w-full object-cover opacity-70" /> : null}
              <div className="relative"><p className="font-display text-base font-bold leading-tight">{bf.title || "Banner title"}</p>{bf.subtitle ? <p className="text-xs opacity-90">{bf.subtitle}</p> : null}{bf.cta_label ? <span className="mt-1 inline-block rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-ink">{bf.cta_label}</span> : null}</div>
            </div>
            <FieldGroup title="Content">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Title" required value={bf.title} error={bErrors.title} onChange={(e) => setB("title", e.target.value)} maxLength={120} />
                <Input label="Subtitle" value={bf.subtitle} onChange={(e) => setB("subtitle", e.target.value)} />
                <Input label="Button label" value={bf.cta_label} onChange={(e) => setB("cta_label", e.target.value)} placeholder="Shop now" />
                <Input label="Link" value={bf.link_url} error={bErrors.link_url} onChange={(e) => setB("link_url", e.target.value)} placeholder="/c/grocery or https://…" />
              </div>
              <div><p className="mb-1.5 text-sm font-medium text-ink-2">Image (optional)</p><ImageUpload bucket="banners" folder="admin" value={bf.image_url} onChange={(url) => setB("image_url", url)} aspect="wide" /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ColorField id="banner-bg" label="Background colour" value={bf.bg_color} error={bErrors.bg_color} onChange={(v) => setB("bg_color", v)} />
                <ColorField id="banner-fg" label="Text colour" value={bf.text_color} error={bErrors.text_color} onChange={(v) => setB("text_color", v)} />
              </div>
            </FieldGroup>
            <FieldGroup title="Where and when">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Placement" options={BANNER_PLACEMENT_OPTIONS} value={bf.placement} onChange={(e) => setB("placement", e.target.value as BannerForm["placement"])} />
                <Input label="Position" type="number" inputMode="numeric" min={0} step={1} value={bf.sort_order} error={bErrors.sort_order} onChange={(e) => setB("sort_order", e.target.value)} hint="Lower numbers show first" />
                <Select label="City" placeholder="All cities" options={cities.map((c) => ({ value: c.id, label: c.name }))} value={bf.city_id} onChange={(e) => setB("city_id", e.target.value)} />
                <span className="hidden sm:block" />
                <Input label="Starts" required type="datetime-local" value={bf.starts_at} error={bErrors.starts_at} onChange={(e) => setB("starts_at", e.target.value)} />
                <Input label="Ends" type="datetime-local" value={bf.ends_at} error={bErrors.ends_at} onChange={(e) => setB("ends_at", e.target.value)} hint="Leave blank for no end" />
              </div>
              <Switch checked={bf.is_active} onChange={(v) => setB("is_active", v)} label={bf.is_active ? "Active: shows within the schedule" : "Inactive: hidden from customers"} />
            </FieldGroup>
          </>
        ) : null}
      </FormPanel>

      <FormPanel open={Boolean(promo)} title={promo?.id ? "Edit collection" : "New collection"} description="A curated group of products shown on the customer site." width="lg"
        dirty={Boolean(promo && JSON.stringify(promo.form) !== JSON.stringify(promo.initial))} saving={saving} error={serverError} onClose={() => setPromo(null)} onSubmit={savePromo} submitLabel={promo?.id ? "Save collection" : "Create collection"}>
        {pf ? (
          <>
            <FieldGroup title="Details">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Title" required value={pf.title} error={pErrors.title} onChange={(e) => setP("title", e.target.value)} maxLength={120} />
                <Select label="Type" options={PROMO_TYPE_OPTIONS} value={pf.promo_type} onChange={(e) => setP("promo_type", e.target.value as PromoForm["promo_type"])} />
              </div>
              <Textarea label="Description (optional)" value={pf.description} onChange={(e) => setP("description", e.target.value)} className="min-h-16" />
            </FieldGroup>
            <FieldGroup title="Products">
              <ProductIdsInput id="promo-products" value={pf.product_ids} names={productNames} error={pErrors.product_ids} onChange={(v) => setP("product_ids", v)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Category" placeholder="None" options={categoryOptions(categories)} hint="Where the collection's tile sends customers." value={pf.category_id} onChange={(e) => setP("category_id", e.target.value)} />
                <Input label="Discount shown (%)" type="number" inputMode="decimal" min={0} max={100} placeholder="None" value={pf.discount_percent} error={pErrors.discount_percent} onChange={(e) => setP("discount_percent", e.target.value)} hint="Display only; prices come from each store" />
              </div>
            </FieldGroup>
            <FieldGroup title="Schedule">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Starts" required type="datetime-local" value={pf.starts_at} error={pErrors.starts_at} onChange={(e) => setP("starts_at", e.target.value)} />
                <Input label="Ends" type="datetime-local" value={pf.ends_at} error={pErrors.ends_at} onChange={(e) => setP("ends_at", e.target.value)} hint="Leave blank for no end" />
                <Input label="Position" type="number" inputMode="numeric" min={0} step={1} value={pf.sort_order} error={pErrors.sort_order} onChange={(e) => setP("sort_order", e.target.value)} hint="Lower numbers show first" />
              </div>
              <Switch checked={pf.is_active} onChange={(v) => setP("is_active", v)} label={pf.is_active ? "Active: shows within the schedule" : "Inactive: hidden from customers"} />
            </FieldGroup>
          </>
        ) : null}
      </FormPanel>

      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} tone="danger" loading={deleting} onConfirm={remove}
        title={del?.kind === "banner" ? "Delete this banner?" : "Delete this collection?"} confirmLabel={del?.kind === "banner" ? "Delete banner" : "Delete collection"}
        description={<><strong className="text-ink">{del?.title}</strong> is removed from the customer site immediately. This can&apos;t be undone; switch it to inactive if you may need it again.</>} />
    </>
  );
}

function ColorField({ id, label, value, error, onChange }: { id: string; label: string; value: string; error?: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="flex gap-2">
        <input type="color" aria-label={`${label} picker`} value={HEX.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-11 w-14 shrink-0 rounded-lg border border-line-2 bg-card p-1" />
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="h-11 w-full min-w-0 rounded-lg border border-line-2 bg-card px-3 font-mono text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger" />
      </div>
    </Field>
  );
}

/** Product id chips: paste or type ids (comma, space or Enter separated). Unknown formats are refused inline. */
function ProductIdsInput({ id, value, names, error, onChange }: { id: string; value: string[]; names: Record<string, string>; error?: string; onChange: (v: string[]) => void }) {
  const [text, setText] = React.useState("");
  const [bad, setBad] = React.useState<string | null>(null);
  const add = (raw: string) => {
    const parts = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const invalid = parts.filter((p) => !UUID.test(p));
    const next = [...value]; for (const p of parts) if (UUID.test(p) && !next.includes(p.toLowerCase())) next.push(p.toLowerCase());
    onChange(next); setText(invalid.join(" "));
    setBad(invalid.length ? `${invalid.length === 1 ? "This isn't" : "These aren't"} a product id: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}` : null);
  };
  return (
    <Field label="Product ids" htmlFor={id} error={error ?? bad} hint="Copy the id from a product page address (/admin/products/<id>). Separate several with commas or Enter.">
      <div className="rounded-lg border border-line-2 bg-card p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        {value.length ? (
          <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Selected products">
            {value.map((pid) => (
              <li key={pid} className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-1 text-xs text-ink-2">
                <span className="truncate" title={pid}>{names[pid] ?? `Product ${pid.slice(0, 8)}`}</span>
                <button type="button" onClick={() => onChange(value.filter((x) => x !== pid))} aria-label={`Remove ${names[pid] ?? pid}`} className="flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:bg-line hover:text-ink"><X className="h-3 w-3" aria-hidden /></button>
              </li>
            ))}
          </ul>
        ) : null}
        <input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste product ids"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(text); } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1)); }}
          onBlur={() => text.trim() && add(text)} onPaste={(e) => { e.preventDefault(); add(text + " " + e.clipboardData.getData("text")); }}
          className="h-8 w-full bg-transparent px-1 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-ink-4" />
      </div>
      <p className="mt-1 text-xs text-ink-4">{value.length} of 200 selected</p>
    </Field>
  );
}
