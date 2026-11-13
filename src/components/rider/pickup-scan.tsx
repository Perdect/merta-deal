"use client";
import * as React from "react";
import { ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { resolveCodeAction, riderScanPickupAction } from "@/lib/actions/scan";
import { useScanner, scanFeedback } from "@/lib/scan/use-scanner";
import type { RiderAssignment } from "@/types/app";
import { useT } from "@/lib/rider-i18n";

/**
 * Rider pickup by scanning the order label on the bag. The server checks the order is this rider's
 * and is packed; a scan can only mark the order picked up, never delivered.
 */
export function PickupScan({ a, onChanged }: { a: RiderAssignment; onChanged: () => void }) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const onCode = React.useCallback(async (code: string) => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      const r = await resolveCodeAction(code);
      if (!r.ok) { scanFeedback(false); setMessage({ ok: false, text: r.error }); return; }
      if (r.data.kind !== "rider_order" || r.data.order.id !== a.order.id) { scanFeedback(false); setMessage({ ok: false, text: r.data.kind === "rider_order" ? t("scan.wrongOrder", { scanned: r.data.order.order_number, expected: a.order.order_number }) : t("scan.notThisOrder") }); return; }
      if (!r.data.order.packed) { scanFeedback(false); setMessage({ ok: false, text: t("scan.notPacked") }); return; }
      const p = await riderScanPickupAction(a.order.id);
      if (!p.ok) { scanFeedback(false); setMessage({ ok: false, text: p.error }); return; }
      scanFeedback(true);
      toast.success(p.data.already ? t("scan.alreadyPickedUp") : t("collect.pickedUp"), t("collect.nowToCustomer"));
      setOpen(false);
      onChanged();
    } catch { scanFeedback(false); setMessage({ ok: false, text: t("scan.noConnection") }); }
    finally { setBusy(false); }
  }, [a.order.id, a.order.order_number, busy, onChanged, t]);
  const { videoRef, status, canSwitch, switchCamera, torchSupported, torchOn, toggleTorch } = useScanner(open, onCode);

  if (!open) return <Button variant="outline" size="lg" fullWidth className="mt-3 h-12 rounded-xl" onClick={() => setOpen(true)}><ScanLine className="h-5 w-5" /> {t("scan.button")}</Button>;
  return (
    <div className="mt-3 space-y-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" aria-label="Camera view" />
        {status !== "running" ? <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-medium text-white/90">{status === "denied" ? t("scan.cameraBlocked") : status === "unavailable" ? t("scan.noCamera") : status === "error" ? t("scan.cameraError") : t("scan.starting")}</p> : null}
        <div className="absolute right-2 top-2 flex gap-1.5">
          {canSwitch ? <button type="button" onClick={switchCamera} aria-label={t("scan.switch")} className="tap h-11 rounded-full bg-black/55 px-3 text-xs font-bold text-white">{t("scan.switch")}</button> : null}
          {torchSupported ? <button type="button" onClick={toggleTorch} aria-pressed={torchOn} aria-label="Torch" className="tap h-11 rounded-full bg-black/55 px-3 text-xs font-bold text-white">{torchOn ? t("scan.torchOff") : t("scan.torch")}</button> : null}
          <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="tap flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white"><X className="h-5 w-5" /></button>
        </div>
      </div>
      {busy ? <p className="text-center text-xs text-ink-3">{t("common.checking")}</p> : null}
      {message ? <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert> : null}
    </div>
  );
}
