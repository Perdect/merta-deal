"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { updateStoreProfileAction } from "@/lib/actions/store";
import { StoreProfileFields, storeToForm, formToInput, type StoreFormState } from "./store-profile-fields";
import type { Store } from "@/types/app";

/** Edit every store-owned profile field. Status, commission and featured flag are admin-only (ignored by the DB trigger). */
export function StoreProfileForm({ store }: { store: Store }) {
  const router = useRouter();
  const [form, setForm] = React.useState<StoreFormState>(() => storeToForm(store));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [seen, setSeen] = React.useState(store);
  if (seen !== store) { setSeen(store); setForm(storeToForm(store)); setDirty(false); }
  const set = React.useCallback(<K extends keyof StoreFormState>(k: K, v: StoreFormState[K]) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErrors({});
    const r = await updateStoreProfileAction(store.id, formToInput(form));
    setBusy(false);
    if (!r.ok) { setErrors(r.fieldErrors ?? {}); toast.error(r.error); document.querySelector<HTMLElement>('[aria-invalid="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    toast.success("Store profile saved"); setDirty(false); router.refresh();
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <StoreProfileFields form={form} set={set} errors={errors} mode="full" />
      <div className="sticky bottom-0 z-10 -mx-3 border-t border-line bg-card/95 p-3 backdrop-blur safe-bottom sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" size="lg" fullWidth loading={busy} disabled={!dirty}>Save profile</Button>
      </div>
    </form>
  );
}
