import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/data/admin";
import { integrationStatus } from "@/lib/env";
import { SettingsForm, type SettingsGroup } from "@/components/admin/settings-editor";
import { AdminPageHeader, Panel, ErrorBlock, StatusPill } from "@/components/admin/kit";

export const metadata: Metadata = { title: "Settings" };

const GROUP_META: Record<string, { title: string; description: string; order: number }> = {
  general: { title: "Brand and support", description: "Name, tagline, how customers reach you, and your Facebook, Instagram and LinkedIn pages (shown in the footer once filled in).", order: 1 },
  business: { title: "Business", description: "Opening hours, the pickup point riders collect from, and membership.", order: 2 },
  fees: { title: "Fees and taxes", description: "Platform fee and GST on fees.", order: 3 },
  payments: { title: "Payments", description: "Turn cash on delivery and online payments on or off (online also needs Razorpay keys).", order: 4 },
  delivery: { title: "Delivery", description: "Fallback fees, ETAs, scheduled slots, dispatch and rider pay. Zones can override these per area.", order: 5 },
  orders: { title: "Orders", description: "Automatic confirmation, the active-order capacity limit, scan-only handover, the customer approval window for unavailable items, per-product limits and OTP attempts.", order: 6 },
  alerts: { title: "Order alerts", description: "How long a new order rings, reminder and escalation times for unaccepted orders, and the no-rider alert. Sound and push are enabled per device under Notifications.", order: 7 },
  rewards: { title: "Rewards", description: "Loyalty points.", order: 8 },
  finance: { title: "Finance", description: "Packaging and gateway fee estimates for the profit report, and who may see purchase costs.", order: 8.5 },
  marketing: { title: "Marketing and QR links", description: "Editable short links behind printed QR codes.", order: 9 },
};
const titleCase = (g: string) => g.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  const groups: SettingsGroup[] = [...new Set(settings.map((s) => s.group))]
    .sort((a, b) => (GROUP_META[a]?.order ?? 99) - (GROUP_META[b]?.order ?? 99) || a.localeCompare(b))
    .map((g) => ({ id: g, title: GROUP_META[g]?.title ?? titleCase(g), description: GROUP_META[g]?.description, settings: settings.filter((s) => s.group === g) }));
  const integrations = integrationStatus();

  const aside = (
    <Panel title="Integrations" description="Read-only. Set the environment variables and redeploy." actions={<Link href="/setup" className="text-xs font-semibold text-brand-700 hover:underline">Setup guide</Link>} flush>
      <ul className="divide-y divide-line border-t border-line">
        {integrations.map((i) => (
          <li key={i.key} className="px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">{i.label}</p>
              <StatusPill tone={i.configured ? "green" : "neutral"}>{i.configured ? "Connected" : "Not set up"}</StatusPill>
            </div>
            <p className="mt-0.5 text-xs text-ink-3">{i.note}</p>
            {!i.configured ? <p className="mt-1.5 flex flex-wrap gap-1">{i.envVars.map((v) => <code key={v} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">{v}</code>)}</p> : null}
          </li>
        ))}
      </ul>
    </Panel>
  );

  return (
    <>
      <AdminPageHeader title="Settings" description="Business rules live here, not in code. Changes apply from the next cart calculation and every change is audited." />
      {groups.length ? <SettingsForm groups={groups} aside={aside} /> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <ErrorBlock title="No settings found" description="The settings table is empty or couldn't be read. Run the database migrations and seed, then retry." retryHref="/admin/settings" />
          {aside}
        </div>
      )}
    </>
  );
}
