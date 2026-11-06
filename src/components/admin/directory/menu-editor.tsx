"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { deleteMenuItemAction, saveMenuItemAction } from "@/lib/actions/directory";
import type { MenuItem } from "@/lib/directory";
import { formatINR } from "@/lib/utils";

const blank = { section: "", name: "", description: "", price: "", product_id: "", is_veg: false, is_available: true };

/** Items the business has supplied. Linking a catalogue product ID makes the item orderable through the cart. */
export function MenuEditor({ businessId, items }: { businessId: string; items: MenuItem[] }) {
  const router = useRouter();
  const [f, setF] = React.useState(blank);
  const [busy, setBusy] = React.useState(false);
  const add = async () => {
    if (busy) return; setBusy(true);
    try {
      const r = await saveMenuItemAction({ business_id: businessId, section: f.section, name: f.name, description: f.description, price: f.price.trim() ? Number(f.price) : null, is_veg: f.is_veg ? true : null, is_available: f.is_available, product_id: f.product_id, sort_order: items.length });
      if (!r.ok) { toast.error("Not saved", r.error); return; }
      setF(blank); router.refresh();
    } finally { setBusy(false); }
  };
  const remove = async (id: string) => { const r = await deleteMenuItemAction(id); if (!r.ok) toast.error(r.error); else router.refresh(); };
  return (
    <Panel title="Menu or products" description="Only items and prices the business has given you.">
      <ul className="divide-y divide-line border-t border-line text-sm">
        {items.map((i) => <li key={i.id} className="flex items-center gap-3 px-4 py-2 sm:px-5"><span className="min-w-0 flex-1"><span className="font-medium text-ink">{i.name}</span> <span className="text-xs text-ink-3">{[i.section, i.product_id ? "in cart" : null, i.is_available ? null : "not available"].filter(Boolean).join(" · ")}</span></span>{i.price != null ? <span className="tabular">{formatINR(i.price)}</span> : null}<button type="button" className="text-xs text-danger" onClick={() => remove(i.id)}>Remove</button></li>)}
      </ul>
      <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-3 sm:p-5">
        <Input label="Item name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input label="Section" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} />
        <Input label="Price (₹)" type="number" inputMode="decimal" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        <Input label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Input label="Catalogue product ID (optional)" value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })} hint="Lets customers add it to the cart." />
        <div className="flex flex-col justify-end gap-2"><Checkbox label="Vegetarian" checked={f.is_veg} onChange={(e) => setF({ ...f, is_veg: e.target.checked })} /><Checkbox label="Available" checked={f.is_available} onChange={(e) => setF({ ...f, is_available: e.target.checked })} /></div>
        <div><Button onClick={add} loading={busy}>Add item</Button></div>
      </div>
    </Panel>
  );
}
