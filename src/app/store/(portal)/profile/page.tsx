import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QrCode } from "lucide-react";
import { getMyStore, getStoreDocuments, getDocumentUrl } from "@/lib/data/store";
import { StoreProfileForm } from "@/components/store/profile-form";
import { StoreMedia, StoreDocuments } from "@/components/store/store-media";
import { QrActions } from "@/components/store/qr-section";
import { QrPoster } from "@/components/shared/qr-poster";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STORE_STATUS_META } from "@/components/store/constants";

export const metadata: Metadata = { title: "Store profile" };
export const dynamic = "force-dynamic";

export default async function StoreProfilePage() {
  const membership = await getMyStore();
  if (!membership) redirect("/store/register");
  const { store, role } = membership;
  const docs = await getStoreDocuments(store.id);
  const signed = Object.fromEntries(await Promise.all(docs.slice(0, 20).map(async (d) => [d.file_path, await getDocumentUrl(d.file_path)] as const)));
  const meta = STORE_STATUS_META[store.status];
  return (
    <div className="space-y-4">
      <PageHeader title="Store profile" subtitle="What customers see, plus KYC and payout details." className="px-0" action={<Badge tone={meta.tone}>{meta.label}</Badge>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Card><CardHeader title="Logo, cover & photos" subtitle="Shown on your shop page and in search" /><CardBody><StoreMedia storeId={store.id} logoUrl={store.logo_url} coverUrl={store.cover_url} photos={store.photos ?? []} /></CardBody></Card>
          <StoreProfileForm store={store} />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Verification documents" subtitle="Reviewed by Merta Deal admins" />
            <CardBody><StoreDocuments storeId={store.id} docs={docs} signedUrls={signed} /></CardBody>
          </Card>
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><QrCode className="h-4 w-4 text-brand-600" /> QR & marketing</span>} subtitle="Print and stick at the counter — customers scan to order" />
            <CardBody className="space-y-4">
              <div className="overflow-x-auto"><QrPoster path={`/qr/${store.id}`} title={store.name} subtitle={`${store.area} · ${store.phone}`} code={store.slug} /></div>
              <QrActions storeId={store.id} />
            </CardBody>
          </Card>
          {role !== "owner" ? <p className="text-xs text-ink-3">You are signed in as store {role}. Bank and tax details can be edited by the owner.</p> : null}
        </div>
      </div>
    </div>
  );
}
