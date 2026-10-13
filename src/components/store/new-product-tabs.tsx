"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { CatalogPicker } from "./catalog-picker";
import { ProductForm } from "./product-form";
import type { CategoryGroup } from "@/lib/data/store";

/** Add product: full-screen on phones (own header; store tabs hidden), catalog pick or a new listing. */
export function NewProductTabs({ storeId, categories, listedProductIds, backHref = "/store/products" }: { storeId: string; categories: CategoryGroup[]; listedProductIds: string[]; backHref?: string }) {
  const [tab, setTab] = React.useState("catalog");
  return (
    <div className="max-lg:-mx-4 max-lg:-mt-4">
      <div className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line bg-card px-2 lg:hidden" style={{ paddingTop: "var(--safe-top)" }}>
        {/* A link (not a button) so the form's unsaved-changes guard can intercept it. */}
        <Link href={backHref} aria-label="Back to products" className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600"><ArrowLeft className="h-5 w-5" aria-hidden /></Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold text-ink">Add product</h1>
      </div>
      <div className="space-y-4 max-lg:px-4 max-lg:pt-4">
        <div className="hidden items-center gap-3 lg:flex">
          <Link href={backHref} className="inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand-600"><ArrowLeft className="h-4 w-4" aria-hidden /> Products</Link>
          <h1 className="font-display text-2xl font-extrabold text-ink">Add product</h1>
        </div>
        <p className="text-sm text-ink-3">Pick from the shared Merta Deal catalog (fastest), or create your own listing.</p>
        <Tabs variant="pill" className="w-fit" items={[{ value: "catalog", label: "From catalog" }, { value: "new", label: "New product" }]} value={tab} onChange={setTab} />
        {tab === "catalog" ? <CatalogPicker storeId={storeId} listedProductIds={listedProductIds} /> : <ProductForm storeId={storeId} categories={categories} backHref={backHref} embedded />}
      </div>
    </div>
  );
}
