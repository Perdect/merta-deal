import type { Metadata } from "next";
import Link from "next/link";
import { Wallet, ArrowDownLeft, ArrowUpRight, RotateCcw, Sparkles } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getWallet } from "@/lib/data/account";
import { isRazorpayConfigured } from "@/lib/env";
import { WalletTopUp } from "@/components/account/wallet-topup";
import { PageHeader } from "@/components/ui/misc";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatINR, formatDateTime } from "@/lib/utils";
import type { Enums } from "@/types/database";

export const metadata: Metadata = { title: "Wallet", robots: { index: false } };
export const dynamic = "force-dynamic";

const TXN: Record<Enums<"wallet_txn_type">, { label: string; tone: BadgeTone; icon: React.ReactNode; sign: "+" | "−" }> = {
  credit: { label: "Credit", tone: "success", icon: <ArrowDownLeft className="h-4 w-4" />, sign: "+" },
  debit: { label: "Debit", tone: "danger", icon: <ArrowUpRight className="h-4 w-4" />, sign: "−" },
  refund: { label: "Refund", tone: "info", icon: <RotateCcw className="h-4 w-4" />, sign: "+" },
  cashback: { label: "Cashback", tone: "brand", icon: <Sparkles className="h-4 w-4" />, sign: "+" },
};

export default async function WalletPage() {
  const user = await getSessionUser();
  if (!user) return null; // the account layout shows the login prompt
  const { balance, transactions } = await getWallet();
  return (
    <div className="pt-1">
      <PageHeader title="Wallet" back="/account" />
      <div className="space-y-5 px-4 sm:px-0">
        <section className="rounded-xl bg-gradient-to-br from-brand-700 to-brand-600 p-5 text-white shadow-float">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/80"><Wallet className="h-4 w-4" /> Merta Deal wallet</p>
          <p className="mt-2 font-display text-4xl font-extrabold tabular">{formatINR(balance, { precise: true })}</p>
          <p className="mt-1 text-sm text-white/80">Use it at checkout — pick “Wallet” as the payment method.</p>
          <div className="mt-4 rounded-lg bg-white p-3 text-ink"><WalletTopUp razorpayConfigured={isRazorpayConfigured()} /></div>
        </section>

        <section>
          <SectionHeader title="Transactions" subtitle="Last 50 entries" className="px-0" />
          {transactions.length === 0 ? (
            <EmptyState icon={<Wallet className="h-7 w-7" />} title="No transactions yet" description="Refunds, cashback and wallet payments will be listed here." compact />
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-card shadow-card">
              {transactions.map((t) => {
                const m = TXN[t.type];
                return (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${t.type === "debit" ? "bg-danger-50 text-danger" : "bg-success-50 text-success"}`}>{m.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-ink">{t.description}</p><Badge tone={m.tone} size="xs">{m.label}</Badge></div>
                      <p className="mt-0.5 text-xs text-ink-3">{formatDateTime(t.created_at)}{t.order_id ? <> · <Link href={`/orders/${t.order_id}`} className="font-semibold text-brand-600 hover:underline">View order</Link></> : null}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold tabular ${t.type === "debit" ? "text-danger" : "text-success"}`}>{m.sign}{formatINR(Math.abs(Number(t.amount)), { precise: true })}</p>
                      <p className="text-[11px] text-ink-3">Bal. {formatINR(t.balance_after, { precise: true })}</p>
                    </div>
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
