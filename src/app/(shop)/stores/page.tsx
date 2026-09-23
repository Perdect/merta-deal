import type { Metadata } from "next";
import { getNearbyStores } from "@/lib/data/catalog";
import { StoreCard } from "@/components/shop/store-card";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { site } from "@/config/site";

export const metadata: Metadata = { title: `Kirana stores in ${site.city}`, description: `Order online from neighbourhood kirana stores across ${site.city}: Sadar Bazaar, Station Road, Nagaur Road, Jodhpur Road and more.`, alternates: { canonical: "/stores" } };
export const revalidate = 120;

export default async function StoresPage() {
  const stores = await getNearbyStores(site.center.lat, site.center.lng, 25, 50);
  return (
    <div className="px-4 pt-1 sm:px-0">
      <PageHeader title="Kirana stores near you" subtitle={`${stores.length} stores delivering in ${site.city}`} className="px-0" />
      {stores.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{stores.map((s) => <StoreCard key={s.id} store={s} />)}</div> : <EmptyState title="No stores yet" description="We are onboarding kirana stores in your area." />}
    </div>
  );
}
