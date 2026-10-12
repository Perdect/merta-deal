"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { setProductVisibilityAction } from "@/lib/actions/admin-catalogue";
import { btn } from "@/components/admin/catalogue/bits";

/** Approve / activate / deactivate in the product page header. Deactivating asks first (it hides the product from customers). */
export function ProductFlags({ id, name, isActive, isApproved }: { id: string; name?: string; isActive: boolean; isApproved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"is_active" | "is_approved" | null>(null);
  const [confirmOff, setConfirmOff] = React.useState(false);
  const flip = async (key: "is_active" | "is_approved", v: boolean) => {
    setBusy(key);
    const r = await setProductVisibilityAction(id, { [key]: v });
    setBusy(null); setConfirmOff(false);
    if (r.ok) { toast.success(key === "is_approved" ? "Product approved" : v ? "Product activated" : "Product deactivated", key === "is_active" && !v ? "Customers no longer see it." : undefined); router.refresh(); }
    else toast.error("Couldn't update the product", r.error);
  };
  const spinner = <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current motion-reduce:animate-none" aria-hidden />;
  return (
    <>
      {!isApproved ? (
        <button type="button" className={btn.primary} disabled={busy !== null} onClick={() => flip("is_approved", true)}>
          {busy === "is_approved" ? spinner : <CheckCircle2 className="h-4 w-4" aria-hidden />}Approve
        </button>
      ) : null}
      <button type="button" className={btn.outline} disabled={busy !== null} onClick={() => (isActive ? setConfirmOff(true) : flip("is_active", true))}>
        {busy === "is_active" ? spinner : isActive ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}{isActive ? "Deactivate" : "Activate"}
      </button>
      <ConfirmDialog open={confirmOff} onClose={() => setConfirmOff(false)} title={`Deactivate ${name ? `“${name}”` : "this product"}?`}
        description="Customers will stop seeing it at every store. Store prices and stock are kept, and you can activate it again at any time."
        confirmLabel="Deactivate" loading={busy === "is_active"} onConfirm={() => flip("is_active", false)} />
    </>
  );
}
