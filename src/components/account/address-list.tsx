"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Home, Briefcase, MapPin, Plus, Pencil, Trash2 } from "lucide-react";
import type { Address } from "@/types/app";
import { deleteAddressAction, setDefaultAddressAction } from "@/lib/actions/checkout";
import { AddressForm } from "@/components/shop/address-form";
import { AddressWizard } from "@/components/shop/address-wizard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal, ConfirmDialog } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/states";
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
        setLocation({ label: `${a.label || a.type[0].toUpperCase() + a.type.slice(1)} · ${a.area}`, area: a.area, pincode: a.pincode, lat: a.lat, lng: a.lng, serviceable: s.serviceable, zoneName: s.zone_name, etaMin: s.eta_min_minutes, etaMax: s.eta_max_minutes, addressId: a.id });
        if (!s.serviceable) toast.info("Address saved", s.message ?? "We don't deliver to this pincode yet.");
      }).catch(() => {});
    }
    setItems((cur) => {
      const base = a.is_default ? cur.map((x) => ({ ...x, is_default: false })) : cur;
      return base.some((x) => x.id === a.id) ? base.map((x) => (x.id === a.id ? a : x)) : [a, ...base];
    });
    setEditing(null); router.refresh();
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    const r = await deleteAddressAction(deleting.id);
    setBusyId(null);
    if (!r.ok) { toast.error(r.error); return; }
    setItems((cur) => cur.filter((x) => x.id !== deleting.id));
    setDeleting(null); toast.success("Address removed"); router.refresh();
  };

  const makeDefault = async (id: string) => {
    setBusyId(id);
    const r = await setDefaultAddressAction(id);
    setBusyId(null);
    if (!r.ok) { toast.error(r.error); return; }
    setItems((cur) => cur.map((x) => ({ ...x, is_default: x.id === id })));
    toast.success("Default address updated"); router.refresh();
  };

  return (
    <div className="space-y-3">
      <Button onClick={() => setEditing("new")} fullWidth variant="secondary"><Plus className="h-4 w-4" /> Add new address</Button>
      {sorted.length === 0 ? (
        <EmptyState icon={<MapPin className="h-7 w-7" />} title="No saved addresses" description="Add your home or work address to check out faster." compact />
      ) : (
        <ul className="space-y-3">
          {sorted.map((a) => {
            const Icon = TYPE_ICON[a.type] ?? MapPin;
            return (
              <li key={a.id} className="rounded-lg border border-line bg-card p-4 shadow-card">
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
                  <Button variant="ghost" size="sm" onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /> Edit</Button>
                  <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setDeleting(a)}><Trash2 className="h-4 w-4" /> Delete</Button>
                  {!a.is_default ? <Button variant="outline" size="sm" className="ml-auto" loading={busyId === a.id} onClick={() => makeDefault(a.id)}>Set as default</Button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Location information" : "Edit address"} size="lg">
        {editing === "new" ? <AddressWizard onSaved={onSaved} onCancel={() => setEditing(null)} defaultName={defaultName} defaultPhone={defaultPhone} />
          : editing !== null ? <AddressForm initial={editing} onSaved={onSaved} onCancel={() => setEditing(null)} defaultName={defaultName} defaultPhone={defaultPhone} /> : null}
      </Modal>
      <ConfirmDialog open={deleting !== null} onClose={() => setDeleting(null)} onConfirm={remove} title="Delete this address?" description={deleting ? formatAddressLine(deleting) : undefined} confirmLabel="Delete" tone="danger" loading={Boolean(deleting && busyId === deleting.id)} />
    </div>
  );
}
