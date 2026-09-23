"use client";
import { Download, Printer, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { site } from "@/config/site";

/** Download / print / copy actions for the store QR poster. Print isolates #qr-poster via a print stylesheet. */
export function QrActions({ storeId }: { storeId: string }) {
  const path = `/qr/${storeId}`;
  const link = `${site.url.replace(/\/$/, "")}${path}`;
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast.success("Link copied", link); } catch { toast.error("Could not copy — long-press the link instead"); } };
  return (
    <div className="space-y-3">
      <style>{`@media print { body * { visibility: hidden !important; } #qr-poster, #qr-poster * { visibility: visible !important; } #qr-poster { position: fixed; left: 50%; top: 40px; transform: translateX(-50%); box-shadow: none; } }`}</style>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
        <Button variant="outline" href={`/api/qr?path=${encodeURIComponent(path)}&format=png&size=1024`}><Download className="h-4 w-4" /> PNG</Button>
        <Button variant="outline" href={`/api/qr?path=${encodeURIComponent(path)}&format=svg&size=1024`}><Download className="h-4 w-4" /> SVG</Button>
        <Button variant="outline" onClick={copy}><Copy className="h-4 w-4" /> Copy link</Button>
      </div>
      <p className="break-all text-xs text-ink-3">Link: <a href={path} target="_blank" rel="noreferrer" className="font-semibold text-brand-700">{link} <ExternalLink className="inline h-3 w-3" /></a><br />The code encodes your permanent store id, so it keeps working even if you rename the store. It opens your shop page once the store is approved.</p>
    </div>
  );
}
