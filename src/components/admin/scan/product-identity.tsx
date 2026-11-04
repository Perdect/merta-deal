"use client";
import * as React from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Printer, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { DetailList } from "@/components/admin/kit/ui";
import { btn } from "@/components/admin/catalogue/bits";
import { setBarcodeAction, setStockModeAction } from "@/lib/actions/scan";
import type { ScanProduct } from "@/lib/scan/types";
import { formatGrams, formatPacks, productQrValue } from "@/lib/scan/format";

/** Product page panel: the codes on its label, the packet barcode, and whether its stock is shared grams or packs. */
export function ProductIdentity({ product: initial, siteUrl }: { product: ScanProduct; siteUrl: string }) {
  const [p, setP] = React.useState(initial);
  const [barcode, setBarcode] = React.useState(initial.barcode ?? "");
  const [busy, setBusy] = React.useState(false);
  const [modeOpen, setModeOpen] = React.useState(false);
  const [qr, setQr] = React.useState<string | null>(null);
  const value = productQrValue(p, siteUrl);
  React.useEffect(() => { let on = true; QRCode.toDataURL(value, { margin: 0, width: 160, errorCorrectionLevel: "M" }).then((d) => on && setQr(d)).catch(() => on && setQr(null)); return () => { on = false; }; }, [value]);

  const saveBarcode = async () => {
    if (busy) return;
    setBusy(true);
    const r = await setBarcodeAction(p.id, barcode);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setP(r.data); toast.success(barcode ? "Barcode saved" : "Barcode removed");
  };
  const switchMode = async () => {
    setBusy(true);
    const r = await setStockModeAction(p.id, p.stock_mode === "loose" ? "pack" : "loose");
    setBusy(false); setModeOpen(false);
    if (!r.ok) { toast.error(r.error); return; }
    setP(r.data); toast.success(r.data.stock_mode === "loose" ? "Stock now shared in grams across sizes" : "Stock now counted in packs");
  };
  const dirty = barcode !== (p.barcode ?? "");

  return (
    <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL, nothing to optimise */}
        {qr ? <img src={qr} alt={`QR label for ${p.name}`} width={160} height={160} className="mx-auto rounded-lg border border-line bg-white p-2" /> : <div className="mx-auto h-40 w-40 rounded-lg border border-line bg-surface" aria-hidden />}
        <p className="mt-1 break-all font-mono text-[11px] text-ink-3">{p.barcode ? `EAN ${p.barcode}` : p.scan_code}</p>
        <a href={`/admin/print/labels?ids=${p.id}`} target="_blank" rel="noopener" className={`${btn.outline} mt-2 w-full`}><Printer className="h-4 w-4" aria-hidden />Print label</a>
      </div>
      <div className="space-y-4">
        <DetailList items={[
          { label: "SKU", value: <span className="font-mono">{p.sku}</span> },
          { label: "Label code", value: <span className="font-mono text-xs">{p.scan_code}</span> },
          { label: "Stock type", value: <span className="flex flex-wrap items-center gap-2">{p.stock_mode === "loose" ? "Loose produce · shared grams across sizes" : "Prepacked · counted in packs"}{p.can_be_loose && p.listed ? <button type="button" onClick={() => setModeOpen(true)} className="text-xs font-semibold text-brand-700 underline">Change</button> : null}</span> },
          ...(p.stock_mode === "loose" && p.pool ? [{ label: "Shared balance", value: <span className="tabular">{formatGrams(p.pool.balance_g)} · reserved {formatGrams(p.pool.reserved_g)} · this size fills {formatPacks(p.available_packs)}</span> }] : []),
        ]} />
        <div className="flex flex-wrap items-end gap-2">
          <Input label="Packet barcode (EAN / UPC)" hint="8 to 14 digits printed on the packet. Scanning it then finds this product, and the label's QR carries it." value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, "").slice(0, 14))} inputMode="numeric" placeholder="8901234567890" className="font-mono" />
          <Button variant="outline" loading={busy} disabled={!dirty} onClick={saveBarcode}>{barcode ? "Save barcode" : "Remove barcode"}</Button>
        </div>
        <Link href={`/admin/scan?product=${p.id}`} className={btn.outline}><ScanLine className="h-4 w-4" aria-hidden />Open in Scan (receive, wastage, adjust)</Link>
      </div>
      <ConfirmDialog open={modeOpen} onClose={() => setModeOpen(false)} onConfirm={switchMode} loading={busy}
        title={p.stock_mode === "loose" ? "Count this size in packs instead?" : "Share this product's stock by weight?"}
        confirmLabel={p.stock_mode === "loose" ? "Count in packs" : "Share by weight"}
        description={p.stock_mode === "loose"
          ? <>{p.pack_label} leaves the shared balance with its current {formatPacks(p.available_packs)} ({formatGrams(p.available_packs * p.pack_grams)}) and is counted on its own from now on.</>
          : <>All sizes of {p.name} (same name and brand) draw from one balance in grams. Its current {formatPacks(p.available_packs)} ({formatGrams(p.available_packs * p.pack_grams)}) join that balance; nothing on the shelf changes.</>} />
    </div>
  );
}
