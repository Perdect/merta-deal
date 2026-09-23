import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyStore, getStoreStaff } from "@/lib/data/store";
import { StoreSettingsForm } from "@/components/store/settings-form";
import { StaffManager } from "@/components/store/staff-manager";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function StoreSettingsPage() {
  const [user, membership] = await Promise.all([getSessionUser(), getMyStore()]);
  if (!user) redirect("/login?next=/store/settings");
  if (!membership) redirect("/store/register");
  const { store, role } = membership;
  const staff = await getStoreStaff(store.id);
  const isOwner = role === "owner";
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Hours, packing time and who can run the store." className="px-0" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Operations" /><CardBody><StoreSettingsForm store={store} /></CardBody></Card>
        <Card>
          <CardHeader title="Staff" subtitle="Managers and staff can accept orders and manage stock" />
          <CardBody><StaffManager storeId={store.id} staff={staff.filter((s) => s.is_active)} isOwner={isOwner} owner={isOwner ? { name: user.fullName, email: user.email } : { name: store.owner_name, email: store.email }} /></CardBody>
        </Card>
      </div>
    </div>
  );
}
