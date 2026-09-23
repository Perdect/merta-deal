"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { setProductFlagsAction } from "@/lib/actions/admin";

/** Quick approve / activate toggles in the product page header. */
export function ProductFlags({ id, isActive, isApproved }: { id: string; isActive: boolean; isApproved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const flip = async (key: "is_active" | "is_approved", v: boolean) => {
    setBusy(key); const r = await setProductFlagsAction(id, { [key]: v }); setBusy(null);
    if (r.ok) { toast.success("Updated"); router.refresh(); } else toast.error(r.error);
  };
  return (
    <div className="flex gap-2">
      {!isApproved ? <Button size="sm" loading={busy === "is_approved"} onClick={() => flip("is_approved", true)}>Approve</Button> : null}
      <Button size="sm" variant="outline" loading={busy === "is_active"} onClick={() => flip("is_active", !isActive)}>{isActive ? "Deactivate" : "Activate"}</Button>
    </div>
  );
}
