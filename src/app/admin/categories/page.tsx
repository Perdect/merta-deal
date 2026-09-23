import type { Metadata } from "next";
import { getAllCategories, getCategoryProductCounts } from "@/lib/data/admin";
import { CategoryManager } from "@/components/admin/category-manager";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  const [categories, counts] = await Promise.all([getAllCategories(), getCategoryProductCounts()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Categories" subtitle={`${categories.filter((c) => !c.parent_id).length} top-level · ${categories.filter((c) => c.parent_id).length} subcategories`} className="px-0" />
      <CategoryManager categories={categories} counts={counts} />
    </div>
  );
}
