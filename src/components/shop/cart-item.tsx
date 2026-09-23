"use client";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { CartLine } from "@/types/app";
import { ProductImage } from "./product-image";
import { QuantityStepper, Price } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function CartItem({ line, onQty, busy }: { line: CartLine; onQty: (inventoryId: string, qty: number) => void; busy?: boolean }) {
  return (
    <li className={cn("flex gap-3 py-3", !line.available && "opacity-70")}>
      <Link href={`/p/${line.slug}`} className="shrink-0"><ProductImage image={line.image_url} brand={line.brand_name} productName={line.name} packSize={line.pack_label} className="h-18 w-18 rounded-md" sizes="72px" /></Link>
      <div className="min-w-0 flex-1">
        <Link href={`/p/${line.slug}`} className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{line.name}</Link>
        <p className="text-xs text-ink-3">{line.brand_name ? `${line.brand_name} · ` : ""}{line.pack_label}</p>
        {!line.available ? <p className="mt-0.5 text-xs font-semibold text-danger">Only {line.stock_qty} available — reduce quantity</p> : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <Price price={line.unit_price} mrp={line.unit_mrp} size="sm" />
          <div className="flex items-center gap-2">
            <QuantityStepper value={line.quantity} onChange={(v) => onQty(line.inventory_id, v)} min={0} max={Math.min(line.max_order_qty, Math.max(line.stock_qty, 0))} size="sm" loading={busy} />
            <button type="button" aria-label="Remove" onClick={() => onQty(line.inventory_id, 0)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-danger-50 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </li>
  );
}
