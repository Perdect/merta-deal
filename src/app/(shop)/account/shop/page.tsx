import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyShop, getWholesaleCatalogue } from "@/lib/data/wholesale";
import { ShopDashboard } from "@/components/wholesale/shop-dashboard";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "My shop", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MyShopPage() {
  const user = await getSessionUser();
  if (!user) return null; // the account layout shows the login prompt
  const [mine, cat] = await Promise.all([getMyShop(), getWholesaleCatalogue({ signedIn: true })]);
  return (
    <div className="pt-1">
      <PageHeader title="My shop" back="/account" />
      <div className="px-4 sm:px-0">
        {!mine.installed ? <EmptyState icon={<Store className="h-7 w-7" />} title="Wholesale isn't switched on yet" description="Migration 0045 has not been applied to this database." compact />
          : !mine.shop ? (
            <EmptyState icon={<Store className="h-7 w-7" />} title="Run a kirana shop?" description="Register it to order wholesale packs and cases every month. You review and approve each order before it is placed, and pay on delivery."
              action={<div className="flex flex-col items-center gap-2"><Button href="/wholesale/register">Register your shop</Button><Link href="/wholesale" className="text-sm font-semibold text-brand-700">How wholesale works</Link></div>} />
          ) : <ShopDashboard data={mine} catalogue={cat.items} />}
      </div>
    </div>
  );
}
