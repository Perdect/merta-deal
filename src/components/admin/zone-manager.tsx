"use client";
import * as React from "react";
import { Crosshair, MapPinned, MapPinOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Switch, Textarea } from "@/components/ui/input";
import { DataTable, EmptyBlock, IconAction, Panel, SidePanel, StatusPill, CellStack, rupees, useUnsavedChanges } from "@/components/admin/kit";
import { ConfirmChange, FieldGroup, FormErrorSummary, PanelFormFooter, useRunAction } from "@/components/admin/ops/shared";
import { toast } from "@/components/ui/toast";
import { saveZoneAction, deleteZoneAction, setCityActiveAction } from "@/lib/actions/admin";
import type { CityRow } from "@/lib/data/admin";
import type { DeliveryZone } from "@/types/app";
import { isMapsConfigured } from "@/lib/env";
import { site } from "@/config/site";

/* ------------------------------------------------------------------------------------------------
 * Cities
 * ---------------------------------------------------------------------------------------------- */

export function CitiesManager({ cities }: { cities: CityRow[] }) {
  const { busy, run } = useRunAction();
  const [toggle, setToggle] = React.useState<CityRow | null>(null);
  const [noteCity, setNoteCity] = React.useState<CityRow | null>(null);
  const [text, setText] = React.useState("");
  const dirty = Boolean(noteCity) && text.trim() !== (noteCity?.launch_note ?? "");
  const confirmDiscard = useUnsavedChanges(dirty);
  const closeNote = () => { if (confirmDiscard()) setNoteCity(null); };

  if (!cities.length) return <EmptyBlock icon={MapPinned} title="No cities set up" description="Cities are added with a database migration. Once a city exists you can take it live here." />;
  return (
    <>
      <ul className="divide-y divide-line border-t border-line">
        {cities.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">{c.name}, {c.state}<StatusPill tone={c.is_active ? "green" : "neutral"}>{c.is_active ? "Live" : "Not live"}</StatusPill></p>
              <p className="truncate text-xs text-ink-3">{c.is_active ? "Accepting orders" : c.launch_note ? `Customers see: “${c.launch_note}”` : "No launch note"} · <span className="tabular">{c.center_lat.toFixed(4)}, {c.center_lng.toFixed(4)}</span></p>
            </div>
            <Button size="xs" variant="ghost" onClick={() => { setNoteCity(c); setText(c.launch_note ?? ""); }}><Pencil className="h-3.5 w-3.5" aria-hidden />Launch note</Button>
            <Switch checked={c.is_active} disabled={busy === c.id} onChange={() => setToggle(c)} label={c.is_active ? "Live" : "Off"} />
          </li>
        ))}
      </ul>

      <ConfirmChange open={Boolean(toggle)} onClose={() => setToggle(null)} loading={Boolean(toggle && busy === toggle.id)} tone={toggle?.is_active ? "danger" : "primary"}
        title={toggle ? (toggle.is_active ? `Pause ${toggle.name}?` : `Take ${toggle.name} live?`) : ""}
        confirmLabel={toggle?.is_active ? "Pause city" : "Go live"}
        description={toggle?.is_active ? "Customers in this city can no longer place orders and see the launch note instead. Orders already placed carry on." : "Customers in this city can start ordering in its delivery zones."}
        warning={toggle && !toggle.is_active ? "Make sure the city has at least one active delivery zone first." : undefined}
        onConfirm={async () => { if (!toggle) return; const r = await run(toggle.id, () => setCityActiveAction(toggle.id, !toggle.is_active, toggle.launch_note), toggle.is_active ? `${toggle.name} paused` : `${toggle.name} is live`); if (r.ok) setToggle(null); }} />

      <SidePanel open={Boolean(noteCity)} onClose={closeNote} title="Launch note" description={noteCity ? `${noteCity.name}, ${noteCity.state}` : undefined} width="sm"
        footer={<PanelFormFooter formId="launch-note" dirty={dirty} saving={Boolean(noteCity && busy === `note:${noteCity.id}`)} onCancel={closeNote} submitLabel="Save note" />}>
        <form id="launch-note" onSubmit={async (e) => { e.preventDefault(); if (!noteCity) return; const r = await run(`note:${noteCity.id}`, () => setCityActiveAction(noteCity.id, noteCity.is_active, text.trim() || null), "Launch note saved"); if (r.ok) setNoteCity(null); }}>
          <Textarea label="Message shown to customers while the city isn't live" value={text} onChange={(e) => setText(e.target.value)} placeholder="Launching soon" maxLength={200} hint="Leave blank to show no note. Saving doesn't change whether the city is live." />
        </form>
      </SidePanel>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Zones
 * ---------------------------------------------------------------------------------------------- */

export type ZoneDefaults = { delivery_fee: number | null; min_order_amount: number | null; free_delivery_threshold: number | null; eta_min_minutes: number | null; eta_max_minutes: number | null };

type ZoneForm = { city_id: string; name: string; area: string; pincode: string; center_lat: string; center_lng: string; radius_km: string; delivery_fee: string; min_order_amount: string; free_delivery_threshold: string; eta_min_minutes: string; eta_max_minutes: string; express_supported: boolean; is_active: boolean };
type ZoneErrors = Partial<Record<keyof ZoneForm, string>>;

const str = (v: number | null | undefined) => (v == null ? "" : String(v));
const fromZone = (z: DeliveryZone): ZoneForm => ({ city_id: z.city_id, name: z.name, area: z.area, pincode: z.pincode, center_lat: str(z.center_lat), center_lng: str(z.center_lng), radius_km: str(z.radius_km), delivery_fee: str(z.delivery_fee), min_order_amount: str(z.min_order_amount), free_delivery_threshold: str(z.free_delivery_threshold), eta_min_minutes: str(z.eta_min_minutes), eta_max_minutes: str(z.eta_max_minutes), express_supported: z.express_supported, is_active: z.is_active });

function validateZone(f: ZoneForm): ZoneErrors {
  const e: ZoneErrors = {};
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  if (!f.city_id) e.city_id = "Choose the city this zone belongs to.";
  if (f.name.trim().length < 2 || f.name.trim().length > 80) e.name = "Zone name must be 2–80 characters.";
  if (f.area.trim().length < 2 || f.area.trim().length > 200) e.area = "List the areas covered (2–200 characters).";
  if (!/^[1-9][0-9]{5}$/.test(f.pincode)) e.pincode = "Enter a 6-digit pincode (it can't start with 0).";
  const lat = num(f.center_lat); if (!Number.isFinite(lat) || lat < -90 || lat > 90) e.center_lat = "Latitude must be between -90 and 90.";
  const lng = num(f.center_lng); if (!Number.isFinite(lng) || lng < -180 || lng > 180) e.center_lng = "Longitude must be between -180 and 180.";
  const r = num(f.radius_km); if (!Number.isFinite(r) || r < 0.5 || r > 50) e.radius_km = "Radius must be between 0.5 and 50 km.";
  for (const [k, label] of [["delivery_fee", "Delivery fee"], ["min_order_amount", "Minimum order"], ["free_delivery_threshold", "Free delivery threshold"]] as const) {
    const v = num(f[k]); if (!Number.isFinite(v) || v < 0) e[k] = `${label} is required and can't be negative.`;
  }
  const a = num(f.eta_min_minutes); const b = num(f.eta_max_minutes);
  if (!Number.isInteger(a) || a < 5 || a > 240) e.eta_min_minutes = "Fastest ETA must be a whole number from 5 to 240 minutes.";
  if (!Number.isInteger(b) || b < 5 || b > 360) e.eta_max_minutes = "Slowest ETA must be a whole number from 5 to 360 minutes.";
  else if (!e.eta_min_minutes && b < a) e.eta_max_minutes = "Slowest ETA must be the same as or later than the fastest ETA.";
  return e;
}

export function ZoneManager({ zones, cities, defaults }: { zones: DeliveryZone[]; cities: CityRow[]; defaults: ZoneDefaults }) {
  const { busy, run } = useRunAction();
  const [editing, setEditing] = React.useState<{ id: string | null; initial: ZoneForm; form: ZoneForm } | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [del, setDel] = React.useState<DeliveryZone | null>(null);
  const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? "—";
  const f = editing?.form;
  const dirty = Boolean(editing) && JSON.stringify(editing!.form) !== JSON.stringify(editing!.initial);
  const confirmDiscard = useUnsavedChanges(dirty);
  const errors = f && submitted ? validateZone(f) : {};

  const set = <K extends keyof ZoneForm>(k: K, v: ZoneForm[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  const open = (id: string | null, form: ZoneForm) => { setSubmitted(false); setEditing({ id, initial: form, form }); };
  const openNew = () => {
    const city = cities.find((c) => c.is_active) ?? cities[0];
    open(null, { city_id: city?.id ?? "", name: "", area: "", pincode: site.defaultPincode, center_lat: str(city?.center_lat), center_lng: str(city?.center_lng), radius_km: "",
      delivery_fee: str(defaults.delivery_fee), min_order_amount: str(defaults.min_order_amount), free_delivery_threshold: str(defaults.free_delivery_threshold),
      eta_min_minutes: str(defaults.eta_min_minutes), eta_max_minutes: str(defaults.eta_max_minutes), express_supported: true, is_active: true });
  };
  const close = () => { if (confirmDiscard()) setEditing(null); };
  const useCityCenter = () => { const c = cities.find((x) => x.id === f?.city_id); if (c) setEditing((e) => (e ? { ...e, form: { ...e.form, center_lat: String(c.center_lat), center_lng: String(c.center_lng) } } : e)); };
  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error("Location isn't available in this browser", "Paste the coordinates from Google Maps instead."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setEditing((e) => (e ? { ...e, form: { ...e.form, center_lat: p.coords.latitude.toFixed(6), center_lng: p.coords.longitude.toFixed(6) } } : e)); toast.success("Centre set to your current location"); },
      () => toast.error("Couldn't read your location", "Allow location access, or paste the coordinates from Google Maps."),
    );
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return; setSubmitted(true);
    if (Object.keys(validateZone(editing.form)).length) return;
    const x = editing.form;
    const r = await run("save", () => saveZoneAction(editing.id, {
      city_id: x.city_id, name: x.name.trim(), area: x.area.trim(), pincode: x.pincode, center_lat: Number(x.center_lat), center_lng: Number(x.center_lng), radius_km: Number(x.radius_km),
      delivery_fee: Number(x.delivery_fee), min_order_amount: Number(x.min_order_amount), free_delivery_threshold: Number(x.free_delivery_threshold),
      eta_min_minutes: Number(x.eta_min_minutes), eta_max_minutes: Number(x.eta_max_minutes), express_supported: x.express_supported, is_active: x.is_active,
    }), editing.id ? "Zone saved" : "Zone created");
    if (r.ok) { setEditing(null); setSubmitted(false); }
  };
  const deactivate = async (z: DeliveryZone) => {
    const r = await run("deactivate", () => saveZoneAction(z.id, {
      city_id: z.city_id, name: z.name, area: z.area, pincode: z.pincode, center_lat: z.center_lat, center_lng: z.center_lng, radius_km: z.radius_km,
      delivery_fee: z.delivery_fee, min_order_amount: z.min_order_amount, free_delivery_threshold: z.free_delivery_threshold,
      eta_min_minutes: z.eta_min_minutes, eta_max_minutes: z.eta_max_minutes, express_supported: z.express_supported, is_active: false,
    }), "Zone deactivated", "It stays in the list and can be switched back on.");
    if (r.ok) setDel(null);
  };

  return (
    <Panel title="Delivery zones" flush description={`${zones.filter((z) => z.is_active).length} active of ${zones.length}. A customer's address is serviceable when it falls inside an active zone (pincode + radius).`}
      actions={<Button size="sm" onClick={openNew} disabled={!cities.length}><Plus className="h-4 w-4" aria-hidden />New zone</Button>}>
      <DataTable caption="Delivery zones" rows={zones} rowKey={(z) => z.id} maxHeight={null} className="rounded-none border-x-0 border-b-0 shadow-none"
        empty={<EmptyBlock icon={MapPinned} title="No delivery zones yet" description="Customers outside every zone see “not serviceable”. Add a zone to start delivering." action={cities.length ? <Button size="sm" onClick={openNew}><Plus className="h-4 w-4" aria-hidden />New zone</Button> : undefined} />}
        columns={[
          { key: "zone", header: "Zone", render: (z) => <CellStack primary={z.name} secondary={`${z.area} · ${cityName(z.city_id)}`} /> },
          { key: "pincode", header: "Pincode", hideBelow: "sm", render: (z) => <span className="tabular">{z.pincode}</span> },
          { key: "radius", header: "Radius", align: "right", hideBelow: "md", render: (z) => <span className="tabular">{z.radius_km} km</span> },
          { key: "fee", header: "Delivery fee", align: "right", hideBelow: "md", render: (z) => <span className="tabular">{rupees(z.delivery_fee)}</span> },
          { key: "min", header: "Min order / free above", align: "right", hideBelow: "lg", render: (z) => <span className="whitespace-nowrap tabular">{rupees(z.min_order_amount)} / {rupees(z.free_delivery_threshold)}</span> },
          { key: "eta", header: "ETA", hideBelow: "lg", render: (z) => <span className="whitespace-nowrap tabular">{z.eta_min_minutes}–{z.eta_max_minutes} min</span> },
          { key: "status", header: "Status", render: (z) => <span className="flex flex-col items-start gap-1"><StatusPill tone={z.is_active ? "green" : "neutral"}>{z.is_active ? "Active" : "Inactive"}</StatusPill>{z.express_supported ? <span className="text-xs text-ink-3">Express available</span> : null}</span> },
          { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (z) => (
            <span className="inline-flex gap-0.5">
              <IconAction label={`Edit ${z.name}`} onClick={() => open(z.id, fromZone(z))}><Pencil className="h-4 w-4" aria-hidden /></IconAction>
              <IconAction label={`Delete ${z.name}`} tone="danger" onClick={() => setDel(z)}><Trash2 className="h-4 w-4" aria-hidden /></IconAction>
            </span>
          ) },
        ]} />

      <SidePanel open={Boolean(editing)} onClose={close} title={editing?.id ? "Edit delivery zone" : "New delivery zone"} description={editing?.id ? editing.initial.name : "Zone values override the platform delivery settings for addresses inside it."} width="lg"
        footer={<PanelFormFooter formId="zone-form" dirty={dirty} saving={busy === "save"} onCancel={close} submitLabel={editing?.id ? "Save zone" : "Create zone"} />}>
        {f ? (
          <form id="zone-form" noValidate onSubmit={save} className="space-y-5">
            {submitted ? <FormErrorSummary errors={errors} /> : null}
            <FieldGroup title="Coverage">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="City" options={cities.map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (not live)` }))} placeholder="Choose a city" value={f.city_id} onChange={(e) => set("city_id", e.target.value)} error={errors.city_id} />
                <Input label="Zone name" required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Merta Central" error={errors.name} />
              </div>
              <Input label="Areas covered" required value={f.area} onChange={(e) => set("area", e.target.value)} placeholder="Sadar Bazaar, Gandhi Chowk, Ghanti Ghar" error={errors.area} hint="Shown to customers; separate areas with commas." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Pincode" required inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} error={errors.pincode} />
                <Input label="Radius (km)" required type="number" step="0.5" min={0.5} max={50} inputMode="decimal" value={f.radius_km} onChange={(e) => set("radius_km", e.target.value)} error={errors.radius_km} hint="Distance from the centre point that is served." />
              </div>
            </FieldGroup>
            <FieldGroup title="Centre point" description="Coordinates of the middle of the zone.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Latitude" required type="number" step="0.000001" inputMode="decimal" value={f.center_lat} onChange={(e) => set("center_lat", e.target.value)} error={errors.center_lat} />
                <Input label="Longitude" required type="number" step="0.000001" inputMode="decimal" value={f.center_lng} onChange={(e) => set("center_lng", e.target.value)} error={errors.center_lng} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                <Button size="xs" variant="outline" onClick={useCityCenter} disabled={!f.city_id}><Crosshair className="h-3.5 w-3.5" aria-hidden />Use city centre</Button>
                <Button size="xs" variant="outline" onClick={useMyLocation}><Crosshair className="h-3.5 w-3.5" aria-hidden />Use my location</Button>
                {Number.isFinite(Number(f.center_lat)) && Number.isFinite(Number(f.center_lng)) && f.center_lat && f.center_lng ? <a className="font-semibold text-brand-700 hover:underline" href={`https://www.google.com/maps/@${f.center_lat},${f.center_lng},15z`} target="_blank" rel="noreferrer">Check on Google Maps</a> : null}
              </div>
              {!isMapsConfigured() ? <p className="flex items-start gap-1.5 text-xs text-ink-3"><MapPinOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />A map picker needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Until then, right-click a spot in Google Maps and copy its coordinates here.</p> : null}
            </FieldGroup>
            <FieldGroup title="Charges" description={editing?.id ? undefined : "Pre-filled from Settings › Delivery; change them for this zone if needed."}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="Delivery fee (₹)" required type="number" min={0} step="1" inputMode="decimal" value={f.delivery_fee} onChange={(e) => set("delivery_fee", e.target.value)} error={errors.delivery_fee} />
                <Input label="Minimum order (₹)" required type="number" min={0} step="1" inputMode="decimal" value={f.min_order_amount} onChange={(e) => set("min_order_amount", e.target.value)} error={errors.min_order_amount} />
                <Input label="Free delivery above (₹)" required type="number" min={0} step="1" inputMode="decimal" value={f.free_delivery_threshold} onChange={(e) => set("free_delivery_threshold", e.target.value)} error={errors.free_delivery_threshold} />
              </div>
            </FieldGroup>
            <FieldGroup title="Delivery time" description="The range promised to customers for standard delivery.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Fastest (min)" required type="number" min={5} max={240} step="1" inputMode="numeric" value={f.eta_min_minutes} onChange={(e) => set("eta_min_minutes", e.target.value)} error={errors.eta_min_minutes} />
                <Input label="Slowest (min)" required type="number" min={5} max={360} step="1" inputMode="numeric" value={f.eta_max_minutes} onChange={(e) => set("eta_max_minutes", e.target.value)} error={errors.eta_max_minutes} />
              </div>
            </FieldGroup>
            <FieldGroup title="Availability">
              <div className="flex flex-col gap-3">
                <Switch checked={f.express_supported} onChange={(v) => set("express_supported", v)} label="Express delivery available in this zone" />
                <Switch checked={f.is_active} onChange={(v) => set("is_active", v)} label="Zone active (serviceable)" />
              </div>
            </FieldGroup>
          </form>
        ) : null}
      </SidePanel>

      <ConfirmChange open={Boolean(del)} onClose={() => setDel(null)} tone="danger" title={`Delete zone “${del?.name ?? ""}”?`} confirmLabel="Delete zone" loading={busy === "delete"}
        description="This can't be undone. Addresses inside it stop being serviceable unless another zone covers them. If addresses or orders still point to this zone the delete is refused — deactivate it instead."
        onConfirm={async () => { if (!del) return; const r = await run("delete", () => deleteZoneAction(del.id), "Zone deleted"); if (r.ok) setDel(null); }}>
        {del?.is_active ? <Button size="sm" variant="outline" fullWidth loading={busy === "deactivate"} onClick={() => deactivate(del)}>Deactivate instead (keeps the zone)</Button> : null}
      </ConfirmChange>
    </Panel>
  );
}
