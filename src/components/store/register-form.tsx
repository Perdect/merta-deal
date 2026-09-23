"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { registerStoreAction } from "@/lib/actions/store";
import { StoreProfileFields, emptyStoreForm, formToInput, type StoreFormState } from "./store-profile-fields";
import { StoreDocuments, StoreMedia } from "./store-media";

/** Two-step onboarding: 1) shop details → creates a `pending` store; 2) documents & photos. */
export function StoreRegisterForm({ defaults }: { defaults: { owner_name?: string | null; phone?: string | null; email?: string | null } }) {
  const router = useRouter();
  const [form, setForm] = React.useState<StoreFormState>(() => emptyStoreForm(defaults));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const set = React.useCallback(<K extends keyof StoreFormState>(k: K, v: StoreFormState[K]) => setForm((f) => ({ ...f, [k]: v })), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErrors({});
    const r = await registerStoreAction(formToInput(form));
    setBusy(false);
    if (!r.ok) { setErrors(r.fieldErrors ?? {}); toast.error(r.error); const first = Object.keys(r.fieldErrors ?? {})[0]; if (first) document.querySelector<HTMLElement>(`[aria-invalid="true"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    setStoreId(r.data.id);
    toast.success("Store registered", "Now add your documents so we can verify you.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (storeId) {
    return (
      <div className="space-y-4">
        <Alert tone="success" icon={<CheckCircle2 className="h-4 w-4" />} title="Store registered — pending approval">An admin will review your store. Uploading your documents now speeds this up. You can also do this later from Store Profile.</Alert>
        <section className="rounded-lg border border-line bg-card p-4 shadow-card sm:p-5"><h2 className="mb-3 text-base font-bold text-ink">Verification documents</h2><StoreDocuments storeId={storeId} docs={[]} /></section>
        <section className="rounded-lg border border-line bg-card p-4 shadow-card sm:p-5"><h2 className="mb-3 text-base font-bold text-ink">Logo & shop photos</h2><StoreMedia storeId={storeId} logoUrl={null} coverUrl={null} photos={[]} /></section>
        <Button size="lg" fullWidth onClick={() => { router.push("/store"); router.refresh(); }}>Go to my dashboard <ArrowRight className="h-4 w-4" /></Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <StoreProfileFields form={form} set={set} errors={errors} mode="register" />
      <div className="sticky bottom-0 -mx-4 border-t border-line bg-card/95 p-4 backdrop-blur safe-bottom sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" size="lg" fullWidth loading={busy}>Register store</Button>
        <p className="mt-2 text-center text-xs text-ink-3">By registering you agree to list genuine products at fair prices. Commission is set by the platform.</p>
      </div>
    </form>
  );
}
