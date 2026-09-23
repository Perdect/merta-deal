import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Ticket, BadgePercent } from "lucide-react";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { getAvailableCoupons } from "@/lib/data/account";
import { CouponCard } from "@/components/account/coupon-card";
import { PageHeader } from "@/components/ui/misc";
import { SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatINR, formatDateTime } from "@/lib/utils";
import type { Coupon } from "@/types/app";

export const metadata: Metadata = { title: "Coupons & offers", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Live, started, not exhausted — capped at 50. */
function activeCoupons(all: Coupon[]) {
  const now = Date.now();
  return all.filter((c) => new Date(c.starts_at).getTime() <= now && (!c.expires_at || new Date(c.expires_at).getTime() > now) && (c.usage_limit == null || c.used_count < c.usage_limit)).slice(0, 50);
}

export default async function CouponsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/coupons");
  const supabase = await createClient();
  const [all, { data: usage }] = await Promise.all([
    getAvailableCoupons(),
    supabase.from("coupon_usage").select("id, discount_amount, created_at, order_id, coupon:coupons(code, title)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const coupons = activeCoupons(all);
  const used = usage ?? [];

  return (
    <div className="pt-1">
      <PageHeader title="Coupons & offers" back="/account" subtitle="Apply a code in your cart or at checkout" />
      <div className="space-y-6 px-4 sm:px-0">
        <section>
          <SectionHeader title="Available now" subtitle={coupons.length ? `${coupons.length} offer${coupons.length === 1 ? "" : "s"} for you` : undefined} className="px-0" />
          {coupons.length === 0 ? (
            <EmptyState icon={<BadgePercent className="h-7 w-7" />} title="No active coupons" description="New offers appear here as soon as they go live. Check back around festivals." compact />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">{coupons.map((c) => <li key={c.id}><CouponCard coupon={c} /></li>)}</ul>
          )}
        </section>
        <section>
          <SectionHeader title="Used coupons" subtitle="Savings you've already claimed" className="px-0" />
          {used.length === 0 ? (
            <EmptyState icon={<Ticket className="h-7 w-7" />} title="No coupons used yet" compact />
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-card shadow-card">
              {used.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-50 text-success"><Ticket className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink"><code className="rounded-xs bg-surface-2 px-1.5 py-0.5 text-xs">{u.coupon?.code ?? "—"}</code> {u.coupon?.title}</p>
                    <p className="text-xs text-ink-3">{formatDateTime(u.created_at)} · <Link href={`/orders/${u.order_id}`} className="font-semibold text-brand-600 hover:underline">View order</Link></p>
                  </div>
                  <span className="text-sm font-bold text-success">−{formatINR(u.discount_amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
