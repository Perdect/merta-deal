"use client";
import * as React from "react";
import { Zap, Truck, RotateCcw } from "lucide-react";
import type { ProductDetail } from "@/types/app";
import { useLocationStore } from "@/stores/location-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { resolveOffer } from "./product-offer";
import { formatINR, cn } from "@/lib/utils";
import { site } from "@/config/site";

function useEta() {
  const hydrated = useHydrated();
  const location = useLocationStore((s) => s.location);
  return hydrated && location?.etaMax ? `${location.etaMin}–${location.etaMax} minutes` : site.deliveryWindow;
}

/** "⚡ Get in 20–25 minutes": the zone ETA once a location resolves, else the city-wide setting. */
export function EtaBadge({ className }: { className?: string }) {
  const eta = useEta();
  return <span className={cn("inline-flex items-center gap-1 rounded-md bg-fresh-50 px-2.5 py-1 text-sm text-brand-800", className)}><Zap className="h-4 w-4 fill-fresh text-fresh" /> Get in <b>{eta}</b></span>;
}

function Tile({ icon: Icon, label, sub }: { icon: typeof Truck; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-3 py-3.5 text-center">
      <Icon className="h-7 w-7 text-brand-700" strokeWidth={1.5} />
      <span className="text-sm font-bold text-ink">{label}</span>
      <span className="text-xs text-ink-3">{sub}</span>
    </div>
  );
}

/** Price block (selling price, struck MRP, savings), a divider and the policy tiles. */
export function ProductPurchase({ product, children }: { product: ProductDetail; children?: React.ReactNode }) {
  const offer = React.useMemo(() => resolveOffer(product), [product]);
  const eta = useEta();
  const soldOut = !offer || offer.status === "out_of_stock";
  const lowStock = offer?.status === "low_stock";
  const price = offer?.selling_price ?? product.base_mrp;
  const mrp = offer?.mrp ?? product.base_mrp;
  const off = Math.max(0, mrp - price);

  return (
    <div className="space-y-4">
      <div>
        <span className="inline-flex items-baseline rounded-lg bg-fresh px-[9px] py-[5px] text-white"><span className="text-[20px] font-bold leading-none tabular">{formatINR(price)}</span></span>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 text-[15px] text-ink-3">
          {mrp > price ? <span>MRP <span className="line-through">{formatINR(mrp)}</span></span> : null}
          <span>(incl. of all taxes)</span>
          {off > 0 ? <span className="font-bold text-fresh">{formatINR(off)} OFF</span> : null}
        </p>
        {soldOut ? <p className="mt-3 rounded-md bg-surface-2 p-3 text-sm text-ink-3">Currently unavailable. Check back soon.</p> : null}
        {lowStock && offer ? <p className="mt-2 text-xs font-semibold text-saffron-700">Only {offer.stock_qty} left</p> : null}
      </div>
      {children}
      <div className="border-t border-line" />
      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <Tile icon={RotateCcw} label="Damaged item?" sub="Replace or refund within 24 hrs" />
        <Tile icon={Truck} label="Fast Delivery" sub={`${eta} across ${site.city}`} />
      </div>
    </div>
  );
}
