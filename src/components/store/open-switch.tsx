"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { setStoreOpenAction } from "@/lib/actions/store";

/** Store open/closed toggle (stores.is_open). Optimistic; reverts on failure. */
export function OpenSwitch({ storeId, isOpen, disabled }: { storeId: string; isOpen: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(isOpen);
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState(isOpen);
  if (seen !== isOpen) { setSeen(isOpen); setOpen(isOpen); }
  const toggle = async (v: boolean) => {
    setOpen(v); setBusy(true);
    const r = await setStoreOpenAction(storeId, v);
    setBusy(false);
    if (!r.ok) { setOpen(!v); toast.error(r.error); return; }
    toast.success(v ? "Store is open for orders" : "Store closed — customers can schedule for later");
    router.refresh();
  };
  return <Switch checked={open} onChange={toggle} disabled={busy || disabled} label={open ? "Accepting orders" : "Closed"} />;
}
