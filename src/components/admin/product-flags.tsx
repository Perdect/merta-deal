"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { setProductVisibilityAction } from "@/lib/actions/admin-catalogue";
import { btn } from "@/components/admin/catalogue/bits";

/** Activate / deactivate in the product page header. Deactivating asks first (it hides the product from customers). */
export function ProductFlags({ id, name, isActive }: { id: string; name?: string; isActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirmOff, setConfirmOff] = React.useState(false);
  const flip = async (v: boolean) => {
    setBusy(true);
    const r = await setProductVisibilityAction(id, { is_active: v });
    setBusy(false); setConfirmOff(false);
    if (r.ok) { toast.success(v ? "Product activated" : "Product deactivated", !v ? "Customers no longer see it." : undefined); router.refresh(); }
    else toast.error("Couldn't update the product", r.error);
  };
  const spinner = <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current motion-reduce:animate-none" aria-hidden />;
  return (
    <>
      <button type="button" className={btn.outline} disabled={busy} onClick={() => (isActive ? setConfirmOff(true) : flip(true))}>
        {busy ? spinner : isActive ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}{isActive ? "Deactivate" : "Activate"}
      </button>
      <ConfirmDialog open={confirmOff} onClose={() => setConfirmOff(false)} title={`Deactivate ${name ? `“${name}”` : "this product"}?`}
        description="Customers will stop seeing it. Its price and stock are kept, and you can activate it again at any time."
        confirmLabel="Deactivate" loading={busy} onConfirm={() => flip(false)} />
    </>
  );
}
