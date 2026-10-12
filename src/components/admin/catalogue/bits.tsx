import type { ReactNode } from "react";
import { ProductImage } from "@/components/shop/product-image";
import { StatusPill } from "@/components/admin/kit";
import { cn } from "@/lib/utils";

/* Small, server-safe catalogue pieces shared by the products, detail, quick-edit and photo pages. */

/** The one product thumbnail size used across the admin catalogue: 40px, rounded-lg, contain on white. */
export function ProductThumb({ image, name, brand, pack, className }: { image: string | null | undefined; name: string; brand?: string | null; pack?: string | null; className?: string }) {
  return <ProductImage image={image} productName={name} brand={brand} packSize={pack} sizes="40px" rounded="rounded-lg" className={cn("h-10 w-10 shrink-0 border border-line", className)} />;
}

/** Customer visibility of a catalogue product: both flags must be on for customers to see it. */
export function ProductStatusPill({ isActive, isApproved }: { isActive: boolean; isApproved: boolean }) {
  if (!isApproved) return <StatusPill tone="amber">Awaiting approval</StatusPill>;
  if (!isActive) return <StatusPill tone="neutral">Inactive</StatusPill>;
  return <StatusPill tone="green">Active</StatusPill>;
}

/** Stock state of one store offer, in words. */
export function StockPill({ status, isActive, qty }: { status: "in_stock" | "low_stock" | "out_of_stock"; isActive: boolean; qty?: number }) {
  if (!isActive) return <StatusPill tone="neutral">Offer paused</StatusPill>;
  if (status === "out_of_stock") return <StatusPill tone="red">Out of stock</StatusPill>;
  if (status === "low_stock") return <StatusPill tone="amber">{qty != null ? `Low · ${qty}` : "Low stock"}</StatusPill>;
  return <StatusPill tone="green">{qty != null ? `${qty} in stock` : "In stock"}</StatusPill>;
}

/** Kit-styled button classes for links and buttons in catalogue pages. */
export const btn = {
  primary: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60",
  outline: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line-2 bg-card px-3.5 text-sm font-semibold text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50",
  danger: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-danger/30 bg-card px-3.5 text-sm font-semibold text-danger transition-colors duration-150 hover:bg-danger-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-50",
  small: "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-2 bg-card px-2.5 text-xs font-semibold text-ink-2 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-50",
};

/** Plain label + control wrapper for kit forms (SidePanel editors). */
export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {error ? <p className="text-xs font-medium text-danger" role="alert">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const inputCls = "h-10 w-full rounded-lg border border-line-2 bg-card px-3 text-sm text-ink placeholder:text-ink-4 transition-shadow focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger";
