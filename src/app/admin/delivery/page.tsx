import type { Metadata } from "next";
import { getCities, getZones, getSettings } from "@/lib/data/admin";
import { CitiesManager, ZoneManager } from "@/components/admin/zone-manager";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { PageHeader } from "@/components/ui/misc";
import { SectionHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Delivery" };

export default async function AdminDeliveryPage() {
  const [cities, zones, settings] = await Promise.all([getCities(), getZones(), getSettings("delivery")]);
  return (
    <div className="space-y-6">
      <PageHeader title="Delivery" subtitle="Where Merta Deal delivers and what it costs. Zones decide serviceability by pincode + radius; settings are the fallbacks." className="px-0" />
      <section>
        <SectionHeader title="Cities" subtitle="Only active cities accept orders. Inactive ones show the launch note." className="px-0" />
        <CitiesManager cities={cities} />
      </section>
      <section>
        <SectionHeader title="Delivery zones" subtitle={`${zones.filter((z) => z.is_active).length} active of ${zones.length}`} className="px-0" />
        <ZoneManager zones={zones} cities={cities} />
      </section>
      <section>
        <SectionHeader title="Delivery settings" subtitle="Platform-wide fees, ETAs, dispatch and rider pay. Zone values override fees/thresholds where set." className="px-0" />
        <SettingsEditor settings={settings} />
      </section>
    </div>
  );
}
