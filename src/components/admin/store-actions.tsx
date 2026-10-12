"use client";
import * as React from "react";
import { Archive, Ban, CheckCircle2, ExternalLink, FileText, Pencil, RotateCcw, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Switch } from "@/components/ui/input";
import { EmptyBlock, FormActions, FormSection, SidePanel, StatusText, useUnsavedChanges } from "@/components/admin/kit";
import { ConfirmChange, FieldGroup, PanelFormFooter, useRunAction } from "@/components/admin/ops/shared";
import { DOC_LABEL } from "@/components/admin/ops/pills";
import { setStoreStatusAction, setStoreCommissionAction, updateStoreAdminAction, reviewStoreDocumentAction } from "@/lib/actions/admin";
import type { Store } from "@/types/app";
import type { Enums } from "@/types/database";
import type { StoreDocument, StoreCommission } from "@/lib/data/admin";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

type StoreStatus = Enums<"store_status">;
type Transition = { to: StoreStatus; label: string; icon: LucideIcon; variant: "primary" | "outline" | "danger-outline" };

/** Only the transitions that make sense from the current status are offered. */
const TRANSITIONS: Record<StoreStatus, Transition[]> = {
  pending: [{ to: "active", label: "Approve", icon: CheckCircle2, variant: "primary" }, { to: "closed", label: "Reject", icon: XCircle, variant: "danger-outline" }],
  active: [{ to: "suspended", label: "Suspend", icon: Ban, variant: "danger-outline" }, { to: "pending", label: "Move to review", icon: RotateCcw, variant: "outline" }, { to: "closed", label: "Close store", icon: Archive, variant: "danger-outline" }],
  suspended: [{ to: "active", label: "Reinstate", icon: CheckCircle2, variant: "primary" }, { to: "closed", label: "Close store", icon: Archive, variant: "danger-outline" }],
  closed: [{ to: "active", label: "Reactivate", icon: CheckCircle2, variant: "primary" }, { to: "pending", label: "Move to review", icon: RotateCcw, variant: "outline" }],
};

function copyFor(from: StoreStatus, to: StoreStatus, name: string) {
  switch (to) {
    case "active": return { title: from === "pending" ? `Approve ${name}?` : `Make ${name} active again?`, body: "The store becomes visible to customers and can receive orders straight away. The owner is notified in the app.", ok: from === "pending" ? "Approve store" : from === "suspended" ? "Reinstate store" : "Reactivate store", ack: from === "pending" ? "Store approved" : "Store is active again" };
    case "suspended": return { title: `Suspend ${name}?`, body: "Suspended stores disappear from the customer site and cannot receive new orders. Orders already placed carry on. The owner is notified with your reason.", ok: "Suspend store", ack: "Store suspended" };
    case "closed": return { title: from === "pending" ? `Reject ${name}'s application?` : `Close ${name}?`, body: from === "pending" ? "The application is closed and the store stays hidden from customers. The owner is notified." : "Closed stores are hidden from customers and cannot receive orders until reactivated. The owner is notified.", ok: from === "pending" ? "Reject application" : "Close store", ack: from === "pending" ? "Application rejected" : "Store closed" };
    case "pending": return { title: `Move ${name} back to review?`, body: "Only active stores are shown to customers, so the store is hidden while it is under review. The owner is notified.", ok: "Move to review", ack: "Store moved to review" };
  }
}

/** Status buttons for a store: approve / reject / suspend / reinstate / close — each confirmed. */
export function StoreStatusActions({ store, pendingDocs = 0, size = "sm", className }: { store: Pick<Store, "id" | "name" | "status">; pendingDocs?: number; size?: "xs" | "sm"; className?: string }) {
  const { busy, run } = useRunAction();
  const [target, setTarget] = React.useState<StoreStatus | null>(null);
  const copy = target ? copyFor(store.status, target, store.name) : null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {TRANSITIONS[store.status].map((t) => (
        <Button key={t.to} size={size} variant={t.variant === "danger-outline" ? "outline" : t.variant} className={t.variant === "danger-outline" ? "text-danger hover:bg-danger-50" : undefined} onClick={() => setTarget(t.to)}>
          <t.icon className="h-4 w-4" aria-hidden />{t.label}
        </Button>
      ))}
      <ConfirmChange open={Boolean(target)} onClose={() => setTarget(null)} title={copy?.title ?? ""} description={copy?.body} confirmLabel={copy?.ok ?? "Confirm"}
        tone={target === "suspended" || target === "closed" ? "danger" : "primary"} loading={busy === "status"}
        warning={target === "active" && pendingDocs > 0 ? `${pendingDocs} ${pendingDocs === 1 ? "document is" : "documents are"} still waiting for review.` : undefined}
        note={target === "suspended" ? { label: "Reason sent to the owner", placeholder: "e.g. FSSAI licence expired — upload a renewed copy.", required: true } : undefined}
        onConfirm={async (note) => { if (!target) return; const r = await run("status", () => setStoreStatusAction(store.id, target, note || undefined), copy!.ack, "The owner has been notified."); if (r.ok) setTarget(null); }} />
    </div>
  );
}

/** Featured + accepting-orders switches. Pausing orders is confirmed. */
export function StoreQuickToggles({ store }: { store: Pick<Store, "id" | "name" | "status" | "is_open" | "is_featured"> }) {
  const { busy, run } = useRunAction();
  const [confirmClose, setConfirmClose] = React.useState(false);
  const setOpen = (v: boolean) => run("open", () => updateStoreAdminAction(store.id, { is_open: v }), v ? "Store is accepting orders" : "Store paused for orders");
  return (
    <div className="divide-y divide-line">
      <div className="flex items-start justify-between gap-4 pb-3">
        <div className="min-w-0"><p className="text-sm font-medium text-ink">Accepting orders</p><p className="text-xs text-ink-3">{store.is_open ? "Open — customers can order now." : "Paused — customers can browse but not order."}{store.status !== "active" ? " Only active stores are shown to customers." : ""}</p></div>
        <Switch checked={store.is_open} disabled={busy === "open"} label={store.is_open ? "Open" : "Paused"} onChange={(v) => (v ? setOpen(true) : setConfirmClose(true))} />
      </div>
      <div className="flex items-start justify-between gap-4 pt-3">
        <div className="min-w-0"><p className="text-sm font-medium text-ink">Featured store</p><p className="text-xs text-ink-3">Featured stores are promoted on the customer home page.</p></div>
        <Switch checked={store.is_featured} disabled={busy === "featured"} label={store.is_featured ? "Featured" : "Not featured"} onChange={(v) => run("featured", () => updateStoreAdminAction(store.id, { is_featured: v }), v ? "Marked as featured" : "Removed from featured")} />
      </div>
      <ConfirmChange open={confirmClose} onClose={() => setConfirmClose(false)} title={`Pause orders for ${store.name}?`} tone="danger" confirmLabel="Pause orders" loading={busy === "open"}
        description="Customers won't be able to place new orders with this store until it is opened again (by you or the store). Orders already placed carry on."
        onConfirm={async () => { const r = await setOpen(false); if (r.ok) setConfirmClose(false); }} />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Commission
 * ---------------------------------------------------------------------------------------------- */

export function StoreCommission({ storeId, storeName, rate, defaultCommission, history }: { storeId: string; storeName: string; rate: number | null; defaultCommission: number | null; history: StoreCommission[] }) {
  const { busy, run } = useRunAction();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"default" | "custom">(rate == null ? "default" : "custom");
  const [value, setValue] = React.useState(rate != null ? String(rate) : "");
  const [note, setNote] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const dirty = open && (mode !== (rate == null ? "default" : "custom") || (mode === "custom" && Number(value) !== Number(rate)) || note.trim() !== "");
  const confirmDiscard = useUnsavedChanges(dirty);
  const reset = () => { setMode(rate == null ? "default" : "custom"); setValue(rate != null ? String(rate) : ""); setNote(""); setSubmitted(false); };
  const close = () => { if (!confirmDiscard()) return; setOpen(false); reset(); };
  const n = Number(value);
  const error = mode === "custom" ? (value.trim() === "" ? "Enter a rate, or choose the platform default." : !Number.isFinite(n) || n < 0 || n > 100 ? "Enter a rate between 0 and 100." : undefined) : undefined;
  const next = mode === "default" ? null : n;
  const label = (r: number | null) => (r == null ? (defaultCommission != null ? `platform default (${defaultCommission}%)` : "platform default") : `${r}%`);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl font-bold tabular text-ink">{rate != null ? `${rate}%` : defaultCommission != null ? `${defaultCommission}%` : "Default"}</p>
          <p className="text-xs text-ink-3">{rate != null ? "Custom rate for this store" : "Platform default rate (Settings › Business)"}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { reset(); setOpen(true); }}><Pencil className="h-4 w-4" aria-hidden />Edit</Button>
      </div>
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold text-ink-3">History</p>
        {history.length ? (
          <ul className="divide-y divide-line text-sm">
            {history.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0"><span className="font-medium tabular text-ink">{c.rate}%</span><span className="text-ink-3"> from {formatDate(c.effective_from)}</span>{c.note ? <span className="block truncate text-xs text-ink-3">{c.note}</span> : null}</span>
                <span className="shrink-0 text-xs text-ink-4">Set {formatDate(c.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-ink-3">No custom rate has been set for this store.</p>}
      </div>

      <SidePanel open={open} onClose={close} title="Edit commission" description={storeName} width="sm"
        footer={<PanelFormFooter formId="commission-form" dirty={dirty} saving={busy === "rate"} onCancel={close} submitLabel="Review change" />}>
        <form id="commission-form" noValidate onSubmit={(e) => { e.preventDefault(); setSubmitted(true); if (!error) setConfirming(true); }} className="space-y-4">
          <FieldGroup title="Rate" description="Commission is taken from each order's item value when the order is placed.">
            <label className="flex items-start gap-2.5 text-sm"><input type="radio" name="mode" className="mt-0.5 h-4 w-4 accent-brand-600" checked={mode === "default"} onChange={() => setMode("default")} /><span><span className="font-medium text-ink">Use the platform default</span><span className="block text-xs text-ink-3">{defaultCommission != null ? `Currently ${defaultCommission}%.` : "Set under Settings › Business."} Follows future changes to the default.</span></span></label>
            <label className="flex items-start gap-2.5 text-sm"><input type="radio" name="mode" className="mt-0.5 h-4 w-4 accent-brand-600" checked={mode === "custom"} onChange={() => setMode("custom")} /><span className="font-medium text-ink">Custom rate for this store</span></label>
            {mode === "custom" ? (
              <Input label="Rate (%)" type="number" min={0} max={100} step="0.01" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} error={submitted ? error : undefined} required />
            ) : null}
          </FieldGroup>
          <FieldGroup title="Note">
            <Input label="Reason for the change (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Festival promo rate agreed with owner" hint="Saved in the commission history for custom rates." />
          </FieldGroup>
        </form>
      </SidePanel>

      <ConfirmChange open={confirming} onClose={() => setConfirming(false)} title="Change commission?" confirmLabel="Save commission" loading={busy === "rate"}
        description={<>Change {storeName}&apos;s commission from <strong>{label(rate)}</strong> to <strong>{label(next)}</strong>. Applies to orders placed from now on; existing orders keep the commission already recorded.</>}
        onConfirm={async () => { const r = await run("rate", () => setStoreCommissionAction(storeId, next, note.trim() || undefined), "Commission updated"); if (r.ok) { setConfirming(false); setOpen(false); setNote(""); setSubmitted(false); } }} />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Documents
 * ---------------------------------------------------------------------------------------------- */

export function StoreDocuments({ docs, urls }: { docs: StoreDocument[]; urls: Record<string, string | null> }) {
  const { busy, run } = useRunAction();
  const [reject, setReject] = React.useState<StoreDocument | null>(null);
  if (!docs.length) return <EmptyBlock icon={FileText} title="No documents uploaded yet" description="Ask the owner to upload GST, PAN, FSSAI and bank proof from the store portal (Store profile › Verification documents)." />;
  return (
    <>
      <ul className="divide-y divide-line border-t border-line">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
            <FileText className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">{DOC_LABEL[d.doc_type] ?? d.doc_type}<StatusText value={d.status} label={d.status === "pending" ? "Awaiting review" : undefined} /></p>
              <p className="text-xs text-ink-3">Uploaded {formatDateTime(d.created_at)}{d.review_note ? ` · Note: ${d.review_note}` : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {urls[d.id] ? <a href={urls[d.id]!} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-2 px-2.5 text-xs font-semibold text-ink-2 hover:bg-surface-2"><ExternalLink className="h-3.5 w-3.5" aria-hidden />Open file</a> : <span className="text-xs text-ink-4">File unavailable</span>}
              {d.status !== "verified" ? <Button size="xs" loading={busy === `v:${d.id}`} onClick={() => run(`v:${d.id}`, () => reviewStoreDocumentAction(d.id, "verified"), "Document verified")}>Verify</Button> : null}
              {d.status !== "rejected" ? <Button size="xs" variant="outline" className="text-danger hover:bg-danger-50" onClick={() => setReject(d)}>Reject</Button> : null}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmChange open={Boolean(reject)} onClose={() => setReject(null)} tone="danger" title={`Reject ${reject ? DOC_LABEL[reject.doc_type] ?? reject.doc_type : "document"}?`} confirmLabel="Reject document" loading={Boolean(reject && busy === `r:${reject.id}`)}
        description="The store sees your reason and can upload a new copy."
        note={{ label: "Reason shown to the store", placeholder: "e.g. Image is blurry — please re-upload a clear scan.", required: true }}
        onConfirm={async (note) => { if (!reject) return; const r = await run(`r:${reject.id}`, () => reviewStoreDocumentAction(reject.id, "rejected", note), "Document rejected"); if (r.ok) setReject(null); }} />
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Delivery & listing settings (long form: FormSection + FormActions + unsaved-changes guard)
 * ---------------------------------------------------------------------------------------------- */

type SettingsForm = { radius: string; zone: string; prep: string; minOrder: string };

function validateSettings(f: SettingsForm) {
  const e: Partial<Record<keyof SettingsForm, string>> = {};
  const r = Number(f.radius); if (f.radius.trim() === "" || !Number.isFinite(r) || r < 0.5 || r > 50) e.radius = "Delivery radius must be between 0.5 and 50 km.";
  const p = Number(f.prep); if (f.prep.trim() === "" || !Number.isInteger(p) || p < 1 || p > 240) e.prep = "Prep time must be a whole number from 1 to 240 minutes.";
  if (f.minOrder.trim() !== "") { const m = Number(f.minOrder); if (!Number.isFinite(m) || m < 0) e.minOrder = "Minimum order can't be negative. Leave blank to use the zone's minimum."; }
  return e;
}

export function StoreSettingsForm({ store, zones }: { store: Pick<Store, "id" | "delivery_radius_km" | "zone_id" | "avg_prep_minutes" | "min_order_amount">; zones: { id: string; name: string; area: string }[] }) {
  const { busy, run } = useRunAction();
  const initial = React.useMemo<SettingsForm>(() => ({ radius: String(store.delivery_radius_km), zone: store.zone_id ?? "", prep: String(store.avg_prep_minutes), minOrder: store.min_order_amount != null ? String(store.min_order_amount) : "" }), [store]);
  const [f, setF] = React.useState(initial);
  const [submitted, setSubmitted] = React.useState(false);
  const dirty = (Object.keys(f) as (keyof SettingsForm)[]).some((k) => f[k] !== initial[k]);
  const confirmDiscard = useUnsavedChanges(dirty);
  const errors = submitted ? validateSettings(f) : {};
  const set = (k: keyof SettingsForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitted(true);
    if (Object.keys(validateSettings(f)).length) return;
    const r = await run("settings", () => updateStoreAdminAction(store.id, { delivery_radius_km: Number(f.radius), zone_id: f.zone || null, avg_prep_minutes: Number(f.prep), min_order_amount: f.minOrder.trim() === "" ? null : Number(f.minOrder) }), "Delivery settings saved");
    if (r.ok) setSubmitted(false);
  };

  return (
    <form onSubmit={submit} noValidate className="mt-4">
      <FormSection title="Delivery & listing settings" description="How far this store delivers, which zone it belongs to, and its usual preparation time.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Delivery radius (km)" type="number" min={0.5} max={50} step="0.5" inputMode="decimal" value={f.radius} onChange={set("radius")} error={errors.radius} required />
          <Select label="Delivery zone" placeholder="No zone" options={zones.map((z) => ({ value: z.id, label: `${z.name} — ${z.area}` }))} value={f.zone} onChange={set("zone")} hint="Zone sets fees and minimums for customers." />
          <Input label="Average prep time (min)" type="number" min={1} max={240} step="1" inputMode="numeric" value={f.prep} onChange={set("prep")} error={errors.prep} required />
          <Input label="Minimum order (₹)" type="number" min={0} step="1" inputMode="decimal" placeholder="Zone default" value={f.minOrder} onChange={set("minOrder")} error={errors.minOrder} hint="Blank uses the zone's minimum." />
        </div>
      </FormSection>
      <FormActions dirty={dirty} saving={busy === "settings"} onCancel={dirty ? () => { if (confirmDiscard()) { setF(initial); setSubmitted(false); } } : undefined} cancelLabel="Discard changes" disabled={!dirty} />
    </form>
  );
}
