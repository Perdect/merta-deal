import type { Metadata } from "next";
import { getCouponStats, getStoreOptions, getAllCategories, spGet, spPage, type SP } from "@/lib/data/admin";
import { listCouponsAdmin, countCoupons, COUPON_TABS } from "@/lib/data/admin-care";
import { CouponWorkspace } from "@/components/admin/coupon-manager";
import { hrefWith } from "@/components/admin/care/shared";

export const metadata: Metadata = { title: "Coupons" };

const nowIso = () => new Date().toISOString();

export default async function AdminCouponsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = spGet(sp, "q");
  const status = (COUPON_TABS as readonly string[]).includes(spGet(sp, "status")) ? spGet(sp, "status") : "";
  const now = nowIso();
  const [list, counts, stats, stores, categories] = await Promise.all([
    listCouponsAdmin({ q, status, page: spPage(sp), nowIso: now }), countCoupons(q, now), getCouponStats(), getStoreOptions(), getAllCategories(),
  ]);
  return (
    <CouponWorkspace coupons={list.items} stats={stats} total={list.total} page={list.page} pageSize={list.pageSize} counts={counts} nowIso={now}
      stores={stores.map((s) => ({ id: s.id, name: s.name }))} categories={categories.filter((c) => !c.parent_id).map((c) => ({ id: c.id, name: c.name }))}
      filtered={Boolean(q || status)} error={list.error} retryHref={hrefWith("/admin/coupons", sp)} />
  );
}
