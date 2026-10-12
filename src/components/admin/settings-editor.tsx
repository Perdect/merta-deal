"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, QrCode, Trash2 } from "lucide-react";
import { FormSection, FormActions, IconAction, StatusPill, useUnsavedChanges } from "@/components/admin/kit";
import { toast } from "@/components/ui/toast";
import { RawImg } from "@/components/admin/raw-img";
import { btn } from "@/components/admin/care/shared";
import { updateSettingsBulkAction } from "@/lib/actions/admin";
import type { Setting } from "@/types/app";
import type { Json } from "@/types/database";
import { cn, formatDateTime } from "@/lib/utils";

/* ================================================================================================
 * Typed editor for `settings` rows. Numbers, switches and text get their own inputs, JSON lists and
 * objects a validated text area, and `qr_links` a slug → path editor with QR previews. Only changed
 * keys are sent, through updateSettingsBulkAction (which re-checks types and audits each change).
 * ============================================================================================== */

type Kind = "number" | "boolean" | "string" | "json" | "qr";
const kindOf = (s: Setting): Kind => (s.key === "qr_links" ? "qr" : typeof s.value === "number" ? "number" : typeof s.value === "boolean" ? "boolean" : typeof s.value === "string" ? "string" : "json");
type QrRow = { id: number; slug: string; path: string };
type Draft = string | boolean | QrRow[];

const qrRows = (v: Json): QrRow[] => Object.entries((v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, string>).map(([slug, path], i) => ({ id: i, slug, path: String(path) }));
const qrRecord = (rows: QrRow[]) => Object.fromEntries(rows.map((r) => [r.slug, r.path]));

function initialDraft(s: Setting): Draft {
  switch (kindOf(s)) {
    case "number": return String(s.value);
    case "boolean": return Boolean(s.value);
    case "string": return String(s.value ?? "");
    case "qr": return qrRows(s.value);
    default: return JSON.stringify(s.value, null, 2);
  }
}

const isPercent = (s: Setting) => s.key.endsWith("_percent") || s.label.includes("(%)");

/** Parsed value plus an error message; `value` is undefined when invalid. */
function evaluate(s: Setting, d: Draft): { value?: Json; error?: string } {
  switch (kindOf(s)) {
    case "number": {
      const t = String(d).trim(); const n = Number(t);
      if (!t || !Number.isFinite(n)) return { error: "Enter a number." };
      if (n < 0) return { error: "This can't be negative." };
      if (isPercent(s) && n > 100) return { error: "Enter a percentage from 0 to 100." };
      return { value: n };
    }
    case "boolean": return { value: Boolean(d) };
    case "string": {
      const t = String(d);
      if (s.key === "brand_name" && !t.trim()) return { error: "The brand name can't be empty." };
      if (s.key.includes("email") && t.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.trim())) return { error: "Enter a valid email address." };
      return { value: t };
    }
    case "qr": {
      const rows = d as QrRow[]; const seen = new Set<string>();
      for (const r of rows) {
        if (!r.slug) return { error: "Every link needs a slug." };
        if (seen.has(r.slug)) return { error: `The slug “${r.slug}” is used twice.` };
        seen.add(r.slug);
        if (!r.path.startsWith("/")) return { error: `The destination for /r/${r.slug} must start with /.` };
      }
      return { value: qrRecord(rows) };
    }
    default: {
      try {
        const v = JSON.parse(String(d)) as Json;
        const was = Array.isArray(s.value) ? "array" : s.value === null ? "null" : typeof s.value;
        const now = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
        if (was !== now) return { error: was === "array" ? "This must stay a list, like [\"09:00-11:00\"]." : was === "object" ? "This must stay an object, like {\"key\": \"value\"}." : `This must be a ${was}.` };
        return { value: v };
      } catch (e) { return { error: `Not valid JSON: ${(e as Error).message}` }; }
    }
  }
}
const same = (a: Json | undefined, b: Json) => JSON.stringify(a) === JSON.stringify(b);

function useSettingsDraft(settings: Setting[]) {
  const router = useRouter();
  const build = React.useCallback(() => Object.fromEntries(settings.map((s) => [s.key, initialDraft(s)])) as Record<string, Draft>, [settings]);
  const [draft, setDraft] = React.useState<Record<string, Draft>>(build);
  const [prev, setPrev] = React.useState(settings);
  if (prev !== settings) { setPrev(settings); setDraft(build()); }
  const [saving, setSaving] = React.useState(false);

  const evals = Object.fromEntries(settings.map((s) => [s.key, evaluate(s, draft[s.key])]));
  const dirtyKeys = settings.filter((s) => { const e = evals[s.key]; return e.error ? true : !same(e.value, s.value); }).map((s) => s.key);
  const errorKeys = dirtyKeys.filter((k) => evals[k].error);
  const dirty = dirtyKeys.length > 0;
  const confirmDiscard = useUnsavedChanges(dirty);

  const set = (key: string, v: Draft) => setDraft((d) => ({ ...d, [key]: v }));
  const reset = () => setDraft(build());
  const cancel = () => { if (dirty && confirmDiscard()) reset(); };
  const save = async () => {
    if (!dirty || saving) return;
    if (errorKeys.length) {
      const first = settings.find((s) => s.key === errorKeys[0]);
      toast.error(`Fix ${errorKeys.length === 1 ? "1 setting" : `${errorKeys.length} settings`} before saving`, first ? `${first.label}: ${evals[first.key].error}` : undefined);
      document.getElementById(`setting-${errorKeys[0]}`)?.focus();
      return;
    }
    setSaving(true);
    const r = await updateSettingsBulkAction(dirtyKeys.map((k) => ({ key: k, value: evals[k].value as Json })));
    setSaving(false);
    if (r.ok) { toast.success(`Saved ${r.data.updated} ${r.data.updated === 1 ? "setting" : "settings"}`, "Changes apply from the next cart calculation."); router.refresh(); }
    else toast.error("Settings not saved", `${r.error}. Changes above that setting were saved; fix it and save again.`);
  };
  return { draft, set, evals, dirtyKeys, dirty, saving, save, cancel };
}

type DraftApi = ReturnType<typeof useSettingsDraft>;

function SettingRows({ settings, api }: { settings: Setting[]; api: DraftApi }) {
  return (
    <ul className="divide-y divide-line">
      {settings.map((s) => <SettingRow key={s.key} s={s} api={api} />)}
    </ul>
  );
}

const fieldCls = "h-10 w-full rounded-lg border border-line-2 bg-card px-3 text-sm text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger-50";

function SettingRow({ s, api }: { s: Setting; api: DraftApi }) {
  const kind = kindOf(s); const d = api.draft[s.key]; const ev = api.evals[s.key];
  const changed = api.dirtyKeys.includes(s.key);
  const id = `setting-${s.key}`; const errId = `${id}-error`; const descId = `${id}-desc`;
  const aria = { "aria-invalid": Boolean(ev.error) || undefined, "aria-describedby": [s.description ? descId : null, ev.error ? errId : null].filter(Boolean).join(" ") || undefined };
  return (
    <li className={cn("-mx-4 grid gap-2 px-4 py-3.5 sm:-mx-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-start sm:gap-6 sm:px-5", changed && "bg-warning-50/50")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {kind === "boolean" ? <span id={`${id}-label`} className="text-sm font-medium text-ink">{s.label}</span> : <label htmlFor={id} className="text-sm font-medium text-ink">{s.label}</label>}
          {s.is_public ? <StatusPill tone="neutral">Shown to customers</StatusPill> : null}
          {changed ? <StatusPill tone={ev.error ? "red" : "amber"}>{ev.error ? "Needs a fix" : "Unsaved"}</StatusPill> : null}
        </div>
        {s.description ? <p id={descId} className="mt-0.5 text-xs text-ink-3">{s.description}</p> : null}
        <p className="mt-0.5 text-[11px] text-ink-4"><span className="font-mono">{s.key}</span> · updated {formatDateTime(s.updated_at)}</p>
      </div>
      <div className="min-w-0">
        {kind === "boolean" ? (
          <button id={id} type="button" role="switch" aria-checked={Boolean(d)} aria-labelledby={`${id}-label`} onClick={() => api.set(s.key, !d)} className="group inline-flex items-center gap-2.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            <span className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150", d ? "bg-brand-600" : "bg-line-2")}><span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 motion-reduce:transition-none", d ? "translate-x-[22px]" : "translate-x-0.5")} /></span>
            <span className="text-sm font-medium text-ink-2">{d ? "On" : "Off"}</span>
          </button>
        ) : null}
        {kind === "number" ? <input id={id} type="number" step="any" min={0} max={isPercent(s) ? 100 : undefined} inputMode="decimal" value={String(d)} onChange={(e) => api.set(s.key, e.target.value)} className={cn(fieldCls, "sm:max-w-[200px]")} {...aria} /> : null}
        {kind === "string" ? <input id={id} type={s.key.includes("email") ? "email" : "text"} value={String(d)} onChange={(e) => api.set(s.key, e.target.value)} className={fieldCls} {...aria} /> : null}
        {kind === "json" ? <textarea id={id} value={String(d)} onChange={(e) => api.set(s.key, e.target.value)} spellCheck={false} className={cn(fieldCls, "h-auto min-h-28 py-2 font-mono text-xs")} {...aria} /> : null}
        {kind === "qr" ? <QrLinksEditor id={id} rows={d as QrRow[]} onChange={(rows) => api.set(s.key, rows)} /> : null}
        {ev.error && changed ? <p id={errId} role="alert" className="mt-1.5 text-xs font-medium text-danger">{ev.error}</p> : null}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Settings page: every group as a labelled section, one Save / Cancel bar for all of them.
 * ---------------------------------------------------------------------------------------------- */

export type SettingsGroup = { id: string; title: string; description?: string; settings: Setting[] };

export function SettingsForm({ groups, aside }: { groups: SettingsGroup[]; aside?: React.ReactNode }) {
  const all = React.useMemo(() => groups.flatMap((g) => g.settings), [groups]);
  const api = useSettingsDraft(all);
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void api.save(); }}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {groups.map((g) => {
            const n = g.settings.filter((s) => api.dirtyKeys.includes(s.key)).length;
            return (
              <FormSection key={g.id} title={n ? `${g.title} · ${n} unsaved` : g.title} description={g.description}>
                <SettingRows settings={g.settings} api={api} />
              </FormSection>
            );
          })}
        </div>
        {aside ? <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">{aside}</aside> : null}
      </div>
      <FormActions dirty={api.dirty} saving={api.saving} onCancel={api.cancel} disabled={!api.dirty}
        submitLabel={api.dirtyKeys.length > 1 ? `Save ${api.dirtyKeys.length} changes` : "Save changes"} />
    </form>
  );
}

/** One group on its own card with inline Save / Cancel (used outside the settings page, e.g. Delivery). */
export function SettingsEditor({ settings, title, description }: { settings: Setting[]; title?: string; description?: string }) {
  const api = useSettingsDraft(settings);
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void api.save(); }} className="rounded-[14px] border border-line bg-card shadow-[0_1px_2px_rgb(23_32_28/0.04)]">
      {title || description ? <div className="px-4 pt-4 sm:px-5">{title ? <h2 className="text-[15px] font-semibold text-ink">{title}</h2> : null}{description ? <p className="mt-0.5 text-xs text-ink-3">{description}</p> : null}</div> : null}
      <div className="px-4 py-1 sm:px-5"><SettingRows settings={settings} api={api} /></div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
        <p className="mr-auto text-xs text-ink-3" role="status">{api.saving ? "Saving…" : api.dirty ? <span className="font-medium text-[#8a6300]">{api.dirtyKeys.length} unsaved {api.dirtyKeys.length === 1 ? "change" : "changes"}</span> : "All changes saved"}</p>
        {api.dirty ? <button type="button" className={btn.secondary} disabled={api.saving} onClick={api.cancel}>Cancel</button> : null}
        <button type="submit" className={btn.primary} disabled={!api.dirty || api.saving}>{api.saving ? "Saving…" : "Save changes"}</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------------------------------------
 * QR short links
 * ---------------------------------------------------------------------------------------------- */

function QrLinksEditor({ id, rows, onChange }: { id: string; rows: QrRow[]; onChange: (rows: QrRow[]) => void }) {
  const [newSlug, setNewSlug] = React.useState("");
  const clean = (v: string) => v.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  const update = (rid: number, patch: Partial<QrRow>) => onChange(rows.map((r) => (r.id === rid ? { ...r, ...patch } : r)));
  const taken = rows.some((r) => r.slug === newSlug);
  const add = () => { if (!newSlug || taken) return; onChange([...rows, { id: Math.max(-1, ...rows.map((r) => r.id)) + 1, slug: newSlug, path: "/start" }]); setNewSlug(""); };
  const smallField = "h-8 min-w-0 rounded-md border bg-card px-2 font-mono text-xs text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
  return (
    <div className="space-y-2" id={id} tabIndex={-1}>
      {rows.length === 0 ? <p className="rounded-lg border border-dashed border-line-2 px-3 py-4 text-center text-xs text-ink-3">No short links yet. Add one below.</p> : null}
      {rows.map((r) => {
        const qr = `/api/qr?path=${encodeURIComponent(`/r/${r.slug}`)}`;
        const dup = rows.filter((x) => x.slug === r.slug).length > 1;
        return (
          <div key={r.id} className="flex items-start gap-2 rounded-lg border border-line bg-surface p-2">
            {r.slug ? <RawImg src={`${qr}&size=160`} alt={`QR code for /r/${r.slug}`} width={52} height={52} className="shrink-0 rounded-md bg-white" /> : <span className="h-[52px] w-[52px] shrink-0 rounded-md bg-surface-2" aria-hidden />}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1 text-xs text-ink-3"><span aria-hidden>/r/</span>
                <input aria-label="Short link slug" value={r.slug} onChange={(e) => update(r.id, { slug: clean(e.target.value) })} aria-invalid={!r.slug || dup || undefined} className={cn(smallField, "flex-1", !r.slug || dup ? "border-danger" : "border-line-2")} />
              </div>
              <input aria-label={`Destination for /r/${r.slug}`} value={r.path} onChange={(e) => update(r.id, { path: e.target.value })} placeholder="/c/grocery?coupon=WELCOME50" aria-invalid={!r.path.startsWith("/") || undefined} className={cn(smallField, "w-full", r.path.startsWith("/") ? "border-line-2" : "border-danger")} />
            </div>
            <div className="flex shrink-0 flex-col">
              {r.slug ? <a href={`${qr}&format=png&size=1024`} download={`qr-${r.slug}.png`} aria-label={`Download QR for /r/${r.slug}`} title="Download QR (PNG)" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><Download className="h-4 w-4" strokeWidth={1.9} aria-hidden /></a> : null}
              <IconAction label={`Remove /r/${r.slug || "link"}`} tone="danger" onClick={() => onChange(rows.filter((x) => x.id !== r.id))}><Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden /></IconAction>
            </div>
          </div>
        );
      })}
      <div className="flex gap-2">
        <input aria-label="New short link slug" value={newSlug} onChange={(e) => setNewSlug(clean(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="new-slug" className={cn(smallField, "h-9 flex-1 border-line-2")} />
        <button type="button" className={cn(btn.secondary, "h-9")} disabled={!newSlug || taken} onClick={add}><Plus className="h-4 w-4" aria-hidden />Add link</button>
      </div>
      {taken ? <p className="text-xs text-danger">That slug already exists.</p> : null}
      <p className="flex items-center gap-1 text-[11px] text-ink-4"><QrCode className="h-3 w-3" aria-hidden />Printed QR codes point at /r/&lt;slug&gt;. Change the destination here without reprinting; renaming a slug breaks codes already printed.</p>
    </div>
  );
}
