"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Plus, Box, Pencil } from "lucide-react";
import { Input, Select, Switch } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, DiscountBadge, VegMark } from "@/components/ui/badge";
import { Pagination, Price } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Chip } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { ProductImage } from "@/components/shop/product-image";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { toggleInventoryActiveAction } from "@/lib/actions/store";
import { INVENTORY_STATUS_META } from "./constants";
import type { CategoryGroup, StoreInventoryRow } from "@/lib/data/store";
import { cn, discountPct } from "@/lib/utils";
import type { Enums } from "@/types/database";

const STATUS_FILTERS: { value: Enums<"inventory_status"> | ""; label: string }[] = [{ value: "", label: "All" }, { value: "in_stock", label: "In stock" }, { value: "low_stock", label: "Low stock" }, { value: "out_of_stock", label: "Out of stock" }];

/** Inventory listing with URL-driven search / status / category filters and 24-per-page pagination. */
export function ProductList({ items, total, page, pageSize, filter, categories }: { items: StoreInventoryRow[]; total: number; page: number; pageSize: number; filter: { q: string; status: string; categoryId: string }; categories: CategoryGroup[] }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [q, setQ] = React.useState(filter.q);
  const dq = useDebouncedValue(q, 350);
  const go = React.useCallback((patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === "" || (k === "page" && Number(v) <= 1)) next.delete(k); else next.set(k, String(v)); }
    router.push(`${pathname}?${next.toString()}`);
  }, [router, pathname, sp]);
  React.useEffect(() => { if (dq !== filter.q) go({ q: dq, page: undefined }); }, [dq, filter.q, go]);

  const catOptions = categories.flatMap((g) => g.children.map((c) => ({ value: c.id, label: `${g.parent.name} › ${c.name}` })));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input placeholder="Search your products" value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<Search className="h-4 w-4" />} wrapperClassName="flex-1" aria-label="Search products" />
        <Select options={catOptions} placeholder="All categories" value={filter.categoryId} onChange={(e) => go({ category: e.target.value, page: undefined })} aria-label="Category" className="sm:w-60" />
        <Button href="/store/products/new" className="shrink-0"><Plus className="h-4 w-4" /> Add product</Button>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">{STATUS_FILTERS.map((s) => <Chip key={s.value} active={filter.status === s.value} onClick={() => go({ status: s.value, page: undefined })}>{s.label}</Chip>)}</div>

      {items.length === 0 ? (
        <EmptyState icon={<Box className="h-7 w-7" />} title={filter.q || filter.status || filter.categoryId ? "No products match" : "No products yet"} description={filter.q || filter.status || filter.categoryId ? "Try a different search or clear the filters." : "Add your first product or pick from the Merta Deal catalog to start selling."} action={<Button href="/store/products/new"><Plus className="h-4 w-4" /> Add product</Button>} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => <ProductCardRow key={it.id} item={it} />)}
        </ul>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onChange={(p) => go({ page: p })} />
    </div>
  );
}

function ProductCardRow({ item }: { item: StoreInventoryRow }) {
  const router = useRouter();
  const [active, setActive] = React.useState(item.is_active);
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState(item.is_active);
  if (seen !== item.is_active) { setSeen(item.is_active); setActive(item.is_active); }
  const p = item.product; const meta = INVENTORY_STATUS_META[item.status];
  const pct = discountPct(Number(item.mrp), Number(item.selling_price));
  const toggle = async (v: boolean) => {
    setActive(v); setBusy(true);
    const r = await toggleInventoryActiveAction(item.id, v);
    setBusy(false);
    if (!r.ok) { setActive(!v); toast.error(r.error); return; }
    router.refresh();
  };
  return (
    <li className={cn("flex gap-3 rounded-lg border border-line bg-card p-3 shadow-card", !active && "opacity-70")}>
      <Link href={`/store/products/${item.id}`} className="shrink-0"><ProductImage image={p.image_url} productName={p.name} packSize={p.pack_label} className="h-20 w-20 rounded-md" sizes="80px" /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/store/products/${item.id}`} className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] text-ink-3"><VegMark veg={p.is_veg} />{p.brand?.name ?? "No brand"}{p.is_local ? <Badge tone="saffron" size="xs">Local</Badge> : null}</p>
            <p className="line-clamp-2 text-sm font-semibold text-ink">{p.name}</p>
            <p className="text-xs text-ink-3">{p.pack_label ?? `${p.weight_value} ${p.weight_unit}`}{p.category ? ` · ${p.category.name}` : ""}</p>
          </Link>
          <Link href={`/store/products/${item.id}`} aria-label="Edit" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2"><Pencil className="h-4 w-4" /></Link>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2"><Price price={item.selling_price} mrp={item.mrp} size="sm" /><DiscountBadge pct={pct} /></span>
          <span className="flex items-center gap-2"><Badge tone={meta.tone} size="xs">{meta.label} · {item.stock_qty}</Badge><Switch checked={active} onChange={toggle} disabled={busy} /></span>
        </div>
      </div>
    </li>
  );
}
