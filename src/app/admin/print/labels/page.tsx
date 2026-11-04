import type { Metadata } from "next";
import Link from "next/link";
import { adminRpc, spGet, type SP } from "@/lib/data/admin";
import { env } from "@/lib/env";
import { qrLabelSvg } from "@/lib/qr/generate";
import { productQrValue } from "@/lib/scan/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Product labels" };

type LabelProduct = { id: string; name: string; brand_name: string | null; pack_label: string | null; sku: string; barcode: string | null; scan_code: string; category: string | null; listed: boolean; loose: boolean };
const SIZES = { a4: { label: "A4 sheet · 24 labels (63.5 × 33.9 mm)", page: "A4", margin: "13mm 7mm" }, roll: { label: "Roll · one 50 × 30 mm label per page", page: "50mm 30mm", margin: "0" } } as const;
type Size = keyof typeof SIZES;

/**
 * Printable product labels: QR, name, weight and SKU. The QR holds the packet's own barcode when one
 * is saved, otherwise a staff link carrying only the product's label code. No price is printed, so a
 * label stays valid when prices change.
 */
export default async function LabelsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ids = (spGet(sp, "ids") ?? "").split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/.test(s));
  const category = spGet(sp, "category") || null;
  const listedOnly = spGet(sp, "listed") !== "0";
  const size: Size = spGet(sp, "size") === "roll" ? "roll" : "a4";
  const copies = Math.min(10, Math.max(1, Number(spGet(sp, "copies") ?? 1) || 1));
  const { data, error } = await adminRpc<LabelProduct[]>("admin_label_products", { p_ids: ids.length ? ids : null, p_category: category, p_listed_only: listedOnly });
  const products = data ?? [];
  const labels = await Promise.all(products.flatMap((p) => Array.from({ length: copies }, (_, i) => ({ p, i }))).map(async ({ p, i }) => ({ key: `${p.id}-${i}`, p, svg: await qrLabelSvg(productQrValue(p, env.siteUrl)) })));
  const link = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    if (ids.length) q.set("ids", ids.join(",")); if (category) q.set("category", category); if (!listedOnly) q.set("listed", "0"); q.set("size", size); if (copies > 1) q.set("copies", String(copies));
    for (const [k, v] of Object.entries(patch)) { if (v === null) q.delete(k); else q.set(k, v); }
    return `/admin/print/labels?${q}`;
  };

  return (
    <>
      <style>{`@page { size: ${SIZES[size].page}; margin: ${SIZES[size].margin}; }`}</style>
      <div className="print-hide mx-auto max-w-4xl px-4 py-3">
        <h1 className="font-display text-lg font-bold text-ink">Product labels</h1>
        <p className="text-sm text-ink-2">{products.length} product{products.length === 1 ? "" : "s"} × {copies} {copies === 1 ? "copy" : "copies"} = {labels.length} label{labels.length === 1 ? "" : "s"}.{ids.length ? "" : listedOnly ? " Listed products only." : " All active products, including ones without a price."}{category ? ` Category: ${category}.` : ""}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5"><span className="text-xs font-semibold text-ink-3">Paper</span>{(Object.keys(SIZES) as Size[]).map((s) => <Link key={s} href={link({ size: s })} className={cn("rounded-md px-2 py-1 text-xs font-semibold", s === size ? "bg-brand-600 text-white" : "bg-card text-ink-2 ring-1 ring-line-2")}>{s === "a4" ? "A4 sheet" : "Roll 50×30"}</Link>)}</span>
          <span className="inline-flex items-center gap-1.5"><span className="text-xs font-semibold text-ink-3">Copies</span>{[1, 2, 3, 5, 10].map((c) => <Link key={c} href={link({ copies: c === 1 ? null : String(c) })} className={cn("rounded-md px-2 py-1 text-xs font-semibold", c === copies ? "bg-brand-600 text-white" : "bg-card text-ink-2 ring-1 ring-line-2")}>{c}</Link>)}</span>
          {!ids.length ? <Link href={link({ listed: listedOnly ? "0" : null })} className="rounded-md bg-card px-2 py-1 text-xs font-semibold text-ink-2 ring-1 ring-line-2">{listedOnly ? "Include products without a price" : "Listed products only"}</Link> : null}
        </div>
        <p className="mt-1 text-xs text-ink-3">{SIZES[size].label}. Print at 100% scale with no fit-to-page. The QR is the barcode where one is saved, otherwise a staff link with the label code; no price is encoded.</p>
        {error ? <p className="mt-2 text-sm font-semibold text-danger">Could not load products: {error.message}</p> : null}
      </div>

      {labels.length === 0 ? <p className="print-hide mx-auto max-w-4xl px-4 py-10 text-center text-sm text-ink-3">No products match. Choose products from the product list, or include unlisted ones.</p> : (
        <div className={cn("mx-auto bg-white print:mx-0", size === "a4" ? "grid w-[210mm] grid-cols-3 content-start gap-x-[2.5mm] gap-y-0 px-[7mm] py-[13mm] print:w-auto print:p-0" : "flex flex-wrap gap-2 p-4 print:block print:p-0")}>
          {labels.map(({ key, p, svg }) => (
            <article key={key} className={cn("flex overflow-hidden border border-dashed border-line-2 bg-white text-ink [break-inside:avoid] print:border-0", size === "a4" ? "h-[33.9mm] w-[63.5mm] gap-[2mm] p-[2mm]" : "h-[30mm] w-[50mm] gap-[1.5mm] p-[1.5mm] print:[break-after:page]")}>
              <div className={cn("shrink-0 [&>svg]:h-full [&>svg]:w-full", size === "a4" ? "h-[29.5mm] w-[29.5mm]" : "h-[27mm] w-[27mm]")} dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <p className="line-clamp-2 text-[9pt] font-bold">{p.name}</p>
                {p.brand_name ? <p className="truncate text-[6.5pt] text-ink-2">{p.brand_name}</p> : null}
                <p className="mt-auto text-[11pt] font-extrabold tabular">{p.pack_label ?? ""}</p>
                <p className="truncate font-mono text-[6.5pt] text-ink-2">{p.sku}{p.barcode ? ` · ${p.barcode}` : ""}</p>
                <p className="text-[5.5pt] font-semibold uppercase tracking-wide text-ink-3">Merta Deal{p.loose ? " · loose" : ""}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
