"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Plus, Trash2, QrCode } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Switch, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RawImg } from "@/components/admin/raw-img";
import { toast } from "@/components/ui/toast";
import { updateSettingsBulkAction } from "@/lib/actions/admin";
import type { Setting } from "@/types/app";
import type { Json } from "@/types/database";
import { cn, formatDateTime } from "@/lib/utils";

type Kind = "number" | "boolean" | "string" | "json";
const kindOf = (v: Json): Kind => (typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : typeof v === "string" ? "string" : "json");

/**
 * Typed editor for `settings` rows: number/boolean/string inputs, JSON textarea for objects/arrays,
 * and a dedicated key/value + QR preview editor for `qr_links`. Saves only dirty keys.
 */
export function SettingsEditor({ settings, title, description }: { settings: Setting[]; title?: string; description?: string }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Record<string, Json>>(() => Object.fromEntries(settings.map((s) => [s.key, s.value])));
  const [jsonText, setJsonText] = React.useState<Record<string, string>>(() => Object.fromEntries(settings.filter((s) => kindOf(s.value) === "json").map((s) => [s.key, JSON.stringify(s.value, null, 2)])));
  const [busy, setBusy] = React.useState(false);
  const [prevSettings, setPrevSettings] = React.useState(settings);
  if (settings !== prevSettings) { setPrevSettings(settings); setDraft(Object.fromEntries(settings.map((s) => [s.key, s.value]))); setJsonText(Object.fromEntries(settings.filter((s) => kindOf(s.value) === "json").map((s) => [s.key, JSON.stringify(s.value, null, 2)]))); }

  const dirty = settings.filter((s) => JSON.stringify(draft[s.key]) !== JSON.stringify(s.value));
  const save = async () => {
    const entries: { key: string; value: Json }[] = [];
    for (const s of dirty) {
      let v = draft[s.key];
      if (kindOf(s.value) === "json" && s.key !== "qr_links") { try { v = JSON.parse(jsonText[s.key] ?? ""); } catch { toast.error(`${s.label}: invalid JSON`); return; } }
      if (kindOf(s.value) === "number" && (typeof v !== "number" || Number.isNaN(v))) { toast.error(`${s.label}: enter a number`); return; }
      entries.push({ key: s.key, value: v });
    }
    setBusy(true); const r = await updateSettingsBulkAction(entries); setBusy(false);
    if (r.ok) { toast.success(`Saved ${r.data.updated} setting${r.data.updated === 1 ? "" : "s"}`); router.refresh(); } else toast.error(r.error);
  };

  return (
    <div className="rounded-lg border border-line bg-card">
      {(title || description) ? <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div><h3 className="text-base font-semibold text-ink">{title}</h3>{description ? <p className="text-sm text-ink-3">{description}</p> : null}</div></div> : null}
      <ul className="divide-y divide-line">
        {settings.map((s) => {
          const kind = kindOf(s.value); const v = draft[s.key]; const changed = JSON.stringify(v) !== JSON.stringify(s.value);
          return (
            <li key={s.key} className={cn("grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start", changed && "bg-saffron-50/40")}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{s.label} {s.is_public ? <Badge tone="neutral" size="xs" className="ml-1">public</Badge> : null}{changed ? <Badge tone="saffron" size="xs" className="ml-1">unsaved</Badge> : null}</p>
                <p className="font-mono text-[11px] text-ink-4">{s.key}</p>
                {s.description ? <p className="mt-0.5 text-xs text-ink-3">{s.description}</p> : null}
                <p className="mt-0.5 text-[11px] text-ink-4">Updated {formatDateTime(s.updated_at)}</p>
              </div>
              <div>
                {kind === "boolean" ? <Switch checked={Boolean(v)} onChange={(b) => setDraft((d) => ({ ...d, [s.key]: b }))} label={v ? "Enabled" : "Disabled"} /> : null}
                {kind === "number" ? <Input type="number" step="any" inputMode="decimal" aria-label={s.label} value={typeof v === "number" ? v : ""} onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value === "" ? Number.NaN : Number(e.target.value) }))} /> : null}
                {kind === "string" ? <Input aria-label={s.label} value={String(v ?? "")} onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))} /> : null}
                {kind === "json" && s.key === "qr_links" ? <QrLinksEditor value={(v as Record<string, string>) ?? {}} onChange={(m) => setDraft((d) => ({ ...d, [s.key]: m }))} /> : null}
                {kind === "json" && s.key !== "qr_links" ? <Textarea aria-label={s.label} className="font-mono text-xs" value={jsonText[s.key] ?? ""} onChange={(e) => { setJsonText((t) => ({ ...t, [s.key]: e.target.value })); try { const parsed = JSON.parse(e.target.value); setDraft((d) => ({ ...d, [s.key]: parsed })); } catch { setDraft((d) => ({ ...d, [s.key]: `__invalid__${e.target.value}` })); } }} /> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <p className="text-xs text-ink-3">{dirty.length ? `${dirty.length} unsaved change${dirty.length === 1 ? "" : "s"}` : "No changes"}</p>
        <Button size="sm" disabled={!dirty.length} loading={busy} onClick={save}><Save className="h-4 w-4" /> Save changes</Button>
      </div>
    </div>
  );
}

function QrLinksEditor({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const entries = Object.entries(value);
  const [newSlug, setNewSlug] = React.useState("");
  const setEntry = (slug: string, path: string) => onChange({ ...value, [slug]: path });
  const rename = (from: string, to: string) => { const next: Record<string, string> = {}; for (const [k, p] of entries) next[k === from ? to : k] = p; onChange(next); };
  const remove = (slug: string) => { const next = { ...value }; delete next[slug]; onChange(next); };
  return (
    <div className="space-y-2">
      {entries.map(([slug, path]) => (
        <div key={slug} className="flex items-start gap-2 rounded-md border border-line bg-surface p-2">
          <a href={`/api/qr?path=${encodeURIComponent(`/r/${slug}`)}&format=png&size=1024`} download={`qr-${slug}.png`} title="Download QR (PNG)" className="shrink-0"><RawImg src={`/api/qr?path=${encodeURIComponent(`/r/${slug}`)}&size=160`} alt={`QR for /r/${slug}`} width={56} height={56} className="rounded-sm bg-white" /></a>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1 text-xs text-ink-3"><span>/r/</span><input aria-label="Slug" value={slug} onChange={(e) => rename(slug, e.target.value.replace(/[^a-z0-9-]/gi, "").toLowerCase())} className="h-8 min-w-0 flex-1 rounded-xs border border-line-2 bg-card px-2 font-mono text-xs text-ink" /></div>
            <input aria-label="Destination path" value={path} onChange={(e) => setEntry(slug, e.target.value)} placeholder="/c/grocery?coupon=WELCOME50" className={cn("h-8 w-full rounded-xs border bg-card px-2 font-mono text-xs text-ink", path.startsWith("/") ? "border-line-2" : "border-danger")} />
          </div>
          <IconButton label={`Remove ${slug}`} className="h-8 w-8 text-danger" onClick={() => remove(slug)}><Trash2 className="h-4 w-4" /></IconButton>
        </div>
      ))}
      <div className="flex gap-2">
        <input aria-label="New slug" value={newSlug} onChange={(e) => setNewSlug(e.target.value.replace(/[^a-z0-9-]/gi, "").toLowerCase())} placeholder="new-slug" className="h-9 flex-1 rounded-sm border border-line-2 bg-card px-2 font-mono text-xs text-ink" />
        <Button size="sm" variant="outline" disabled={!newSlug || newSlug in value} onClick={() => { setEntry(newSlug, "/start"); setNewSlug(""); }}><Plus className="h-4 w-4" /> Add link</Button>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-ink-4"><QrCode className="h-3 w-3" /> Printed QR codes point at /r/&lt;slug&gt;; change the destination here without reprinting.</p>
    </div>
  );
}
