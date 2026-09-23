"use client";
import * as React from "react";
import Link from "next/link";
import { ImagePlus, Link2, Loader2, Trash2, Check, X, ExternalLink } from "lucide-react";
import { ProductImage } from "@/components/shop/product-image";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { uploadFile, compressImage } from "@/lib/storage";
import { setProductPhotosAction, importProductPhotosAction } from "@/lib/actions/admin";
import type { PhotoRow } from "@/lib/data/admin";

/**
 * Photo studio — the supported way to get official pack shots onto every SKU.
 * Two routes per product: upload a file (compressed on-device) or paste the URL of an official
 * asset, which the server re-frames onto the catalogue's white canvas. Nothing here invents an
 * image: a product with no supplied photo keeps the neutral "photo coming soon" tile.
 */
export function PhotoStudio({ rows }: { rows: PhotoRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((p) => <PhotoRowCard key={p.id} product={p} />)}
    </div>
  );
}

function PhotoRowCard({ product }: { product: PhotoRow }) {
  const [primary, setPrimary] = React.useState(product.image_url);
  const [gallery, setGallery] = React.useState<string[]>(product.images ?? []);
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState<null | "file" | "url" | "clear">(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const save = async (next: { image_url: string | null; images: string[] }) => {
    const r = await setProductPhotosAction(product.id, next);
    if (!r.ok) { toast.error(r.error); return false; }
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
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    setBusy(null); if (fileRef.current) fileRef.current.value = "";
  };

  const onUrl = async () => {
    if (!url.trim()) return;
    setBusy("url");
    const r = await importProductPhotosAction([{ slug: product.slug, url: url.trim(), source: "manual" }]);
    if (!r.ok) toast.error(r.error);
    else if (r.data.results[0]?.ok) { setPrimary(r.data.results[0].url ?? null); setUrl(""); toast.success("Imported", "Re-framed onto the catalogue canvas."); }
    else toast.error(r.data.results[0]?.error ?? "Import failed");
    setBusy(null);
  };

  const onClear = async () => {
    setBusy("clear");
    const ok = await save({ image_url: null, images: [] });
    if (ok) toast.success("Photo removed", "The card falls back to the neutral tile.");
    setBusy(null);
  };

  return (
    <Card>
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <ProductImage image={primary} productName={product.name} brand={product.brand?.name} packSize={product.pack_label} className="h-20 w-20 shrink-0 rounded-md" sizes="80px" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/products/${product.id}`} className="truncate font-semibold text-ink hover:underline">{product.name}</Link>
            {primary ? <Badge tone="success" size="xs">has photo</Badge> : <Badge tone="warning" size="xs">needs photo</Badge>}
            {gallery.length > 0 ? <Badge tone="neutral" size="xs">+{gallery.length} more</Badge> : null}
          </div>
          <p className="truncate text-xs text-ink-3">{[product.brand?.name, product.pack_label, product.category?.name].filter(Boolean).join(" · ")}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste official image URL (https://…)" className="sm:max-w-md" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onUrl(); } }} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void onUrl()} disabled={!url.trim() || busy !== null}>{busy === "url" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Import</Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy !== null}>{busy === "file" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Upload</Button>
              {primary ? <IconButton label="Remove photo" size="sm" variant="ghost" onClick={() => void onClear()} disabled={busy !== null}>{busy === "clear" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</IconButton> : null}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
        </div>
      </CardBody>
    </Card>
  );
}

/** Bulk paste: one `slug<space|tab|comma>url` per line, straight from a supplier's asset sheet. */
export function BulkImport() {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<{ slug?: string; ok: boolean; error?: string; url?: string }[] | null>(null);

  const parse = (raw: string) => raw.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(\S+)[\s,\t]+(https?:\/\/\S+)$/);
    return m ? { slug: m[1], url: m[2], source: "bulk" } : null;
  });

  const run = async () => {
    const parsed = parse(text);
    const bad = parsed.findIndex((p) => p === null);
    if (bad >= 0) { toast.error("Line " + (bad + 1) + " is not `slug https://…`"); return; }
    const items = parsed as { slug: string; url: string; source: string }[];
    if (!items.length) return;
    setBusy(true);
    const r = await importProductPhotosAction(items);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setResults(r.data.results);
    toast.success(`${r.data.imported} imported`, r.data.failed ? `${r.data.failed} failed — see the list below.` : "All lines succeeded.");
  };

  return (
    <Card>
      <CardBody className="space-y-3">
        <div>
          <h3 className="font-display font-semibold text-ink">Bulk import from a supplier asset sheet</h3>
          <p className="text-sm text-ink-3">One line per product: the product slug, then the image URL. Images are downloaded, trimmed and centred on the catalogue canvas. Only import photos you are licensed to use — brand kits, your distributor&apos;s asset pack, or your own pack shots.</p>
        </div>
        <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"tata-salt-1-kg https://brand.example/assets/tata-salt-1kg.jpg\nsurf-excel-easy-wash-1-kg https://brand.example/assets/surf-excel-1kg.png"} className="font-mono text-xs" />
        <div className="flex items-center gap-2">
          <Button onClick={() => void run()} disabled={busy || !text.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Import {parse(text).length || ""} {parse(text).length === 1 ? "photo" : "photos"}</Button>
          {results ? <Button variant="ghost" onClick={() => { setResults(null); setText(""); }}>Clear</Button> : null}
        </div>
        {results ? (
          <ul className="divide-y divide-line rounded-md border border-line text-sm">
            {results.map((r, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2">
                {r.ok ? <Check className="h-4 w-4 shrink-0 text-success" /> : <X className="h-4 w-4 shrink-0 text-danger" />}
                <span className="font-mono text-xs text-ink-2">{r.slug ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-ink-3">{r.ok ? "imported" : r.error}</span>
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink"><ExternalLink className="h-3.5 w-3.5" /></a> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <Alert tone="info" title="Where official photos come from">Brands and distributors publish pack shots in their trade/asset portals; for local Merta products, a plain photo on a white sheet in daylight works. Anything imported here is re-framed to 1000×1000 WebP so every card matches.</Alert>
      </CardBody>
    </Card>
  );
}
