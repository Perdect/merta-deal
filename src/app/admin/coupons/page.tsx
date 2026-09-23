import type { Metadata } from "next";
import { listCoupons, getCouponStats, getStoreOptions, getAllCategories, spGet, spPage, type SP } from "@/lib/data/admin";
import { CouponManager } from "@/components/admin/coupon-manager";
import { ListToolbar, ListPagination } from "@/components/admin/list-controls";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Coupons" };

export default async function AdminCouponsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [{ items, total, page, pageSize }, stats, stores, categories] = await Promise.all([
    listCoupons({ q: spGet(sp, "q"), status: spGet(sp, "status"), page: spPage(sp) }), getCouponStats(), getStoreOptions(), getAllCategories(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Coupons" subtitle={`${total} coupons`} className="px-0" />
      <ListToolbar searchPlaceholder="Code or title" filters={[{ key: "status", label: "Status", placeholder: "Any status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "expired", label: "Expired" }] }]} />
      <CouponManager coupons={items} stats={stats} stores={stores.map((s) => ({ id: s.id, name: s.name }))} categories={categories.filter((c) => !c.parent_id).map((c) => ({ id: c.id, name: c.name }))} />
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
