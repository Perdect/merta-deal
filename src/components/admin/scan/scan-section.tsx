"use client";
import * as React from "react";
import { Camera, PackageSearch, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { loadOrderAction, loadProductAction, packScanAction, resolveCodeAction, stockAction } from "@/lib/actions/scan";
import type { ScanOrder, ScanProduct, StockInput } from "@/lib/scan/types";
import { toBaseQuantity } from "@/lib/scan/format";
import { usePendingQueue, type PendingItem, type SendOutcome } from "@/lib/scan/use-pending-queue";
import { scanFeedback } from "@/lib/scan/use-scanner";
import { Scanner, ScanBanner } from "./scanner";
import { ProductPanel, type StockOutcome } from "./product-panel";
import { OrderPanel, type LastScan } from "./order-panel";
import { PendingBanner, isNetworkFailure, newKey } from "./shared";

type View = { kind: "idle" } | { kind: "loading"; code: string } | { kind: "product"; product: ScanProduct } | { kind: "order"; order: ScanOrder } | { kind: "unknown"; code: string } | { kind: "error"; code: string; message: string };

const OFFLINE = "No connection. Check the network and try again.";

/**
 * The Scan section. One camera, two kinds of label: a product label opens stock actions, an order
 * label opens packing and dispatch. While packing, every product scan is checked against the open
 * order. Changes made without a connection wait in a visible queue and are never shown as saved.
 */
export function ScanSection({ userId, siteUrl, initialCode, initialOrderId, initialProductId }: { userId: string; siteUrl: string; initialCode?: string; initialOrderId?: string; initialProductId?: string }) {
  const [view, setView] = React.useState<View>({ kind: "idle" });
  const [packing, setPacking] = React.useState(false);
  const [lastScan, setLastScan] = React.useState<LastScan>(null);
  const [capture, setCapture] = React.useState(false);
  const [captured, setCaptured] = React.useState<string | null>(null);
  const viewRef = React.useRef(view);
  React.useEffect(() => { viewRef.current = view; }, [view]);
  const busyRef = React.useRef(false);

  const showProduct = React.useCallback((p: ScanProduct) => setView({ kind: "product", product: p }), []);
  const showOrder = React.useCallback((o: ScanOrder) => { setView({ kind: "order", order: o }); if (o.status !== "preparing") setPacking(false); }, []);

  // Queued changes are sent with their original request keys, so a change that did reach the server is not applied twice.
  const send = React.useCallback(async (item: PendingItem): Promise<SendOutcome> => {
    try {
      if (item.kind === "stock") {
        const r = await stockAction(item.input, true);
        if (!r.ok) return { failed: r.error };
        const v = viewRef.current; if (v.kind === "product" && v.product.id === item.input.productId) showProduct(r.data.product);
        toast.success("Saved", item.label);
        return "saved";
      }
      const r = await packScanAction(item.id, item.orderId, item.code);
      if (!r.ok) return { failed: r.error };
      const v = viewRef.current; if (v.kind === "order" && v.order.id === item.orderId) { showOrder(r.data.order); setLastScan({ result: r.data.result, message: r.data.message, at: Date.now() }); }
      return "saved";
    } catch (e) { return isNetworkFailure(e) ? "offline" : { failed: String((e as Error).message ?? e) }; }
  }, [showOrder, showProduct]);
  const queue = usePendingQueue(userId, send);
  const pendingScans = view.kind === "order" ? queue.items.filter((i) => i.kind === "pack" && i.orderId === view.order.id && !i.error).length : 0;

  const lookup = React.useCallback(async (code: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setView({ kind: "loading", code });
    try {
      const r = await resolveCodeAction(code);
      if (!r.ok) { scanFeedback(false); setView({ kind: "error", code, message: r.error }); return; }
      const d = r.data;
      if (d.kind === "product") { scanFeedback(true); showProduct(d.product); }
      else if (d.kind === "order") { scanFeedback(true); setLastScan(null); showOrder(d.order); }
      else { scanFeedback(false); setView({ kind: "unknown", code }); }
    } catch (e) { scanFeedback(false); setView({ kind: "error", code, message: isNetworkFailure(e) ? OFFLINE : String((e as Error).message ?? e) }); }
    finally { busyRef.current = false; }
  }, [showOrder, showProduct]);

  const packScan = React.useCallback(async (order: ScanOrder, code: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const key = newKey();
    try {
      const r = await packScanAction(key, order.id, code);
      if (!r.ok) { scanFeedback(false); setLastScan({ result: "unknown", message: r.error, at: Date.now() }); return; }
      scanFeedback(r.data.result === "ok");
      setLastScan({ result: r.data.result, message: r.data.message, at: Date.now() });
      showOrder(r.data.order);
    } catch (e) {
      if (!isNetworkFailure(e)) { scanFeedback(false); setLastScan({ result: "unknown", message: String((e as Error).message ?? e), at: Date.now() }); return; }
      queue.enqueue({ id: key, kind: "pack", orderId: order.id, code, label: `Scan ${code.slice(0, 24)} for ${order.order_number}` });
      scanFeedback(false);
      setLastScan({ result: "pending", message: "No connection — this scan is pending and not counted yet.", at: Date.now() });
    } finally { busyRef.current = false; }
  }, [queue, showOrder]);

  const onCode = React.useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    if (capture) { setCaptured(code); scanFeedback(true); return; }
    const v = viewRef.current;
    if (packing && v.kind === "order") { void packScan(v.order, code); return; }
    void lookup(code);
  }, [capture, packing, packScan, lookup]);

  const submitStock = React.useCallback(async (input: StockInput): Promise<StockOutcome> => {
    const v = viewRef.current; const name = v.kind === "product" ? `${v.product.name} ${v.product.pack_label ?? ""}` : "product";
    const base = toBaseQuantity(input.quantity, input.unit);
    const label = `${input.action === "receive" ? "Receive" : input.action === "wastage" ? "Wastage" : input.direction === "add" ? "Add" : "Remove"} ${base?.label ?? input.quantity} · ${name}`;
    try {
      const r = await stockAction(input, true);
      if (!r.ok) return { status: "failed", error: r.error };
      showProduct(r.data.product);
      toast.success(r.data.replayed ? "Already saved" : "Stock updated", label);
      return { status: "saved", replayed: r.data.replayed };
    } catch (e) {
      if (!isNetworkFailure(e)) return { status: "failed", error: String((e as Error).message ?? e) };
      queue.enqueue({ id: input.requestKey, kind: "stock", label, input });
      toast.custom({ title: "Pending — not saved yet", description: "No connection. It will be sent when you're back online.", tone: "warning" });
      return { status: "pending" };
    }
  }, [queue, showProduct]);

  const pickVariant = React.useCallback(async (id: string) => {
    try { const r = await loadProductAction(id); if (r.ok) showProduct(r.data); else toast.error(r.error); } catch { toast.error(OFFLINE); }
  }, [showProduct]);

  // Opened from a link: /q/<code>, an order page ("Pack by scan") or a product page.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return; started.current = true;
    // Deferred a tick: these lookups set state, which an effect body should not do synchronously.
    queueMicrotask(() => {
      if (initialCode) void lookup(initialCode);
      else if (initialOrderId) loadOrderAction(initialOrderId).then((r) => { if (r.ok) showOrder(r.data); else toast.error(r.error); }).catch(() => toast.error(OFFLINE));
      else if (initialProductId) void pickVariant(initialProductId);
    });
  }, [initialCode, initialOrderId, initialProductId, lookup, showOrder, pickVariant]);

  const cameraOn = capture || view.kind === "idle" || view.kind === "loading" || (packing && view.kind === "order");
  const reset = () => { setView({ kind: "idle" }); setPacking(false); setLastScan(null); setCapture(false); setCaptured(null); };

  return (
    <div className="theme-scan mx-auto w-full max-w-lg space-y-4 lg:max-w-4xl lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0">
      <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        {cameraOn ? (
          <Scanner active={cameraOn} onCode={onCode}
            hint={capture ? "Point the camera at the packet's own barcode." : packing && view.kind === "order" ? `Packing ${view.order.order_number} — scan each product label.` : "Product label, order label or a packet barcode."}
            manualLabel={capture ? "Or type the barcode digits" : packing ? "Or type the product SKU" : "Or type the SKU, barcode or order number"}>
            {view.kind === "loading" ? <ScanBanner tone="info" title="Looking up…" detail={view.code} /> : null}
            {capture ? <ScanBanner tone="info" title="Reading a barcode for this product" /> : null}
            {packing && lastScan && view.kind === "order" ? <ScanBanner tone={lastScan.result === "ok" ? "ok" : lastScan.result === "extra" || lastScan.result === "pending" ? "warn" : "bad"} title={lastScan.message} /> : null}
          </Scanner>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-card px-3 py-2.5">
            <Camera className="h-5 w-5 text-ink-3" aria-hidden />
            <p className="min-w-0 flex-1 text-sm text-ink-2">Camera paused</p>
            <Button size="md" onClick={reset}><ScanLine className="h-4 w-4" />Scan next</Button>
          </div>
        )}
        {capture ? <Button variant="outline" fullWidth onClick={() => setCapture(false)}><X className="h-4 w-4" />Stop reading barcode</Button> : null}
        {packing && view.kind === "order" ? <Button variant="outline" fullWidth onClick={() => setPacking(false)}>Pause scanning</Button> : null}
        <PendingBanner items={queue.items} online={queue.online} flushing={queue.flushing} onRetry={() => void queue.flush()} onDismiss={queue.dismiss} />
      </div>

      <div className="min-w-0">
        {view.kind === "idle" || view.kind === "loading" ? (
          <div className="rounded-2xl border border-dashed border-line-2 p-6 text-center">
            <PackageSearch className="mx-auto h-8 w-8 text-ink-4" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-ink">Scan a label to begin</p>
            <ul className="mt-2 space-y-1 text-left text-xs text-ink-3">
              <li><strong className="text-ink-2">Product label</strong> — see price, stock and reserved stock; receive, record wastage, adjust, or view history.</li>
              <li><strong className="text-ink-2">Order label</strong> (on the packing slip) — pack it item by item, assign a rider, confirm the handover.</li>
              <li><strong className="text-ink-2">Packet barcode</strong> — works once it is saved on the product.</li>
            </ul>
          </div>
        ) : null}
        {view.kind === "unknown" ? (
          <Alert tone="warning" title="Unknown code">
            <span className="font-mono text-xs">{view.code}</span> is not a Merta Deal product label, order label, or a barcode saved on a product. To use a packet&rsquo;s own barcode, open that product and add the barcode.
            <div className="mt-2"><Button size="sm" variant="outline" onClick={reset}>Try again</Button></div>
          </Alert>
        ) : null}
        {view.kind === "error" ? (
          <Alert tone="danger" title="Couldn't look that up">{view.message}<div className="mt-2"><Button size="sm" variant="outline" onClick={() => void lookup(view.code)}>Retry</Button> <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button></div></Alert>
        ) : null}
        {view.kind === "product" ? <ProductPanel product={view.product} siteUrl={siteUrl} onProduct={showProduct} onPickVariant={pickVariant} submitStock={submitStock} captured={captured} onCapture={(on) => { setCapture(on); if (!on) setCaptured(null); }} /> : null}
        {view.kind === "order" ? <OrderPanel order={view.order} onOrder={showOrder} packing={packing} setPacking={setPacking} lastScan={lastScan} pendingScans={pendingScans} /> : null}
      </div>
    </div>
  );
}
