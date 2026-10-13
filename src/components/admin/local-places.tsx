"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Pencil, Trash2 } from "lucide-react";
import { saveLocalPlaceAction, deleteLocalPlaceAction, type LocalPlace } from "@/lib/actions/admin-places";
import { MapPicker, type PickedLocation } from "@/components/shop/map-picker";
import { Panel, EmptyBlock, StatusPill } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";

type Draft = { id?: string; name: string; aliases: string; area: string; pincode: string; lat: number; lng: number; is_active: boolean };

/**
 * Merta landmarks customers search for (dargahs, chowks, mohallas, schools…). Public map data barely
 * covers them, so each one is pinned here once and then suggested while customers type an address.
 */
export function LocalPlacesManager({ places }: { places: LocalPlace[] }) {
  const router = useRouter();
  const [step, setStep] = React.useState<null | "map" | "form">(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState<LocalPlace | null>(null);

  const startNew = () => { setDraft(null); setStep("map"); };
  const fromMap = (p: PickedLocation) => {
    setDraft((d) => d ? { ...d, lat: p.lat, lng: p.lng } : { name: "", aliases: "", area: p.area ?? "", pincode: p.pincode ?? "", lat: p.lat, lng: p.lng, is_active: true });
    setStep("form");
  };
  const edit = (p: LocalPlace) => { setDraft({ id: p.id, name: p.name, aliases: p.aliases.join(", "), area: p.area ?? "", pincode: p.pincode ?? "", lat: p.lat, lng: p.lng, is_active: p.is_active }); setStep("form"); };
  const set = (k: keyof Draft, v: string | boolean) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    const r = await saveLocalPlaceAction({ id: draft.id, name: draft.name, aliases: draft.aliases.split(",").map((a) => a.trim()).filter((a) => a.length >= 2), area: draft.area, pincode: draft.pincode, lat: draft.lat, lng: draft.lng, is_active: draft.is_active });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(draft.id ? "Landmark updated" : "Landmark added", "Customers will see it while typing an address.");
    setStep(null); setDraft(null); router.refresh();
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const r = await deleteLocalPlaceAction(deleting.id);
    setBusy(false); setDeleting(null);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Landmark removed"); router.refresh();
  };

  return (
    <Panel title="Local landmarks" description="Places customers type when adding an address (e.g. Hafiz Sahab ki Dargah, Gandhi Chowk). Pin each once; add other spellings so Hinglish searches find it." actions={<Button size="sm" onClick={startNew}><Plus className="h-4 w-4" /> Add landmark</Button>} flush>
      {places.length === 0 ? (
        <EmptyBlock icon={MapPin} title="No landmarks yet" description="Add the places your customers mention most. Delivery-zone areas are already searchable." action={<Button size="sm" onClick={startNew}><Plus className="h-4 w-4" /> Add landmark</Button>} />
      ) : (
        <ul className="divide-y divide-line">
          {places.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <MapPin className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{p.name} {!p.is_active ? <StatusPill tone="neutral" className="ml-1">Hidden</StatusPill> : null}</p>
                <p className="truncate text-xs text-ink-3">{[p.aliases.length ? `Also: ${p.aliases.join(", ")}` : null, p.area, p.pincode].filter(Boolean).join(" · ") || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => edit(p)} aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={step !== null} onClose={() => { setStep(null); setDraft(null); }} title={step === "map" ? "Pin the landmark" : draft?.id ? "Edit landmark" : "New landmark"} size="screen">
        {step === "map" ? <MapPicker initial={draft ? { lat: draft.lat, lng: draft.lng } : null} onConfirm={fromMap} confirmLabel="Use this location" /> : null}
        {step === "form" && draft ? (
          <form onSubmit={save} className="space-y-4 max-sm:p-4">
            <Input label="Name" required value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Hafiz Sahab ki Dargah" />
            <Input label="Other spellings (comma-separated)" value={draft.aliases} onChange={(e) => set("aliases", e.target.value)} placeholder="e.g. Hafiz Saheb Dargah, Hafij Sahab" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Area / mohalla" value={draft.area} onChange={(e) => set("area", e.target.value)} />
              <Input label="Pincode" inputMode="numeric" value={draft.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 text-sm">
              <span className="text-ink-2">Pinned at {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setStep("map")}>Move pin</Button>
            </div>
            <Switch label="Show in customer search" checked={draft.is_active} onChange={(v) => set("is_active", v)} />
            <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => { setStep(null); setDraft(null); }}>Cancel</Button><Button type="submit" className="flex-1" loading={busy}>Save landmark</Button></div>
          </form>
        ) : null}
      </Modal>
      <ConfirmDialog open={deleting !== null} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy} tone="danger" title={`Delete ${deleting?.name ?? "landmark"}?`} description="Customers won't see it in address search any more. Saved addresses are not affected." confirmLabel="Delete" />
    </Panel>
  );
}
