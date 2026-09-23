"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Input, Switch } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { updateStoreSettingsAction } from "@/lib/actions/store";
import type { Store } from "@/types/app";

const hhmm = (t: string) => t.slice(0, 5);

/** Operating settings: open flag, hours, packing time, minimum order override, delivery radius. */
export function StoreSettingsForm({ store }: { store: Store }) {
  const router = useRouter();
  const init = React.useCallback(() => ({ is_open: store.is_open, opening_time: hhmm(store.opening_time), closing_time: hhmm(store.closing_time), avg_prep_minutes: String(store.avg_prep_minutes), min_order_amount: store.min_order_amount == null ? "" : String(store.min_order_amount), delivery_radius_km: String(store.delivery_radius_km) }), [store]);
  const [form, setForm] = React.useState(init);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState(store);
  if (seen !== store) { setSeen(store); setForm(init()); }
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErrors({});
    const r = await updateStoreSettingsAction(store.id, { is_open: form.is_open, opening_time: form.opening_time, closing_time: form.closing_time, avg_prep_minutes: Number(form.avg_prep_minutes), min_order_amount: form.min_order_amount.trim() === "" ? null : Number(form.min_order_amount), delivery_radius_km: Number(form.delivery_radius_km) });
    setBusy(false);
    if (!r.ok) { setErrors(r.fieldErrors ?? {}); toast.error(r.error); return; }
    toast.success("Settings saved"); router.refresh();
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="flex items-center justify-between gap-3 rounded-md bg-surface px-3.5 py-3">
        <div><p className="text-sm font-semibold text-ink">Accepting orders</p><p className="text-xs text-ink-3">Turn off for a break; customers can still schedule for later.</p></div>
        <Switch checked={form.is_open} onChange={(v) => set("is_open", v)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Opening time" type="time" value={form.opening_time} onChange={(e) => set("opening_time", e.target.value)} error={errors.opening_time} />
        <Input label="Closing time" type="time" value={form.closing_time} onChange={(e) => set("closing_time", e.target.value)} error={errors.closing_time} />
        <Input label="Average packing time (min)" type="number" inputMode="numeric" min={5} max={180} value={form.avg_prep_minutes} onChange={(e) => set("avg_prep_minutes", e.target.value)} error={errors.avg_prep_minutes} hint="Feeds the delivery ETA customers see" />
        <Input label="Delivery radius (km)" type="number" inputMode="decimal" min={0.5} max={30} step={0.5} value={form.delivery_radius_km} onChange={(e) => set("delivery_radius_km", e.target.value)} error={errors.delivery_radius_km} />
        <Input label="Minimum order (₹)" type="number" inputMode="numeric" min={0} value={form.min_order_amount} onChange={(e) => set("min_order_amount", e.target.value)} error={errors.min_order_amount} hint="Blank = platform default" />
      </div>
      <Button type="submit" loading={busy}>Save settings</Button>
    </form>
  );
}
