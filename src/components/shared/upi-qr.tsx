"use client";
import * as React from "react";
import { Copy } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { upiLink, upiAppLinks, type UpiDetails } from "@/lib/upi";
import { formatINR } from "@/lib/utils";

/** A QR for one order: the amount and order number are filled in. Scanning it proves nothing by itself. */
export function UpiQr({ upi, amount, note }: { upi: UpiDetails; amount: number; note: string }) {
  const link = upiLink(upi, amount, note);
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 2, width: 480 })).then((u) => { if (live) setSrc(u); }).catch(() => undefined);
    return () => { live = false; };
  }, [link]);
  const copy = async () => { try { await navigator.clipboard.writeText(upi.id); toast.success("UPI ID copied"); } catch { toast.error("Could not copy"); } };
  return (
    <div className="text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={`UPI QR code for ${formatINR(amount, { precise: true })}`} width={220} height={220} className="mx-auto rounded-md bg-white" /> : <div className="mx-auto h-[220px] w-[220px] rounded-md bg-surface-2" aria-hidden />}
      <p className="mt-2 font-display text-xl font-extrabold tabular text-ink">{formatINR(amount, { precise: true })}</p>
      {upi.name ? <p className="text-xs text-ink-2">Pay to {upi.name}</p> : null}
      <button type="button" onClick={copy} className="tap mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-700"><Copy className="h-4 w-4" aria-hidden />{upi.id}</button>
      <div className="mt-2 hidden grid-cols-2 gap-2 pointer-coarse:grid">
        {upiAppLinks(upi, amount, note).map((a, i) => <a key={a.name} href={a.href} className={i === 3 ? "tap flex h-11 items-center justify-center rounded-lg border border-line-2 bg-card px-3 text-sm font-semibold text-ink" : "tap flex h-11 items-center justify-center rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white"}>{a.name}</a>)}
      </div>
      <p className="mt-2 hidden text-[11px] text-ink-3 pointer-coarse:block">Or scan the QR from any UPI app on another phone.</p>
    </div>
  );
}
