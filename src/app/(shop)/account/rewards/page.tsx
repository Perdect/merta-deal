import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Star, ShoppingBag, PackageCheck, Coins, Plus, Minus } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getRewards } from "@/lib/data/account";
import { getPublicSettings } from "@/lib/data/catalog";
import { ReferralCard } from "@/components/account/referral-card";
import { PageHeader } from "@/components/ui/misc";
import { SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatNumber, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Rewards", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/rewards");
  const [{ points, referralCode, transactions, referralStats }, settings] = await Promise.all([getRewards(), getPublicSettings()]);
  const per100 = Number(settings.reward_points_per_100 ?? 1) || 1;
  const steps = [
    { icon: <ShoppingBag className="h-4 w-4" />, title: "Shop anything", body: "Every order counts, whether it is COD, UPI or wallet." },
    { icon: <PackageCheck className="h-4 w-4" />, title: "Get it delivered", body: "Points are credited once the rider confirms delivery with your OTP." },
    { icon: <Coins className="h-4 w-4" />, title: `Earn ${per100} point${per100 === 1 ? "" : "s"} per ₹100`, body: "Calculated on the item subtotal (before fees and coupons), rounded down." },
  ];
  return (
    <div className="pt-1">
      <PageHeader title="Rewards" back="/account" />
      <div className="space-y-5 px-4 sm:px-0">
        <section className="rounded-xl bg-gradient-to-br from-saffron-500 to-saffron-600 p-5 text-ink shadow-float">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink/70"><Star className="h-4 w-4" /> Reward points</p>
          <p className="mt-2 font-display text-4xl font-extrabold tabular">{formatNumber(points)}</p>
          <p className="mt-1 text-sm text-ink/80">Cancelled or rejected orders don&apos;t earn points.</p>
        </section>

        <section className="rounded-lg border border-line bg-card p-4 shadow-card">
          <h2 className="text-base font-bold text-ink">How points work</h2>
          <ol className="mt-3 space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">{s.icon}</span>
                <div><p className="text-sm font-semibold text-ink">{s.title}</p><p className="text-xs text-ink-3">{s.body}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <ReferralCard code={referralCode ?? null} stats={referralStats} />

        <section>
          <SectionHeader title="Points history" subtitle="Last 50 entries" className="px-0" />
          {transactions.length === 0 ? (
            <EmptyState icon={<Star className="h-7 w-7" />} title="No points yet" description="Place your first order to start earning." compact />
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-card shadow-card">
              {transactions.map((t) => {
                const gain = Number(t.points) >= 0;
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${gain ? "bg-success-50 text-success" : "bg-danger-50 text-danger"}`}>{gain ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{t.reason}</p>
                      <p className="text-xs text-ink-3">{formatDateTime(t.created_at)}{t.order_id ? <> · <Link href={`/orders/${t.order_id}`} className="font-semibold text-brand-600 hover:underline">View order</Link></> : null}</p>
                    </div>
                    <span className={`text-sm font-bold tabular ${gain ? "text-success" : "text-danger"}`}>{gain ? "+" : "−"}{formatNumber(Math.abs(Number(t.points)))} pts</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
