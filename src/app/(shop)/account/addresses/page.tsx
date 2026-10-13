import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyAddresses, getMyProfile } from "@/lib/data/account";
import { AccountSection } from "@/components/account/account-section";
import { AddressList } from "@/components/account/address-list";

export const metadata: Metadata = { title: "Saved addresses", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AddressesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(isNew ? "/account/addresses?new=1" : "/account/addresses")}`);
  const [addresses, profile] = await Promise.all([getMyAddresses(), getMyProfile()]);
  return (
    <AccountSection title="Addresses">
      <AddressList initial={addresses} defaultName={profile?.full_name ?? user.fullName} defaultPhone={profile?.phone ?? user.phone} openNew={isNew === "1"} />
    </AccountSection>
  );
}
