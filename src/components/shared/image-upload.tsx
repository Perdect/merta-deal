"use client";
import * as React from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { uploadFile, compressImage, type Bucket } from "@/lib/storage";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Drop-in image uploader: compresses on device, uploads to Supabase Storage, returns the public URL. */
export function ImageUpload({ bucket, folder, value, onChange, label = "Upload image", className, aspect = "square", accept = "image/*", maxMb = 5, compress = true }: { bucket: Bucket; folder: string; value?: string | null; onChange: (url: string | null, path?: string) => void; label?: string; className?: string; aspect?: "square" | "wide" | "auto"; accept?: string; maxMb?: number; compress?: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  const pick = async (f?: File) => {
    if (!f) return; setBusy(true);
    try { const file = compress ? await compressImage(f) : f; const r = await uploadFile(bucket, folder, file, { maxMb }); onChange(r.url, r.path); toast.success("Uploaded"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    setBusy(false); if (ref.current) ref.current.value = "";
  };
  return (
    <div className={cn("relative overflow-hidden rounded-md border border-dashed border-line-2 bg-surface", aspect === "square" ? "aspect-square" : aspect === "wide" ? "aspect-[3/1]" : "min-h-32", className)}>
      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-full w-full object-cover" />
          <button type="button" onClick={() => onChange(null)} aria-label="Remove image" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-ink shadow-card"><X className="h-4 w-4" /></button>
        </>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-4 text-xs font-semibold text-ink-3">
          {busy ? <Loader2 className="h-6 w-6 animate-spin text-brand-600" /> : <ImagePlus className="h-6 w-6 text-brand-600" />}{busy ? "Uploading…" : label}
        </button>
      )}
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
