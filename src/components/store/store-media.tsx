"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2, ExternalLink } from "lucide-react";
import { ImageUpload } from "@/components/shared/image-upload";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { addStoreDocumentAction, deleteStoreDocumentAction, updateStoreMediaAction } from "@/lib/actions/store";
import { DOC_TYPES, DOC_STATUS_META } from "./constants";
import { formatDate } from "@/lib/utils";
import type { Tables } from "@/types/database";

type Doc = Pick<Tables<"store_documents">, "id" | "doc_type" | "file_path" | "status" | "review_note" | "created_at">;

/** KYC documents: upload to the private `store-documents` bucket under <storeId>/ and register the row. */
export function StoreDocuments({ storeId, docs: initial, signedUrls = {} }: { storeId: string; docs: Doc[]; signedUrls?: Record<string, string | null> }) {
  const router = useRouter();
  const [docs, setDocs] = React.useState<Doc[]>(initial);
  const [seenDocs, setSeenDocs] = React.useState(initial);
  if (seenDocs !== initial) { setSeenDocs(initial); setDocs(initial); }
  const [docType, setDocType] = React.useState(DOC_TYPES[0].value);
  const [busy, setBusy] = React.useState<string | null>(null);
  const label = (t: string) => DOC_TYPES.find((d) => d.value === t)?.label ?? t.replace(/_/g, " ");

  const onUploaded = async (url: string | null, path?: string) => {
    if (!url || !path) return;
    const r = await addStoreDocumentAction(storeId, docType, path);
    if (!r.ok) { toast.error(r.error); return; }
    setDocs((d) => [{ id: r.data.id, doc_type: docType, file_path: path, status: "pending", review_note: null, created_at: new Date().toISOString() }, ...d]);
    toast.success("Document submitted for review");
    router.refresh();
  };
  const remove = async (id: string) => {
    setBusy(id);
    const r = await deleteStoreDocumentAction(id);
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    setDocs((d) => d.filter((x) => x.id !== id)); router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <Select label="Document type" options={DOC_TYPES} value={docType} onChange={(e) => setDocType(e.target.value)} />
        <div className="space-y-1.5"><span className="block text-sm font-medium text-ink-2">File (JPG, PNG or PDF, up to 10 MB)</span><ImageUpload bucket="store-documents" folder={storeId} value={null} onChange={onUploaded} label="Upload" accept="image/*,application/pdf" compress={false} maxMb={10} aspect="auto" className="h-11 min-h-11" /></div>
      </div>
      {docs.length === 0 ? <p className="rounded-md bg-surface px-3 py-2.5 text-xs text-ink-3">No documents yet. Upload your shop licence, GST certificate or PAN so the admin can verify your store faster.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-card">
          {docs.map((d) => {
            const m = DOC_STATUS_META[d.status]; const url = signedUrls[d.file_path];
            return (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                <FileText className="h-5 w-5 shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{label(d.doc_type)}</p>
                  <p className="text-xs text-ink-3">{formatDate(d.created_at)}{d.review_note ? ` · ${d.review_note}` : ""}</p>
                </div>
                <Badge tone={m.tone}>{m.label}</Badge>
                {url ? <a href={url} target="_blank" rel="noreferrer" aria-label="Open document" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2"><ExternalLink className="h-4 w-4" /></a> : null}
                {d.status === "pending" ? <Button variant="ghost" size="icon" aria-label="Remove document" loading={busy === d.id} onClick={() => remove(d.id)} className="h-9 w-9 rounded-full text-danger"><Trash2 className="h-4 w-4" /></Button> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Logo, cover and gallery photos (public `store-photos` bucket). Saves immediately on each change. */
export function StoreMedia({ storeId, logoUrl, coverUrl, photos: initialPhotos }: { storeId: string; logoUrl: string | null; coverUrl: string | null; photos: string[] }) {
  const router = useRouter();
  const [logo, setLogo] = React.useState(logoUrl); const [cover, setCover] = React.useState(coverUrl); const [photos, setPhotos] = React.useState(initialPhotos);
  const [seen, setSeen] = React.useState({ logoUrl, coverUrl, initialPhotos });
  if (seen.logoUrl !== logoUrl || seen.coverUrl !== coverUrl || seen.initialPhotos !== initialPhotos) { setSeen({ logoUrl, coverUrl, initialPhotos }); setLogo(logoUrl); setCover(coverUrl); setPhotos(initialPhotos); }
  const save = async (patch: { logo_url?: string | null; cover_url?: string | null; photos?: string[] }) => {
    const r = await updateStoreMediaAction(storeId, patch);
    if (!r.ok) toast.error(r.error); else router.refresh();
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div><p className="mb-1.5 text-sm font-medium text-ink-2">Logo</p><ImageUpload bucket="store-photos" folder={storeId} value={logo} onChange={(u) => { setLogo(u); save({ logo_url: u }); }} label="Add logo" /></div>
        <div><p className="mb-1.5 text-sm font-medium text-ink-2">Cover photo</p><ImageUpload bucket="store-photos" folder={storeId} value={cover} onChange={(u) => { setCover(u); save({ cover_url: u }); }} label="Add cover (wide)" aspect="wide" /></div>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink-2">Shop photos <span className="font-normal text-ink-3">({photos.length}/8)</span></p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p, i) => <ImageUpload key={p + i} bucket="store-photos" folder={storeId} value={p} onChange={(u) => { const next = photos.filter((_, j) => j !== i); if (u) next.splice(i, 0, u); setPhotos(next); save({ photos: next }); }} />)}
          {photos.length < 8 ? <ImageUpload bucket="store-photos" folder={storeId} value={null} onChange={(u) => { if (!u) return; const next = [...photos, u]; setPhotos(next); save({ photos: next }); }} label="Add photo" /> : null}
        </div>
      </div>
    </div>
  );
}
