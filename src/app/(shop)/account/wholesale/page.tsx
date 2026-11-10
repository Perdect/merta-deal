import type { Metadata } from "next";
import { Warehouse } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyWholesale, getWholesaleCatalogue } from "@/lib/data/wholesale";
import { ShopDashboard } from "@/components/wholesale/shop-dashboard";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Wholesale", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Account → Wholesale: the customer's wholesale orders, the optional monthly list and delivery details. */
export default async function MyWholesalePage() {
  const user = await getSessionUser();
  if (!user) return null; // the account layout shows the login prompt
  const [mine, cat] = await Promise.all([getMyWholesale(), getWholesaleCatalogue({ signedIn: true })]);
  return (
    <div className="pt-1">
      <PageHeader title="Wholesale" back="/account" />
      <div className="px-4 sm:px-0">
        {!mine.installed ? <EmptyState icon={<Warehouse className="h-7 w-7" />} title="Wholesale isn't switched on yet" description="Migration 0045 has not been applied to this database." compact />
          : <ShopDashboard data={mine} catalogue={cat.items} />}
      </div>
    </div>
  );
}
