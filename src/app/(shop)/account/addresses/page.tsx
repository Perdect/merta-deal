import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyAddresses, getMyProfile } from "@/lib/data/account";
import { AddressList } from "@/components/account/address-list";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "My addresses", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/addresses");
  const [addresses, profile] = await Promise.all([getMyAddresses(), getMyProfile()]);
  return (
    <div className="pt-1">
      <PageHeader title="My addresses" back="/account" subtitle={addresses.length ? `${addresses.length} saved` : "Save addresses for faster checkout"} />
      <div className="px-4 sm:px-0">
        <AddressList initial={addresses} defaultName={profile?.full_name ?? user.fullName} defaultPhone={profile?.phone ?? user.phone} />
      </div>
    </div>
  );
}
