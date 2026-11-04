import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { AdminPageHeader } from "@/components/admin/kit";
import { ScanSection } from "@/components/admin/scan/scan-section";
import { spGet, type SP } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Scan" };

const UUID = /^[0-9a-f-]{36}$/;

/** Phone-first: scan product and order labels to manage stock, pack and dispatch. Every action is checked again by the database. */
export default async function AdminScanPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, user] = await Promise.all([searchParams, getSessionUser()]);
  const code = spGet(sp, "code")?.slice(0, 300);
  const order = spGet(sp, "order"); const product = spGet(sp, "product");
  return (
    <>
      <AdminPageHeader title="Scan" description="Point the camera at a product label to manage its stock, or at an order label to pack and dispatch it. The camera only reads codes; every change is confirmed first." />
      <ScanSection key={`${code ?? ""}|${order ?? ""}|${product ?? ""}`} userId={user?.id ?? "anon"} siteUrl={env.siteUrl}
        initialCode={code || undefined} initialOrderId={order && UUID.test(order) ? order : undefined} initialProductId={product && UUID.test(product) ? product : undefined} />
    </>
  );
}
