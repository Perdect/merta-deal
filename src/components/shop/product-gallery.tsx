"use client";
import * as React from "react";
import { ProductImage } from "./product-image";
import { cn } from "@/lib/utils";

export function ProductGallery({ images, name, brand, packSize }: { images: string[]; name: string; brand?: string | null; packSize?: string | null }) {
  const [active, setActive] = React.useState(0);
  const list = images.length ? images : [null];
  return (
    <div>
      <ProductImage image={list[active]} brand={brand} productName={name} packSize={packSize} className="aspect-square w-full rounded-xl border border-line" sizes="(max-width: 768px) 100vw, 480px" priority />
      {list.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {list.map((src, i) => (
            <button key={i} type="button" onClick={() => setActive(i)} aria-label={`Image ${i + 1}`} className={cn("h-16 w-16 shrink-0 overflow-hidden rounded-md border-2", i === active ? "border-brand-600" : "border-line")}>
              <ProductImage image={src} brand={brand} productName={name} className="h-full w-full" sizes="64px" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
