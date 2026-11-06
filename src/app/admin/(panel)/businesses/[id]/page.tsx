import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPageHeader, StatusText } from "@/components/admin/kit";
import { BusinessEditor } from "@/components/admin/directory/business-editor";
import { MenuEditor } from "@/components/admin/directory/menu-editor";
import { adminGetBusiness } from "@/lib/data/directory";

export const metadata: Metadata = { title: "Business profile" };

export default async function AdminBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "new") return <><AdminPageHeader title="Add business" back="/admin/businesses" /><BusinessEditor /></>;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { business, menu } = await adminGetBusiness(id);
  if (!business) notFound();
  return (
    <>
      <AdminPageHeader title={business.name} back="/admin/businesses" meta={<StatusText value={business.status} />} />
      <div className="space-y-4"><BusinessEditor business={business} /><MenuEditor businessId={business.id} items={menu} /></div>
    </>
  );
}
