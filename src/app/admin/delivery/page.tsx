import type { Metadata } from "next";
import { getCities, getZones, getSettings } from "@/lib/data/admin";
import { CitiesManager, ZoneManager, type ZoneDefaults } from "@/components/admin/zone-manager";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { AdminPageHeader, Panel } from "@/components/admin/kit";

export const metadata: Metadata = { title: "Delivery zones" };

export default async function AdminDeliveryPage() {
  const [cities, zones, settings] = await Promise.all([getCities(), getZones(), getSettings("delivery")]);
  const num = (key: string) => { const v = settings.find((s) => s.key === key)?.value; return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null; };
  const defaults: ZoneDefaults = {
    delivery_fee: num("delivery_fee_base"), min_order_amount: num("min_order_amount"), free_delivery_threshold: num("free_delivery_threshold"),
    eta_min_minutes: num("delivery_eta_min_minutes"), eta_max_minutes: num("delivery_eta_max_minutes"),
  };

  return (
    <>
      <AdminPageHeader title="Delivery zones" description="Where Merta Deal delivers and what it costs. Zones decide serviceability by pincode and radius; delivery settings are the fallbacks." />
      <div className="space-y-4">
        <Panel title="Cities" description="Only live cities accept orders. Cities that aren't live show their launch note to customers." flush>
          <CitiesManager cities={cities} />
        </Panel>

        <ZoneManager zones={zones} cities={cities} defaults={defaults} />

        <SettingsEditor settings={settings} title="Delivery settings" description="Platform-wide fees, ETAs, dispatch and rider pay. A zone's own fee, minimum and ETA take priority where set." />
      </div>
    </>
  );
}
