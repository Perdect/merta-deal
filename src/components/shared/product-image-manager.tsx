"use client";
import * as React from "react";
import { ImagePlus, Loader2, Star, Trash2, Eye, Replace } from "lucide-react";
import { uploadFile, compressImage } from "@/lib/storage";
import { ProductImage } from "@/components/shop/product-image";
import { Modal } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Product image manager for admin and store portals.
 * Primary image = products.image_url; gallery = products.images[]. Uploads are compressed on-device
 * (max 1200 px, WebP) before going to Supabase Storage; next/image serves AVIF/WebP at request time.
 */
export function ProductImageManager({ primary, gallery, onChange, folder, productName, brand, packSize, disabled, max = 8 }: {
  primary: string | null; gallery: string[]; onChange: (next: { image_url: string | null; images: string[] }) => void;
  folder: string; productName?: string; brand?: string | null; packSize?: string | null; disabled?: boolean; max?: number;
}) {
  const [busy, setBusy] = React.useState<"primary" | "gallery" | number | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const replaceRef = React.useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = React.useState<"primary" | number | null>(null);
  const all = [primary, ...gallery].filter(Boolean) as string[];

  const upload = async (file: File) => {
    const compressed = await compressImage(file, 1600, 0.85);
    const r = await uploadFile("product-images", folder, compressed, { maxMb: 8 });
    return r.url;
  };

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("gallery");
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, max - all.length)) urls.push(await upload(f));
      if (!primary && urls.length) onChange({ image_url: urls[0], images: [...gallery, ...urls.slice(1)] });
      else onChange({ image_url: primary, images: [...gallery, ...urls] });
      toast.success(`${urls.length} image${urls.length > 1 ? "s" : ""} uploaded`, "Optimised to WebP; AVIF served automatically.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    setBusy(null); if (fileRef.current) fileRef.current.value = "";
  };

  const replace = async (file: File | undefined) => {
    if (!file || replaceTarget === null) return;
    setBusy(replaceTarget === "primary" ? "primary" : replaceTarget);
    try {
      const url = await upload(file);
      if (replaceTarget === "primary") onChange({ image_url: url, images: gallery });
      else onChange({ image_url: primary, images: gallery.map((g, i) => (i === replaceTarget ? url : g)) });
      toast.success("Image replaced");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    setBusy(null); setReplaceTarget(null); if (replaceRef.current) replaceRef.current.value = "";
  };

  const makePrimary = (i: number) => { const next = gallery[i]; onChange({ image_url: next, images: [...(primary ? [primary] : []), ...gallery.filter((_, j) => j !== i)] }); };
  const remove = (which: "primary" | number) => {
    if (which === "primary") onChange({ image_url: gallery[0] ?? null, images: gallery.slice(1) });
    else onChange({ image_url: primary, images: gallery.filter((_, j) => j !== which) });
  };

  const renderTile = (url: string, label: string, which: "primary" | number) => (
    <figure key={`${which}-${url}`} className={cn("group relative overflow-hidden rounded-md border bg-card", which === "primary" ? "border-brand-600 ring-2 ring-brand-100" : "border-line")}>
      <ProductImage image={url} productName={productName} brand={brand} packSize={packSize} className="aspect-square w-full" sizes="160px" rounded="rounded-none" />
      <figcaption className="absolute left-1.5 top-1.5 rounded-xs bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-ink shadow-card">{label}</figcaption>
      {busy === which ? <span className="absolute inset-0 flex items-center justify-center bg-white/70"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /></span> : null}
      {!disabled ? (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-gradient-to-t from-ink/60 to-transparent p-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          <IconBtn label="Preview" onClick={() => setPreview(url)}><Eye className="h-3.5 w-3.5" /></IconBtn>
          {which !== "primary" ? <IconBtn label="Set as primary" onClick={() => makePrimary(which)}><Star className="h-3.5 w-3.5" /></IconBtn> : null}
          <IconBtn label="Replace" onClick={() => { setReplaceTarget(which); replaceRef.current?.click(); }}><Replace className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn label="Remove" onClick={() => remove(which)} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
        </div>
      ) : null}
    </figure>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {primary ? renderTile(primary, "Primary", "primary") : null}
        {gallery.map((u, i) => renderTile(u, `#${i + 2}`, i))}
        {!disabled && all.length < max ? (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy !== null} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-2 bg-surface text-xs font-semibold text-ink-3 hover:border-brand-500 hover:text-brand-700">
            {busy === "gallery" ? <Loader2 className="h-6 w-6 animate-spin text-brand-600" /> : <ImagePlus className="h-6 w-6 text-brand-600" />}{all.length ? "Add more" : "Upload photo"}
          </button>
        ) : null}
      </div>
      {!primary ? <p className="text-xs text-ink-3">No photo yet — customers see a neutral “Photo coming soon” tile. Upload a clear front-of-pack photo on a plain background.</p> : <p className="text-xs text-ink-3">The primary image appears on cards and search. Up to {max} images; JPG/PNG/WebP, compressed on upload.</p>}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      <input ref={replaceRef} type="file" accept="image/*" className="hidden" onChange={(e) => replace(e.target.files?.[0])} />
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Image preview" size="lg">
        {preview ? <ProductImage image={preview} productName={productName} brand={brand} packSize={packSize} className="aspect-square w-full rounded-lg" sizes="600px" priority /> : null}
      </Modal>
    </div>
  );
}

function IconBtn({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={cn("flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink shadow-card", danger && "text-danger")}>{children}</button>;
}
