"use client";
import * as React from "react";
import { RotateCcw } from "lucide-react";
import { reorderAction, getCartSummary } from "@/lib/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function ReorderButton({ orderId, size = "sm", variant = "secondary", label = "Buy again", className }: { orderId: string; size?: "sm" | "md"; variant?: "secondary" | "outline" | "primary" | "ghost"; label?: string; className?: string }) {
  const setSummary = useCartStore((s) => s.setSummary); const openDrawer = useCartStore((s) => s.openDrawer);
  const [busy, setBusy] = React.useState(false);
  return (
    <Button variant={variant} size={size} loading={busy} className={className} onClick={async () => {
      setBusy(true);
      const r = await reorderAction(orderId);
      if (r.ok) { setSummary(await getCartSummary()); toast.success(`${r.data.added} items added to cart`, r.data.skipped.length ? `Unavailable: ${r.data.skipped.map((s) => s.name).join(", ")}` : undefined); openDrawer("cart"); }
      else toast.error(r.error);
      setBusy(false);
    }}><RotateCcw className="h-4 w-4" /> {label}</Button>
  );
}
