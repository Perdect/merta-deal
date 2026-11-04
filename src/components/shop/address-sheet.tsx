"use client";
import * as React from "react";
import { Home, Briefcase, MapPin, Plus, Check, ChevronRight } from "lucide-react";
import type { Address } from "@/types/app";
import { BottomSheet, Modal } from "@/components/ui/overlay";
import { AddressWizard } from "./address-wizard";
import { cn } from "@/lib/utils";
import { addressLine, addressTitle } from "@/stores/location-store";
export { addressLine, addressTitle };

const TYPE_ICON = { home: Home, work: Briefcase, other: MapPin } as const;

/**
 * "Select delivery location": the saved addresses as a bottom sheet, with "Add new address" opening
 * the map + details wizard. With no saved address the wizard opens straight away. Works for guests
 * too — their address rows move to the account when they sign in (merge_guest_cart).
 */
export function AddressSheet({ open, onClose, addresses, selectedId, onPick, defaultName, defaultPhone }: {
  open: boolean; onClose: () => void; addresses: Address[]; selectedId: string | null;
  /** A saved address was chosen, or a new one saved (`isNew`). */
  onPick: (a: Address, isNew: boolean) => void;
  defaultName?: string | null; defaultPhone?: string | null;
}) {
  const [adding, setAdding] = React.useState(false);
  const wizard = open && (adding || addresses.length === 0);
  // Reset the inner step whenever the sheet closes so it reopens on the list.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (!open) setAdding(false); }

  return (
    <>
      <BottomSheet open={open && !wizard} onClose={onClose} title="Select delivery location" className="sm:max-w-md">
        <ul className="-mx-1 divide-y divide-dashed divide-line">
          {addresses.map((a) => { const Icon = TYPE_ICON[a.type] ?? MapPin; const on = a.id === selectedId; return (
            <li key={a.id}>
              <button type="button" onClick={() => onPick(a, false)} aria-pressed={on} className="flex w-full items-start gap-3 px-1 py-3.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600">
                <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", on ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700")}>{on ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span>
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold text-ink">{addressTitle(a)}</span><span className="line-clamp-2 text-sm text-ink-2">{addressLine(a)}</span><span className="block text-xs text-ink-3">{a.full_name} · +91 {a.phone}</span></span>
              </button>
            </li>); })}
          <li>
            <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-3 px-1 py-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Plus className="h-5 w-5" strokeWidth={2.2} /></span>
              <span className="flex-1 text-[15px] font-bold text-brand-700">Add new address</span>
              <ChevronRight className="h-5 w-5 text-ink-3" aria-hidden />
            </button>
          </li>
        </ul>
      </BottomSheet>

      <Modal open={wizard} onClose={addresses.length ? () => setAdding(false) : onClose} title="Location information" size="screen">
        <AddressWizard defaultName={defaultName} defaultPhone={defaultPhone} onCancel={addresses.length ? () => setAdding(false) : onClose} onSaved={(a) => { setAdding(false); onPick(a, true); }} />
      </Modal>
    </>
  );
}
