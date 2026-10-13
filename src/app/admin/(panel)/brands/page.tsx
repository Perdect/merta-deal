import type { Metadata } from "next";
import { spGet, spPage, type SP } from "@/lib/data/admin";
import { listCatalogueBrands } from "@/lib/data/admin-catalogue";
import { BrandManager } from "@/components/admin/brand-manager";
import { AdminPageHeader, ErrorBlock, ListToolbar, StatusTabs, ListPagination } from "@/components/admin/kit";

export const metadata: Metadata = { title: "Brands" };

const TABS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default async function AdminBrandsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.value === spGet(sp, "status")) ? spGet(sp, "status") : "";
  const q = spGet(sp, "q");
  const { items, total, page, pageSize, error, counts } = await listCatalogueBrands({ q, status, page: spPage(sp) });
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();

  if (error) {
    return (
      <>
        <AdminPageHeader title="Brands" />
        <ErrorBlock title="Couldn't load brands" description={`${error}. Your search is kept; try again.`} retryHref={`/admin/brands${qs ? `?${qs}` : ""}`} />
      </>
    );
  }

  return (
    <BrandManager rows={items} filtered={Boolean(q || status)}
      toolbar={<>
        <StatusTabs items={TABS.map((t) => ({ ...t, count: counts[t.value] ?? null }))} />
        <ListToolbar searchPlaceholder="Brand name or slug" />
      </>}
      footer={<ListPagination page={page} pageSize={pageSize} total={total} />} />
  );
}
