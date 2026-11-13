import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Warehouse } from "lucide-react";
import { AppBar } from "@/components/shop/app-bar";
import { BulkOrderBuilder } from "@/components/wholesale/bulk-order-builder";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { getWholesaleCatalogue, getMyWholesale } from "@/lib/data/wholesale";
import { getMyAddresses } from "@/lib/data/account";
import { getPublicSettings } from "@/lib/data/catalog";
import { getSessionUser } from "@/lib/supabase/server";
import { dateKey } from "@/lib/wholesale";
import { site } from "@/config/site";

const title = `Create a bulk order | Wholesale in ${site.city}`;
export const metadata: Metadata = { title, description: `Build one bulk grocery order for your home, shop, hostel or office in ${site.city}. Pick full cases or write in what you need and we send a quote.`, robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

/**
 * The bulk order builder. Signing in is required because a wholesale order is tied to a buyer row and a
 * saved address; guests are sent to the wholesale page, which explains the flow and offers sign-in.
 */
export default async function WholesaleOrderPage() {
  // Read the clock once, before rendering: the date window is data, not something computed in JSX.
  const now = new Date();
  const today = dateKey(now);
  const maxDate = dateKey(new Date(now.getTime() + 30 * 86400000));
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/wholesale/order");
  const [cat, mine, addresses, settings] = await Promise.all([
    getWholesaleCatalogue({ signedIn: true }), getMyWholesale(), getMyAddresses(), getPublicSettings(),
  ]);
  const enabled = settings.wholesale_enabled !== false;
  const paused = mine.shop?.status === "suspended";
  // my_kirana_shop only reports this once migration 0053 is applied; without it the new RPCs do not exist.
  const bulkInstalled = mine.settings?.max_request_lines != null;

  return (
    <div className="px-4 pb-28 pt-1 sm:px-0">
      <AppBar title="Create a bulk order" back="/wholesale" className="-mt-1" />
      {!enabled || !cat.installed ? (
        <EmptyState icon={<Warehouse className="h-7 w-7" />} title="Wholesale ordering is closed right now"
          description="Call us and we will take your list over the phone." action={<Button href={`tel:${site.supportPhone.replace(/\s/g, "")}`}>Call {site.supportPhone}</Button>} />
      ) : !bulkInstalled ? (
        <EmptyState icon={<Warehouse className="h-7 w-7" />} title="Bulk orders aren't switched on yet"
          description="Migration 0053 hasn't been applied to this database. Until it is, order full cases from the wholesale range or call us with your list."
          action={<div className="flex flex-wrap justify-center gap-2"><Button href="/wholesale#range">Browse the range</Button><Button href={`tel:${site.supportPhone.replace(/\s/g, "")}`} variant="outline">Call {site.supportPhone}</Button></div>} />
      ) : paused ? (
        <EmptyState icon={<Warehouse className="h-7 w-7" />} title="Wholesale ordering is paused for your account"
          description={mine.shop?.review_note ?? "Call us to resume it."} action={<Button href={`tel:${site.supportPhone.replace(/\s/g, "")}`}>Call {site.supportPhone}</Button>} />
      ) : (
        <>
          <p className="mb-3 mt-1 text-sm text-ink-2">Pick full cases from the range, write in anything we don&apos;t list, and send it as one order. We confirm stock and price before anything is packed.</p>
          <BulkOrderBuilder catalogue={cat.items} addresses={addresses} userId={user.id}
            today={today} maxDate={maxDate}
            settings={mine.settings ?? { min_order_amount: Number(settings.wholesale_min_order_amount ?? 0) || 0, delivery_fee: Number(settings.wholesale_delivery_fee ?? 0) || 0, lead_days: 2 }}
            defaultName={mine.shop?.owner_name ?? user.fullName} defaultPhone={mine.shop?.phone ?? user.phone} defaultAddressId={mine.shop?.address_id ?? null} />
        </>
      )}
    </div>
  );
}
