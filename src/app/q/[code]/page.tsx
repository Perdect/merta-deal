import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, ScanLine } from "lucide-react";
import { getSessionUser, createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/misc";
import type { ScanResolved } from "@/lib/scan/types";

export const metadata: Metadata = { title: "Staff label", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The link printed inside every product and order QR. It carries only a code. Staff are sent to the
 * Scan section; a rider sees the order only if it is assigned to them; everyone else gets the same
 * plain page whatever the code, so the link reveals nothing about products or orders.
 */
export default async function StaffLabelPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  const user = await getSessionUser();
  if (user && (user.role === "admin" || user.role === "super_admin")) redirect(`/admin/scan?code=${encodeURIComponent(code)}`);

  let rider: { ok: boolean; message: string } | null = null;
  if (user?.role === "rider" && code) {
    const supabase = await createClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    const { data, error } = await rpc("scan_resolve", { p_code: code });
    const r = data as ScanResolved | null;
    if (error) rider = { ok: false, message: /NOT_ASSIGNED/.test(error.message) ? "This order is not assigned to you." : "You can only open orders assigned to you." };
    else if (r?.kind === "rider_order") rider = { ok: true, message: `Order ${r.order.order_number} is assigned to you.` };
    else rider = { ok: false, message: "This label is not one of your orders." };
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface px-4 py-10 text-center">
      <Logo size="md" />
      <div className="mt-6 w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-card">
        {rider ? (
          <>
            <ScanLine className={`mx-auto h-8 w-8 ${rider.ok ? "text-success" : "text-ink-3"}`} aria-hidden />
            <h1 className="mt-3 font-display text-lg font-bold text-ink">{rider.ok ? "Your delivery" : "Not your order"}</h1>
            <p className="mt-1 text-sm text-ink-2">{rider.message}</p>
            <Link href="/rider" className="tap mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">Open the rider app</Link>
          </>
        ) : (
          <>
            <ShieldCheck className="mx-auto h-8 w-8 text-ink-3" aria-hidden />
            <h1 className="mt-3 font-display text-lg font-bold text-ink">Staff label</h1>
            <p className="mt-1 text-sm text-ink-2">This code is used by Merta Deal staff to manage stock and deliveries. It does not open anything for customers.</p>
            <Link href={`/admin/login?next=${encodeURIComponent(`/q/${code}`)}`} className="tap mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">Staff sign in</Link>
            <Link href="/" className="tap mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-ink-2">Go to Merta Deal</Link>
          </>
        )}
      </div>
    </main>
  );
}
