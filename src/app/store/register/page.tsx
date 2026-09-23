import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyStore } from "@/lib/data/store";
import { Logo } from "@/components/ui/misc";
import { StoreRegisterForm } from "@/components/store/register-form";

export const metadata: Metadata = { title: "Register your store" };
export const dynamic = "force-dynamic";

export default async function StoreRegisterPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/store/register");
  const membership = await getMyStore();
  if (membership) redirect("/store");
  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-card/95 px-4 backdrop-blur sm:px-6"><Logo size="sm" /><Link href="/" className="text-xs font-semibold text-ink-2">Customer site</Link></header>
      <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Kirana partner onboarding</p>
          <h1 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">Register your store</h1>
          <p className="mt-1 text-sm text-ink-3">Takes about 5 minutes. Your store goes live after a quick admin check; you can add products in the meantime.</p>
        </div>
        <StoreRegisterForm defaults={{ owner_name: user.fullName, phone: user.phone, email: user.email }} />
      </main>
    </div>
  );
}
