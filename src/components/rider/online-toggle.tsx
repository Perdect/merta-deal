"use client";
import * as React from "react";
import { MapPinOff, Power } from "lucide-react";
import { setOnlineAction } from "@/lib/actions/rider";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { getCurrentFix } from "./use-rider-gps";
import { useT } from "@/lib/rider-i18n";

/**
 * Big one-thumb online switch. Going online needs a real GPS fix first (`rider_set_online(true, lat, lng)`);
 * if the browser denies location we show the error and stay offline — nothing is faked.
 */
export function OnlineToggle() {
  const { t } = useT();
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
        toast.success(t("online.nowOnline"), t("online.nowOnlineBody"));
      } else {
        const r = await setOnlineAction(false);
        if (!r.ok) { setError(r.error); return; }
        setOnline(false);
        toast.info(t("online.nowOffline"), activeDelivery ? t("online.nowOfflineActive") : t("online.nowOfflineBody"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("online.updateFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <button type="button" role="switch" aria-checked={isOnline} aria-busy={busy} disabled={!enabled} onClick={toggle}
        className={cn("flex min-h-[80px] w-full items-center gap-3.5 rounded-[20px] border p-4 text-left shadow-card transition-colors active:scale-[0.99] disabled:opacity-60",
          isOnline ? "border-success/30 bg-success-50" : "border-line bg-card")}>
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", isOnline ? "bg-success text-white" : "bg-surface-2 text-ink-3")}><Power className="h-6 w-6" strokeWidth={2.4} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[17px] font-extrabold text-ink">{busy ? (isOnline ? t("online.goingOffline") : t("online.gettingLocation")) : isOnline ? t("online.youAreOnline") : t("online.youAreOffline")}</span>
          <span className="block text-[13px] text-ink-3">
            {status !== "active" ? t("online.needsActivation") : isOnline ? t("online.acceptingNearby") : t("online.tapToGoOnline")}
          </span>
        </span>
        <span aria-hidden className={cn("relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors", isOnline ? "bg-success" : "bg-line-2")}>
          <span className={cn("inline-block h-6 w-6 rounded-full bg-white shadow transition-transform", isOnline ? "translate-x-7" : "translate-x-1")} />
        </span>
      </button>
      {error ? <Alert tone="danger" icon={<MapPinOff className="h-4 w-4" />}>{error}</Alert> : null}
      {!error && isOnline && (gps.status === "denied" || gps.status === "unavailable") ? (
        <Alert tone="danger" icon={<MapPinOff className="h-4 w-4" />} title={t("online.gpsOffTitle")}>{gps.error} {t("online.gpsOffBody")}</Alert>
      ) : null}
    </section>
  );
}
