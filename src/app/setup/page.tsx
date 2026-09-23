import type { Metadata } from "next";
import { CheckCircle2, XCircle, Terminal } from "lucide-react";
import { integrationStatus } from "@/lib/env";
import { Logo } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Setup status", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Honest configuration dashboard: what is live and exactly which env vars unlock each integration. */
export default function SetupPage() {
  const items = integrationStatus();
  const core = items.find((i) => i.key === "supabase")!;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Logo size="lg" />
      <h1 className="mt-6 text-2xl font-bold text-ink">Deployment setup</h1>
      <p className="mt-1 text-sm text-ink-3">Merta Deal never fakes an integration. Each item below is either live or shows the exact variables needed.</p>
      {!core.configured ? (
        <div className="mt-6 rounded-lg border border-danger/30 bg-danger-50 p-4 text-sm text-[#8a1f18]">
          <p className="font-bold">Supabase is not configured, so the app cannot start.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Create a Supabase project (region ap-south-1 recommended).</li>
            <li>Apply <code>supabase/migrations/*.sql</code> in order, then <code>supabase/seed.sql</code> for demo data.</li>
            <li>Copy <code>.env.example</code> to <code>.env.local</code> and fill <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.</li>
            <li>Restart <code>pnpm dev</code>.</li>
          </ol>
        </div>
      ) : null}
      <ul className="mt-6 space-y-3">
        {items.map((i) => (
          <li key={i.key} className={cn("rounded-lg border p-4", i.configured ? "border-success/30 bg-success-50" : "border-line bg-card")}>
            <div className="flex items-start gap-3">
              {i.configured ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /> : <XCircle className="mt-0.5 h-5 w-5 text-ink-4" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{i.label} <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold", i.configured ? "bg-success text-white" : "bg-surface-2 text-ink-3")}>{i.configured ? "LIVE" : "NOT CONFIGURED"}</span></p>
                <p className="mt-0.5 text-sm text-ink-3">{i.note}</p>
                {!i.configured ? <p className="mt-2 flex flex-wrap gap-1.5">{i.envVars.map((v) => <code key={v} className="rounded-xs bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">{v}</code>)}</p> : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-8 flex items-center gap-2 text-xs text-ink-3"><Terminal className="h-4 w-4" /> Local SQL validation: <code>./scripts/db-local-reset.sh</code> then <code>psql -h /tmp -d merta_deal -f scripts/test-lifecycle.sql</code></p>
    </div>
  );
}
