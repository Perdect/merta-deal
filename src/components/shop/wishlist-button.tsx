"use client";
import * as React from "react";
import { Heart } from "lucide-react";
import { toggleWishlistAction } from "@/lib/actions/account";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function WishlistButton({ productId, initial, className, size = 16 }: { productId: string; initial: boolean; className?: string; size?: number }) {
  const [wished, setWished] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  return (
    <button type="button" aria-pressed={wished} aria-label={wished ? "Remove from wishlist" : "Add to wishlist"} disabled={busy}
      onClick={async () => { setBusy(true); setWished(!wished); const r = await toggleWishlistAction(productId); if (!r.ok) { setWished(wished); toast.error(r.error); } setBusy(false); }}
      className={cn("flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-card transition-transform active:scale-90", className)}>
      <Heart style={{ width: size, height: size }} className={cn(wished ? "fill-danger text-danger" : "text-ink-3")} />
    </button>
  );
}
