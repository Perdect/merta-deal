"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, MapPinOff, Crosshair } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select, Switch, Textarea } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { saveZoneAction, deleteZoneAction, setCityActiveAction, type ZoneInput } from "@/lib/actions/admin";
import type { CityRow } from "@/lib/data/admin";
import type { DeliveryZone } from "@/types/app";
import { isMapsConfigured } from "@/lib/env";
import { site } from "@/config/site";
import { formatINR } from "@/lib/utils";

export function CitiesManager({ cities }: { cities: CityRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<CityRow | null>(null);
  const [text, setText] = React.useState("");
  const toggle = async (c: CityRow, v: boolean) => { setBusy(c.id); const r = await setCityActiveAction(c.id, v, c.launch_note); setBusy(null); if (r.ok) { toast.success(v ? `${c.name} is live` : `${c.name} paused`); router.refresh(); } else toast.error(r.error); };
  const saveNote = async () => { if (!note) return; setBusy(note.id); const r = await setCityActiveAction(note.id, note.is_active, text); setBusy(null); if (r.ok) { toast.success("Launch note saved"); setNote(null); router.refresh(); } else toast.error(r.error); };
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-card px-4">
      {cities.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">{c.name}, {c.state} {c.is_active ? <Badge tone="success" size="xs">live</Badge> : <Badge tone="neutral" size="xs">{c.launch_note || "not launched"}</Badge>}</p><p className="text-xs tabular text-ink-3">{c.center_lat.toFixed(4)}, {c.center_lng.toFixed(4)} · /{c.slug}</p></div>
          <Button size="xs" variant="ghost" onClick={() => { setNote(c); setText(c.launch_note ?? ""); }}>Launch note</Button>
          <Switch checked={c.is_active} disabled={busy === c.id} onChange={(v) => toggle(c, v)} label={c.is_active ? "Active" : "Inactive"} />
        </li>
      ))}
      <Modal open={Boolean(note)} onClose={() => setNote(null)} title={`Launch note — ${note?.name}`} size="sm" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setNote(null)}>Cancel</Button><Button fullWidth loading={Boolean(busy)} onClick={saveNote}>Save</Button></div>}>
        <Textarea label="Shown to customers outside live cities" value={text} onChange={(e) => setText(e.target.value)} placeholder="Launching soon" />
      </Modal>
    </ul>
  );
}

const emptyZone = (city_id: string): ZoneInput => ({ city_id, name: "", area: "", pincode: site.defaultPincode, center_lat: site.center.lat, center_lng: site.center.lng, radius_km: 3, delivery_fee: 25, min_order_amount: 99, free_delivery_threshold: 499, eta_min_minutes: 30, eta_max_minutes: 60, express_supported: true, is_active: true });

export function ZoneManager({ zones, cities }: { zones: DeliveryZone[]; cities: CityRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ id: string | null; form: ZoneInput } | null>(null);
  const [del, setDel] = React.useState<DeliveryZone | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? "—";
  const set = <K extends keyof ZoneInput>(k: K, v: ZoneInput[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  const num = (k: keyof ZoneInput) => (v: string) => set(k, (v === "" ? "" : Number(v)) as never);
  const openEdit = (z: DeliveryZone) => setEditing({ id: z.id, form: { city_id: z.city_id, name: z.name, area: z.area, pincode: z.pincode, center_lat: z.center_lat, center_lng: z.center_lng, radius_km: z.radius_km, delivery_fee: z.delivery_fee, min_order_amount: z.min_order_amount, free_delivery_threshold: z.free_delivery_threshold, eta_min_minutes: z.eta_min_minutes, eta_max_minutes: z.eta_max_minutes, express_supported: z.express_supported, is_active: z.is_active } });
  const save = async () => { if (!editing) return; setBusy(true); const r = await saveZoneAction(editing.id, editing.form); setBusy(false); if (r.ok) { toast.success(editing.id ? "Zone saved" : "Zone created"); setEditing(null); router.refresh(); } else toast.error(r.error); };
  const remove = async () => { if (!del) return; setBusy(true); const r = await deleteZoneAction(del.id); setBusy(false); if (r.ok) { toast.success("Zone deleted"); setDel(null); router.refresh(); } else toast.error(r.error); };
  const useCityCenter = () => { const c = cities.find((x) => x.id === editing?.form.city_id); if (c) { set("center_lat", c.center_lat); set("center_lng", c.center_lng); } };
  const useMyLocation = () => { if (!navigator.geolocation) return toast.error("Geolocation unavailable in this browser"); navigator.geolocation.getCurrentPosition((p) => { set("center_lat", Number(p.coords.latitude.toFixed(6))); set("center_lng", Number(p.coords.longitude.toFixed(6))); toast.success("Centre set to your current location"); }, () => toast.error("Could not read your location")); };
  const f = editing?.form;

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => setEditing({ id: null, form: emptyZone(cities.find((c) => c.is_active)?.id ?? cities[0]?.id ?? "") })}><Plus className="h-4 w-4" /> New zone</Button></div>
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-3 font-semibold">Zone</th><th className="px-4 py-3 font-semibold">Pincode</th><th className="px-4 py-3 font-semibold text-right">Radius</th><th className="px-4 py-3 font-semibold text-right">Fee</th><th className="px-4 py-3 font-semibold text-right">Min / Free above</th><th className="px-4 py-3 font-semibold">ETA</th><th className="px-4 py-3 font-semibold">Flags</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-line">
            {zones.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-3">No delivery zones yet. Customers outside a zone see “not serviceable”.</td></tr> : zones.map((z) => (
              <tr key={z.id}>
                <td className="px-4 py-3"><p className="font-semibold text-ink">{z.name}</p><p className="text-xs text-ink-3">{z.area} · {cityName(z.city_id)}</p></td>
                <td className="px-4 py-3 tabular">{z.pincode}</td>
                <td className="px-4 py-3 text-right tabular">{z.radius_km} km</td>
                <td className="px-4 py-3 text-right tabular">{formatINR(z.delivery_fee)}</td>
                <td className="px-4 py-3 text-right tabular">{formatINR(z.min_order_amount)} / {formatINR(z.free_delivery_threshold)}</td>
                <td className="px-4 py-3 tabular">{z.eta_min_minutes}–{z.eta_max_minutes} min</td>
                <td className="px-4 py-3"><span className="flex gap-1">{z.is_active ? <Badge tone="success" size="xs">active</Badge> : <Badge tone="neutral" size="xs">inactive</Badge>}{z.express_supported ? <Badge tone="saffron" size="xs">express</Badge> : null}</span></td>
                <td className="px-4 py-3"><span className="flex justify-end gap-0.5"><IconButton label="Edit" className="h-8 w-8" onClick={() => openEdit(z)}><Pencil className="h-4 w-4" /></IconButton><IconButton label="Delete" className="h-8 w-8 text-danger" onClick={() => setDel(z)}><Trash2 className="h-4 w-4" /></IconButton></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? "Edit zone" : "New delivery zone"} size="lg" footer={<div className="flex gap-2"><Button variant="outline" fullWidth onClick={() => setEditing(null)}>Cancel</Button><Button fullWidth loading={busy} onClick={save}>{editing?.id ? "Save" : "Create"}</Button></div>}>
        {f ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="City" options={cities.map((c) => ({ value: c.id, label: c.name }))} value={f.city_id} onChange={(e) => set("city_id", e.target.value)} />
            <Input label="Zone name" required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Merta Central" />
            <div className="sm:col-span-2"><Input label="Areas covered" required value={f.area} onChange={(e) => set("area", e.target.value)} placeholder="Sadar Bazaar, Gandhi Chowk, Ghanti Ghar" /></div>
            <Input label="Pincode" required inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} />
            <Input label="Radius (km)" type="number" step="0.5" min={0.5} value={f.radius_km as number} onChange={(e) => num("radius_km")(e.target.value)} />
            <div className="sm:col-span-2 rounded-md border border-dashed border-line-2 bg-surface p-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Centre latitude" type="number" step="0.000001" value={f.center_lat as number} onChange={(e) => num("center_lat")(e.target.value)} />
                <Input label="Centre longitude" type="number" step="0.000001" value={f.center_lng as number} onChange={(e) => num("center_lng")(e.target.value)} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                <Button size="xs" variant="outline" onClick={useCityCenter}><Crosshair className="h-3.5 w-3.5" /> Use city centre</Button>
                <Button size="xs" variant="outline" onClick={useMyLocation}><Crosshair className="h-3.5 w-3.5" /> Use my location</Button>
                <a className="font-semibold text-brand-700" href={`https://www.google.com/maps/@${f.center_lat},${f.center_lng},15z`} target="_blank" rel="noreferrer">Open in Google Maps</a>
                {!isMapsConfigured() ? <span className="inline-flex items-center gap-1"><MapPinOff className="h-3 w-3" /> Map picker needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; paste coordinates from Google Maps (right-click → copy).</span> : null}
              </div>
            </div>
            <Input label="Delivery fee (₹)" type="number" min={0} value={f.delivery_fee as number} onChange={(e) => num("delivery_fee")(e.target.value)} />
            <Input label="Minimum order (₹)" type="number" min={0} value={f.min_order_amount as number} onChange={(e) => num("min_order_amount")(e.target.value)} />
            <Input label="Free delivery above (₹)" type="number" min={0} value={f.free_delivery_threshold as number} onChange={(e) => num("free_delivery_threshold")(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="ETA min" type="number" min={5} value={f.eta_min_minutes as number} onChange={(e) => num("eta_min_minutes")(e.target.value)} />
              <Input label="ETA max" type="number" min={5} value={f.eta_max_minutes as number} onChange={(e) => num("eta_max_minutes")(e.target.value)} />
            </div>
            <Switch checked={Boolean(f.express_supported)} onChange={(v) => set("express_supported", v)} label="Express delivery supported" />
            <Switch checked={Boolean(f.is_active)} onChange={(v) => set("is_active", v)} label="Zone active" />
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog open={Boolean(del)} onClose={() => setDel(null)} tone="danger" title={`Delete zone “${del?.name}”?`} description="Addresses and stores mapped to this zone lose serviceability. Prefer deactivating." confirmLabel="Delete" loading={busy} onConfirm={remove} />
    </div>
  );
}
