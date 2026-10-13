"use client";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { CartIssue, CartLine } from "@/types/app";
import { ProductImage } from "./product-image";
import { QuantityStepper, Price } from "@/components/ui/misc";
import { packLimit } from "@/lib/cart-sync";
import { useCartStore } from "@/stores/cart-store";
import { cn, formatINR } from "@/lib/utils";

/** One cart line (full /cart page). Quantity = packs; limits and problems are explained inline. */
export function CartItem({ line, onQty, issue }: { line: CartLine; onQty: (inventoryId: string, qty: number) => void; issue?: CartIssue }) {
  const pending = useCartStore((s) => s.pending[line.inventory_id]);
  const qty = pending ?? line.quantity;
  const lim = packLimit(line.max_order_qty, line.stock_qty);
  const note = issue
    ? issue.reason === "unavailable" ? "No longer available. Remove it to continue."
      : issue.reason === "stock" ? (issue.available_qty > 0 ? `Only ${issue.available_qty} available. Reduce the quantity to continue.` : "Sold out. Remove it to continue.")
      : `${lim.message}. Reduce the quantity to continue.`
    : null;
  return (
    <li className={cn("flex gap-3 py-3", issue && "opacity-90")}>
      <Link href={`/p/${line.slug}`} className="shrink-0"><ProductImage image={line.image_url} brand={line.brand_name} productName={line.name} packSize={line.pack_label} className="h-18 w-18 rounded-md" sizes="72px" /></Link>
      <div className="min-w-0 flex-1">
        <Link href={`/p/${line.slug}`} className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{line.name}</Link>
        <p className="text-xs text-ink-3">{line.brand_name ? `${line.brand_name} · ` : ""}{line.pack_label ? `${line.pack_label} pack` : "1 pack"}</p>
        {note ? <p className="mt-0.5 text-xs font-semibold text-danger" role="status">{note}</p>
          : qty >= lim.max ? <p className="mt-0.5 text-xs font-medium text-saffron-700">{lim.message}</p> : null}
        {line.price_changed && line.price_at_add != null ? <p className="mt-0.5 text-xs font-medium text-info">Price changed from {formatINR(line.price_at_add)} to {formatINR(line.unit_price)}</p> : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <Price price={line.unit_price} mrp={line.unit_mrp} size="sm" />
          <div className="flex items-center gap-2">
            <QuantityStepper value={qty} onChange={(v) => onQty(line.inventory_id, v)} min={0} max={issue ? Math.min(qty, lim.max) : lim.max} maxLabel={lim.message} size="sm" loading={pending != null} />
            <button type="button" aria-label="Remove" onClick={() => onQty(line.inventory_id, 0)} className="tap flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-danger-50 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </li>
  );
}
