import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Store panel", template: "%s · Store panel | Merta Deal" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Session gate for the merchant portal. Store resolution happens in `(portal)/layout.tsx` so that
 * `/store/register` can render without a store (and without the dashboard shell).
 */
export default async function StoreRootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/store");
  return <>{children}</>;
}
