"use client";
import * as React from "react";
import Link from "next/link";
import { ImagePlus, Link2, Loader2, Trash2, Check, X, ExternalLink, Info } from "lucide-react";
import { Panel, StatusPill, IconAction } from "@/components/admin/kit";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { uploadFile, compressImage } from "@/lib/storage";
import { setProductPhotosAction, importProductPhotosAction } from "@/lib/actions/admin";
import type { PhotoRow } from "@/lib/data/admin-catalogue";
import { ProductThumb, btn, inputCls } from "@/components/admin/catalogue/bits";

/**
 * Photo studio — the supported way to get official pack shots onto every SKU.
 * Two routes per product: upload a file (compressed on-device) or paste the URL of an official
 * asset, which the server re-frames onto the catalogue's white canvas. Nothing here invents an
 * image: a product with no supplied photo keeps the neutral "photo coming soon" tile.
 */
export function PhotoStudio({ rows }: { rows: PhotoRow[] }) {
  return (
    <Panel flush>
      <ul className="divide-y divide-line">
        {rows.map((p) => <PhotoRowItem key={p.id} product={p} />)}
      </ul>
    </Panel>
  );
}

function PhotoRowItem({ product }: { product: PhotoRow }) {
  const [primary, setPrimary] = React.useState(product.image_url);
  const [gallery, setGallery] = React.useState<string[]>(product.images ?? []);
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState<null | "file" | "url" | "clear">(null);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const urlId = React.useId();
  const urlValid = /^https?:\/\/\S+$/i.test(url.trim());

  const save = async (next: { image_url: string | null; images: string[] }) => {
    const r = await setProductPhotosAction(product.id, next);
    if (!r.ok) { toast.error("Couldn't save the photo", r.error); return false; }
    setPrimary(next.image_url); setGallery(next.images);
    return true;
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("file");
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, 4)) {
        const compressed = await compressImage(f, 1600, 0.85);
        const up = await uploadFile("product-images", `catalog/${product.slug}`, compressed, { maxMb: 8 });
        urls.push(up.url);
      }
      const ok = await save({ image_url: urls[0], images: [...(primary ? [primary] : []), ...gallery, ...urls.slice(1)].slice(0, 8) });
      if (ok) toast.success("Photo saved", `${product.name} now shows this pack shot.`);
    } catch (e) { toast.error("Upload failed", e instanceof Error ? e.message : "Try a smaller JPG, PNG or WebP file."); }
    setBusy(null); if (fileRef.current) fileRef.current.value = "";
  };

  const onUrl = async () => {
    if (!urlValid) { toast.error("Paste a full image link", "It should start with https://"); return; }
    setBusy("url");
    const r = await importProductPhotosAction([{ slug: product.slug, url: url.trim(), source: "manual" }]);
    if (!r.ok) toast.error("Import failed", r.error);
    else if (r.data.results[0]?.ok) { setPrimary(r.data.results[0].url ?? null); setUrl(""); toast.success("Imported", "Re-framed onto the catalogue canvas."); }
    else toast.error("Import failed", r.data.results[0]?.error ?? "The image could not be downloaded.");
    setBusy(null);
  };

  const onClear = async () => {
    setBusy("clear");
    const ok = await save({ image_url: null, images: [] });
    if (ok) toast.success("Photo removed", "The card falls back to the neutral tile.");
    setBusy(null); setConfirmClear(false);
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {primary ? (
          <a href={primary} target="_blank" rel="noreferrer" aria-label={`Open the current photo of ${product.name} in a new tab`} className="rounded-lg focus-visible:outline-2 focus-visible:outline-brand-600">
            <ProductThumb image={primary} name={product.name} brand={product.brand?.name} pack={product.pack_label} />
          </a>
        ) : <ProductThumb image={null} name={product.name} brand={product.brand?.name} pack={product.pack_label} />}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/products/${product.id}`} className="truncate text-sm font-medium text-ink hover:text-brand-700 hover:underline">{product.name}</Link>
            {primary ? <StatusPill tone="green">Has photo</StatusPill> : <StatusPill tone="amber">Needs photo</StatusPill>}
            {gallery.length > 0 ? <span className="text-xs text-ink-3">+{gallery.length} more</span> : null}
          </div>
          <p className="truncate text-xs text-ink-3">{[product.brand?.name, product.pack_label, product.category?.name].filter(Boolean).join(" · ") || "—"}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:w-[560px] lg:shrink-0">
        <label htmlFor={urlId} className="sr-only">Official image URL for {product.name}</label>
        <input id={urlId} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste official image URL (https://…)" className={`${inputCls} h-9 min-w-0 flex-1`}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onUrl(); } }} />
        <div className="flex items-center gap-2">
          <button type="button" className={btn.outline} onClick={() => void onUrl()} disabled={!url.trim() || busy !== null}>{busy === "url" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}Import</button>
          <button type="button" className={btn.outline} onClick={() => fileRef.current?.click()} disabled={busy !== null}>{busy === "file" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}Upload</button>
          {primary ? <IconAction label="Remove photo" tone="danger" onClick={() => setConfirmClear(true)} disabled={busy !== null}>{busy === "clear" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden />}</IconAction> : null}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
      <ConfirmDialog open={confirmClear} onClose={() => setConfirmClear(false)} tone="danger" title={`Remove the photos of “${product.name}”?`}
        description="The product card falls back to the neutral “photo coming soon” tile until a new photo is added. The image files stay in storage."
        confirmLabel="Remove photos" loading={busy === "clear"} onConfirm={() => void onClear()} />
    </li>
  );
}

/** Bulk paste: one `slug<space|tab|comma>url` per line, straight from a supplier's asset sheet. */
export function BulkImport() {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<{ slug?: string; ok: boolean; error?: string; url?: string }[] | null>(null);
  const [lineError, setLineError] = React.useState<string | null>(null);
  const id = React.useId();

  const parse = (raw: string) => raw.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(\S+)[\s,\t]+(https?:\/\/\S+)$/);
    return m ? { slug: m[1], url: m[2], source: "bulk" } : null;
  });
  const count = parse(text).length;

  const run = async () => {
    const parsed = parse(text);
    const bad = parsed.findIndex((p) => p === null);
    if (bad >= 0) { setLineError(`Line ${bad + 1} isn't “slug https://…”. Put the product slug first, then the image link.`); return; }
    setLineError(null);
    const items = parsed as { slug: string; url: string; source: string }[];
    if (!items.length) return;
    setBusy(true);
    const r = await importProductPhotosAction(items);
    setBusy(false);
    if (!r.ok) { toast.error("Import failed", r.error); return; }
    setResults(r.data.results);
    toast.success(`${r.data.imported} imported`, r.data.failed ? `${r.data.failed} failed; see the list below.` : "All lines succeeded.");
  };

  return (
    <Panel title="Bulk import from a supplier asset sheet" description="One line per product: the product slug, then the image URL. Images are downloaded, trimmed and centred on the catalogue canvas.">
      <div className="space-y-3">
        <label htmlFor={id} className="sr-only">Lines to import</label>
        <textarea id={id} rows={5} value={text} onChange={(e) => { setText(e.target.value); setLineError(null); }} aria-invalid={Boolean(lineError)}
          placeholder={"tata-salt-1-kg https://brand.example/assets/tata-salt-1kg.jpg\nsurf-excel-easy-wash-1-kg https://brand.example/assets/surf-excel-1kg.png"}
          className="w-full rounded-lg border border-line-2 bg-card px-3 py-2.5 font-mono text-xs text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger" />
        {lineError ? <p className="text-xs font-medium text-danger" role="alert">{lineError}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn.primary} onClick={() => void run()} disabled={busy || !text.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}{busy ? "Importing…" : `Import ${count || ""} ${count === 1 ? "photo" : "photos"}`}</button>
          {results ? <button type="button" className={btn.outline} onClick={() => { setResults(null); setText(""); }}>Clear</button> : null}
        </div>
        {results ? (
          <ul className="divide-y divide-line rounded-lg border border-line text-sm" aria-label="Import results">
            {results.map((r, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2">
                {r.ok ? <Check className="h-4 w-4 shrink-0 text-success" aria-label="Imported" /> : <X className="h-4 w-4 shrink-0 text-danger" aria-label="Failed" />}
                <span className="font-mono text-xs text-ink-2">{r.slug ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-ink-3">{r.ok ? "Imported" : r.error}</span>
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer" aria-label={`Open imported image for ${r.slug ?? "product"}`} className="text-ink-3 hover:text-ink"><ExternalLink className="h-3.5 w-3.5" aria-hidden /></a> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="flex gap-2 rounded-lg bg-info-50 px-3 py-2.5 text-xs text-ink-2">
          <Info className="mt-px h-4 w-4 shrink-0 text-info" aria-hidden />
          <span>Only import photos you are licensed to use: brand kits, your distributor&apos;s asset pack, or your own pack shots. For local Merta products, a plain photo on a white sheet in daylight works. Everything is re-framed to 1000×1000 WebP so every card matches.</span>
        </p>
      </div>
    </Panel>
  );
}
