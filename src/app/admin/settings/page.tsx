import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { getSettings } from "@/lib/data/admin";
import { integrationStatus } from "@/lib/env";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

const GROUP_META: Record<string, { title: string; description: string; order: number }> = {
  general: { title: "Brand & support", description: "Name, tagline and how customers reach you.", order: 1 },
  business: { title: "Business", description: "Default commission and membership.", order: 2 },
  fees: { title: "Fees & taxes", description: "Platform fee and GST on fees.", order: 3 },
  payments: { title: "Payments", description: "Toggle COD and online payments (online also needs Razorpay keys).", order: 4 },
  delivery: { title: "Delivery", description: "Fallback fees, ETAs, scheduled slots, dispatch and rider pay. Zones can override per area.", order: 5 },
  orders: { title: "Orders", description: "Acceptance window and OTP attempts.", order: 6 },
  rewards: { title: "Rewards", description: "Loyalty points.", order: 7 },
  catalog: { title: "Catalogue", description: "Store-created product approval.", order: 8 },
  marketing: { title: "Marketing & QR links", description: "Editable short links behind printed QR codes.", order: 9 },
};

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  const groups = [...new Set(settings.map((s) => s.group))].sort((a, b) => (GROUP_META[a]?.order ?? 99) - (GROUP_META[b]?.order ?? 99));
  const integrations = integrationStatus();
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Business rules live here, not in code. Changes apply to the next cart calculation and are audited." className="px-0" />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {groups.map((g) => <SettingsEditor key={g} settings={settings.filter((s) => s.group === g)} title={GROUP_META[g]?.title ?? g} description={GROUP_META[g]?.description} />)}
        </div>
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader title="Integrations" subtitle="Read-only. Set env vars and redeploy." action={<Link href="/setup" className="text-xs font-semibold text-brand-700">Setup page</Link>} />
            <CardBody>
              <ul className="space-y-3">
                {integrations.map((i) => (
                  <li key={i.key} className="flex items-start gap-2 text-sm">
                    {i.configured ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />}
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{i.label} <span className={cn("ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold", i.configured ? "bg-success text-white" : "bg-surface-2 text-ink-3")}>{i.configured ? "LIVE" : "NOT SET"}</span></p>
                      <p className="text-xs text-ink-3">{i.note}</p>
                      {!i.configured ? <p className="mt-1 flex flex-wrap gap-1">{i.envVars.map((v) => <code key={v} className="rounded-xs bg-surface-2 px-1 py-0.5 text-[10px] text-ink-2">{v}</code>)}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
