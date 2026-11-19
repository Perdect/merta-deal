"use client";
import { notifySessionChanged } from "@/stores/me-store";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Home, Briefcase, MapPin, Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import type { Address } from "@/types/app";
import { deleteAddressAction, setDefaultAddressAction } from "@/lib/actions/checkout";
import { AddressForm } from "@/components/shop/address-form";
import { AddressWizard } from "@/components/shop/address-wizard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { useLocationStore } from "@/stores/location-store";
import type { Serviceability } from "@/types/app";

const TYPE_ICON = { home: Home, work: Briefcase, other: MapPin } as const;
const TYPE_LABEL = { home: "Home", work: "Work", other: "Other" } as const;

export function formatAddressLine(a: Address) {
  return [a.house, a.street, a.area, a.landmark ? `near ${a.landmark}` : null, `${a.city} – ${a.pincode}`].filter(Boolean).join(", ");
}

/** Saved addresses with add/edit (modal), delete (confirm) and set-default. */
export function AddressList({ initial, defaultName, defaultPhone, openNew = false }: { initial: Address[]; defaultName?: string | null; defaultPhone?: string | null; /** Opened from "Add New Address" in the location picker: show the form straight away. */ openNew?: boolean }) {
  const router = useRouter();
  const setLocation = useLocationStore((s) => s.setLocation);
  const [items, setItems] = React.useState<Address[]>(initial);
  const [editing, setEditing] = React.useState<Address | "new" | null>(openNew ? "new" : null);
  // Which step of the new-address wizard the screen header is showing (see AddressWizard).
  const [mapStep, setMapStep] = React.useState(false);
  const [wasEditing, setWasEditing] = React.useState(editing !== null);
  if (wasEditing !== (editing !== null)) { setWasEditing(editing !== null); if (editing === null) setMapStep(false); }
  const [deleting, setDeleting] = React.useState<Address | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  // Resync when the server sends fresh props (after router.refresh()).
  const [prevInitial, setPrevInitial] = React.useState(initial);
  if (prevInitial !== initial) { setPrevInitial(initial); setItems(initial); }

  const sorted = React.useMemo(() => [...items].sort((a, b) => Number(b.is_default) - Number(a.is_default)), [items]);

  const onSaved = (a: Address) => {
    // A newly added address becomes the delivery location (header ETA, cart and checkout follow it).
    if (editing === "new") {
      const q = new URLSearchParams(a.lat != null && a.lng != null ? { lat: String(a.lat), lng: String(a.lng), pincode: a.pincode } : { pincode: a.pincode });
      fetch(`/api/location/serviceability?${q}`).then((r) => r.json() as Promise<Serviceability>).then((s) => {
        setLocation({ label: [a.label || a.type[0].toUpperCase() + a.type.slice(1), a.area].filter(Boolean).join(" · "), area: a.area, pincode: a.pincode, lat: a.lat, lng: a.lng, serviceable: s.serviceable, zoneName: s.zone_name, etaMin: s.eta_min_minutes, etaMax: s.eta_max_minutes, addressId: a.id });
        if (!s.serviceable) toast.info("Address saved", s.message ?? "We don't deliver to this pincode yet.");
      }).catch(() => {});
    }
    setItems((cur) => {
      const base = a.is_default ? cur.map((x) => ({ ...x, is_default: false })) : cur;
      return base.some((x) => x.id === a.id) ? base.map((x) => (x.id === a.id ? a : x)) : [a, ...base];
    });
    setEditing(null); notifySessionChanged(); router.refresh();
  };

  const remove = async () => {
    if (!deleting || busyId) return;
    setBusyId(deleting.id);
    try {
      const r = await deleteAddressAction(deleting.id);
      if (!r.ok) { toast.error(r.error); return; }
      setItems((cur) => cur.filter((x) => x.id !== deleting.id));
      setDeleting(null); toast.success("Address removed"); notifySessionChanged(); router.refresh();
    } catch {
      toast.error("Could not remove the address", "Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  };

  const makeDefault = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const r = await setDefaultAddressAction(id);
      if (!r.ok) { toast.error(r.error); return; }
      setItems((cur) => cur.map((x) => ({ ...x, is_default: x.id === id })));
      toast.success("Default address updated"); router.refresh();
    } catch {
      toast.error("Could not update the default address", "Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setEditing("new")} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-4 text-left shadow-card transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
        <Plus className="h-5 w-5 text-brand-700" strokeWidth={2.2} aria-hidden />
        <span className="flex-1 text-[15px] font-bold text-brand-700">Add New Address</span>
        <ChevronRight className="h-5 w-5 text-ink-3" aria-hidden />
      </button>
      <h2 className="px-1 pt-3 text-base font-bold text-ink">Saved Addresses</h2>
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-line bg-card px-6 py-12 text-center shadow-card">
          <EmptyAddressArt className="h-40 w-40" />
          <p className="mt-5 font-display text-lg font-bold text-ink">No Address Added</p>
          <p className="mt-1.5 max-w-xs text-sm text-ink-2">To see the saved address here, add your work or home address</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((a) => {
            const Icon = TYPE_ICON[a.type] ?? MapPin;
            return (
              <li key={a.id} className="rounded-2xl border border-line bg-card p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Icon className="h-4.5 w-4.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-ink">{a.type === "other" && a.label ? a.label : TYPE_LABEL[a.type]}</p>
                      {a.is_default ? <Badge tone="brand" size="xs">Default</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-2">{formatAddressLine(a)}</p>
                    <p className="mt-1 text-xs text-ink-3">{a.full_name} · +91 {a.phone}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Button variant="ghost" size="md" className="px-3" aria-label={`Edit ${a.type === "other" && a.label ? a.label : TYPE_LABEL[a.type]} address`} onClick={() => setEditing(a)}><Pencil className="h-4 w-4" aria-hidden /> Edit</Button>
                  <Button variant="ghost" size="md" className="px-3 text-danger hover:text-danger" aria-label={`Delete ${a.type === "other" && a.label ? a.label : TYPE_LABEL[a.type]} address`} onClick={() => setDeleting(a)}><Trash2 className="h-4 w-4" aria-hidden /> Delete</Button>
                  {!a.is_default ? <Button variant="outline" size="md" className="ml-auto px-3" loading={busyId === a.id} disabled={busyId !== null} onClick={() => makeDefault(a.id)}>Set as default</Button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => (mapStep ? setMapStep(false) : setEditing(null))} title={editing === "new" ? (mapStep ? "Select Your Location" : "Location information") : "Edit address"} size="screen">
        {editing === "new" ? <AddressWizard mapOpen={mapStep} onMapOpenChange={setMapStep} onSaved={onSaved} onCancel={() => setEditing(null)} defaultName={defaultName} defaultPhone={defaultPhone} />
          : editing !== null ? <div className="max-sm:p-4"><AddressForm initial={editing} onSaved={onSaved} onCancel={() => setEditing(null)} defaultName={defaultName} defaultPhone={defaultPhone} /></div> : null}
      </Modal>
      <ConfirmDialog open={deleting !== null} onClose={() => setDeleting(null)} onConfirm={remove} title="Delete this address?" description={deleting ? formatAddressLine(deleting) : undefined} confirmLabel="Delete" tone="danger" loading={Boolean(deleting && busyId === deleting.id)} />
    </div>
  );
}

/** Empty-state art: a little house with a delivery pin over it (brand colours, inline SVG). */
function EmptyAddressArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden>
      <ellipse cx="80" cy="140" rx="54" ry="7" fill="#e8ebe6" />
      <path d="M38 78 80 44l42 34v58H38z" fill="#f1f9f1" stroke="#b9dfbb" strokeWidth="3" strokeLinejoin="round" />
      <path d="M30 82 80 40l50 42" fill="none" stroke="#329537" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="68" y="102" width="24" height="34" rx="3" fill="#329537" />
      <circle cx="87" cy="120" r="2" fill="#f1f9f1" />
      <rect x="46" y="92" width="14" height="14" rx="2" fill="#dbf0dc" stroke="#84c887" strokeWidth="2" />
      <rect x="100" y="92" width="14" height="14" rx="2" fill="#dbf0dc" stroke="#84c887" strokeWidth="2" />
      <g transform="translate(104 8)">
        <path d="M18 0C8 0 0 8 0 18c0 13 18 30 18 30s18-17 18-30C36 8 28 0 18 0z" fill="#F2A93B" />
        <circle cx="18" cy="18" r="7" fill="#fff" />
      </g>
      <circle cx="30" cy="40" r="3" fill="#84c887" /><circle cx="140" cy="70" r="2.5" fill="#F2A93B" /><path d="M22 60l5 5m0-5-5 5" stroke="#b9dfbb" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
