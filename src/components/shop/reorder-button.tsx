"use client";
import * as React from "react";
import { RotateCcw } from "lucide-react";
import { reorderAction, getCartSummary } from "@/lib/actions/cart";
import { useCartStore } from "@/stores/cart-store";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { maxPerOrderMessage, onlyAvailableMessage } from "@/lib/utils";

/** "Buy again": adds what fits today (limits, stock) and opens the cart with a list of any changes. */
export function ReorderButton({ orderId, size = "sm", variant = "secondary", label = "Buy again", className }: { orderId: string; size?: "sm" | "md"; variant?: "secondary" | "outline" | "primary" | "ghost"; label?: string; className?: string }) {
  const setSummary = useCartStore((s) => s.setSummary); const openDrawer = useCartStore((s) => s.openDrawer); const setNotice = useCartStore((s) => s.setNotice);
  const [busy, setBusy] = React.useState(false);
  return (
    <Button variant={variant} size={size} loading={busy} className={className} onClick={async () => {
      setBusy(true);
      const r = await reorderAction(orderId);
      if (r.ok) {
        setSummary(await getCartSummary());
        // Anything not added exactly as ordered last time is listed in the cart for review.
        const lines = [
          ...(r.data.adjusted ?? []).map((a) => `${a.name}: ${a.added} of ${a.requested} added (${a.reason === "limit" ? maxPerOrderMessage(a.added).toLowerCase() : onlyAvailableMessage(a.added).toLowerCase()})`),
          ...r.data.skipped.map((x) => `${x.name}: not available right now`),
        ];
        setNotice(lines.length ? { title: "Some items changed from your last order", lines } : null);
        toast.success(r.data.added === 1 ? "1 item added to cart" : `${r.data.added} items added to cart`, lines.length ? "Review the changes in your cart." : undefined);
        openDrawer("cart");
      }
      else toast.error(r.error);
      setBusy(false);
    }}><RotateCcw className="h-4 w-4" /> {label}</Button>
  );
}
