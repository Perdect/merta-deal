"use client";
import * as React from "react";
import Link from "next/link";
import { Link2, PackagePlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { ProductImage } from "@/components/shop/product-image";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { searchProductsAction, setBarcodeAction, type ProductPick } from "@/lib/actions/scan";
import type { ScanProduct } from "@/lib/scan/types";
import { cn } from "@/lib/utils";

/**
 * An unknown packet barcode was scanned: pick the product it belongs to and save the barcode on it,
 * or create the product with the barcode attached. From then on the packet's own barcode scans.
 */
export function LinkBarcode({ code, onLinked }: { code: string; onLinked: (p: ScanProduct) => void }) {
  const [q, setQ] = React.useState("");
  const term = useDebouncedValue(q, 250);
  const [results, setResults] = React.useState<ProductPick[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Results belong to the term they were fetched for; a shorter term clears them during render, not in the effect.
  const [resultsFor, setResultsFor] = React.useState("");
  const shown = term.trim().length >= 2 && resultsFor === term ? results : null;
  React.useEffect(() => {
    if (term.trim().length < 2) return;
    let on = true;
    searchProductsAction(term).then((r) => { if (!on) return; setResultsFor(term); if (r.ok) setResults(r.data); else setError(r.error); }).catch(() => on && setError("No connection."));
    return () => { on = false; };
  }, [term]);

  const link = async (p: ProductPick) => {
    if (busy) return;
    setBusy(p.id); setError(null);
    try {
      const r = await setBarcodeAction(p.id, code);
      if (!r.ok) { setError(r.error); return; }
      toast.success("Barcode linked", `${p.name} ${p.pack_label ?? ""} now scans from its packet.`);
      onLinked(r.data);
    } catch { setError("No connection. Try again."); }
    finally { setBusy(null); }
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-line bg-card p-3">
      <p className="text-sm font-semibold text-ink"><Link2 className="mr-1 inline h-4 w-4 text-brand-700" aria-hidden />Which product is this packet?</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type the product name, e.g. Tata Salt" aria-label="Search products" autoFocus
          className="h-12 w-full rounded-xl border border-line-2 bg-card pl-9 pr-3 text-base text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {shown ? shown.length === 0 ? <p className="text-sm text-ink-3">No product matches. Create it below.</p> : (
        <ul className="divide-y divide-line">
          {shown.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <ProductImage image={p.image_url} productName={p.name} packSize={p.pack_label} className="h-11 w-11 shrink-0" rounded="rounded-lg" sizes="44px" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                <span className="block text-xs text-ink-3">{[p.brand, p.pack_label, p.listed ? null : "no price yet"].filter(Boolean).join(" · ")}</span>
              </span>
              <Button size="sm" loading={busy === p.id} disabled={busy !== null} onClick={() => link(p)} className={cn("shrink-0")}>Link</Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Link href={`/admin/products/new?barcode=${code}`} className="tap inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-2 text-sm font-bold text-ink-2 hover:bg-surface-2">
        <PackagePlus className="h-4 w-4" aria-hidden />Create a new product with this barcode
      </Link>
    </div>
  );
}
