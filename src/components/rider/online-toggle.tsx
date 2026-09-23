"use client";
import * as React from "react";
import { MapPinOff, Power } from "lucide-react";
import { setOnlineAction } from "@/lib/actions/rider";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { getCurrentFix } from "./use-rider-gps";

/**
 * Big one-thumb online switch. Going online needs a real GPS fix first (`rider_set_online(true, lat, lng)`);
 * if the browser denies location we show the error and stay offline — nothing is faked.
 */
export function OnlineToggle() {
  const rider = useRiderStore((s) => s.rider);
  const isOnline = useRiderStore((s) => s.isOnline);
  const activeDelivery = useRiderStore((s) => s.activeDelivery);
  const gps = useRiderStore((s) => s.gps);
  const setOnline = useRiderStore((s) => s.setOnline);
  const setGps = useRiderStore((s) => s.setGps);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const status = rider?.status ?? "pending";
  const enabled = status === "active" && !busy;

  const toggle = async () => {
    if (!enabled) return;
    setError(null); setBusy(true);
    try {
      if (!isOnline) {
        const fix = await getCurrentFix();
        const r = await setOnlineAction(true, { lat: fix.lat, lng: fix.lng });
        if (!r.ok) { setError(r.error); return; }
        setGps({ fix, status: "starting", error: null });
        setOnline(true);
        toast.success("You're online", "New delivery requests will show up here.");
      } else {
        const r = await setOnlineAction(false);
        if (!r.ok) { setError(r.error); return; }
        setOnline(false);
        toast.info("You're offline", activeDelivery ? "Your current delivery continues and GPS stays on until it's done." : "You won't receive new requests.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <button type="button" role="switch" aria-checked={isOnline} aria-busy={busy} disabled={!enabled} onClick={toggle}
        className={cn("flex min-h-[72px] w-full items-center gap-3 rounded-lg border p-4 text-left shadow-card transition-colors active:scale-[0.99] disabled:opacity-60",
          isOnline ? "border-success/30 bg-success-50" : "border-line bg-card")}>
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", isOnline ? "bg-success text-white" : "bg-surface-2 text-ink-3")}><Power className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-ink">{busy ? (isOnline ? "Going offline…" : "Getting your location…") : isOnline ? "You're online" : "You're offline"}</span>
          <span className="block text-xs text-ink-3">
            {status !== "active" ? "You can go online once an admin activates your account." : isOnline ? "Accepting delivery requests near you." : "Tap to go online and start receiving requests."}
          </span>
        </span>
        <span aria-hidden className={cn("relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors", isOnline ? "bg-success" : "bg-line-2")}>
          <span className={cn("inline-block h-6 w-6 rounded-full bg-white shadow transition-transform", isOnline ? "translate-x-7" : "translate-x-1")} />
        </span>
      </button>
      {error ? <Alert tone="danger" icon={<MapPinOff className="h-4 w-4" />}>{error}</Alert> : null}
      {!error && isOnline && (gps.status === "denied" || gps.status === "unavailable") ? (
        <Alert tone="danger" icon={<MapPinOff className="h-4 w-4" />} title="GPS is off">{gps.error} Customers and the store can&apos;t see where you are until it&apos;s back.</Alert>
      ) : null}
    </section>
  );
}
