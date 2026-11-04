import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, createClient } from "@/lib/supabase/server";
import { PrintBar } from "@/components/admin/scan/print-bar";

export const metadata: Metadata = { title: { default: "Print", template: "%s · Print | Merta Deal" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Printable sheets (labels, packing slips): no admin frame, same admin check as the panel. */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin || (user.role !== "admin" && user.role !== "super_admin")) redirect("/admin/login?denied=1");
  return (
    <div className="min-h-dvh bg-[#f4f5f3] text-ink print:bg-white">
      <PrintBar />
      {children}
    </div>
  );
}
