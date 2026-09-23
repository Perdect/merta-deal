"use client";
import * as React from "react";
import { Tabs } from "@/components/ui/tabs";
import { CatalogPicker } from "./catalog-picker";
import { ProductForm } from "./product-form";
import type { CategoryGroup } from "@/lib/data/store";

export function NewProductTabs({ storeId, categories, listedProductIds }: { storeId: string; categories: CategoryGroup[]; listedProductIds: string[] }) {
  const [tab, setTab] = React.useState("catalog");
  return (
    <div className="space-y-4">
      <Tabs variant="pill" className="w-fit" items={[{ value: "catalog", label: "From catalog" }, { value: "new", label: "New product" }]} value={tab} onChange={setTab} />
      {tab === "catalog" ? <CatalogPicker storeId={storeId} listedProductIds={listedProductIds} /> : <ProductForm storeId={storeId} categories={categories} />}
    </div>
  );
}
