import type { Metadata } from "next";
import { spGet, type SP } from "@/lib/data/admin";
import { getCategoriesWithCounts, type CategoryRow } from "@/lib/data/admin-catalogue";
import { CategoryManager, type CategoryListRow } from "@/components/admin/category-manager";
import { AdminPageHeader, ErrorBlock, ListToolbar, StatusTabs } from "@/components/admin/kit";

export const metadata: Metadata = { title: "Categories" };

const TABS = [
  { value: "", label: "All" },
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "featured", label: "Featured" },
];

const matchesStatus = (c: CategoryRow, s: string) => (s === "visible" ? c.is_active : s === "hidden" ? !c.is_active : s === "featured" ? c.is_featured : true);

export default async function AdminCategoriesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { categories, counts, error } = await getCategoriesWithCounts();
  const q = spGet(sp, "q").trim().toLowerCase();
  const status = TABS.some((t) => t.value === spGet(sp, "status")) ? spGet(sp, "status") : "";
  const level = spGet(sp, "level");
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();

  if (error) {
    return (
      <>
        <AdminPageHeader title="Categories" />
        <ErrorBlock title="Couldn't load categories" description={error} retryHref={`/admin/categories${qs ? `?${qs}` : ""}`} />
      </>
    );
  }

  // The table is small (a two-level tree), so it is filtered here on the server, with real tab counts.
  const base = categories.filter((c) => (!q || c.name.toLowerCase().includes(q) || c.slug.includes(q)) && (level === "top" ? !c.parent_id : level === "sub" ? Boolean(c.parent_id) : true));
  const tabCounts = Object.fromEntries(TABS.map((t) => [t.value, base.filter((c) => matchesStatus(c, t.value)).length]));
  const filtered = Boolean(q || status || level);
  const matching = base.filter((c) => matchesStatus(c, status));
  const rows: CategoryListRow[] = filtered
    ? matching.map((c) => ({ cat: c, depth: c.parent_id ? 1 : 0 }))
    : categories.filter((c) => !c.parent_id).flatMap((p) => [{ cat: p, depth: 0 as const }, ...categories.filter((c) => c.parent_id === p.id).map((c) => ({ cat: c, depth: 1 as const }))]);
  // Subcategories whose parent no longer exists would vanish from the tree; list them at the end.
  const orphans = filtered ? [] : categories.filter((c) => c.parent_id && !categories.some((p) => p.id === c.parent_id)).map((c) => ({ cat: c, depth: 0 as const }));

  return (
    <CategoryManager categories={categories} counts={counts} rows={[...rows, ...orphans]} filtered={filtered}
      toolbar={<>
        <StatusTabs items={TABS.map((t) => ({ ...t, count: tabCounts[t.value] }))} />
        <ListToolbar searchPlaceholder="Category name or slug" filters={[{ key: "level", label: "Level", anyLabel: "All levels", options: [{ value: "top", label: "Top-level" }, { value: "sub", label: "Subcategories" }] }]} />
      </>} />
  );
}
