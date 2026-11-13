"use client";
import * as React from "react";
import { setOnlineAction } from "@/lib/actions/rider";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { getCurrentFix } from "./use-rider-gps";
import { useT } from "@/lib/rider-i18n";

/**
 * Going online needs a real GPS fix first (`rider_set_online(true, lat, lng)`); if the browser denies
 * location the rider is told and stays offline. Nothing is faked. Shared by the header switch.
 */
export function useOnlineToggle() {
  const { t } = useT();
  const rider = useRiderStore((s) => s.rider);
  const isOnline = useRiderStore((s) => s.isOnline);
  const activeDelivery = useRiderStore((s) => s.activeDelivery);
  const setOnline = useRiderStore((s) => s.setOnline);
  const setGps = useRiderStore((s) => s.setGps);
  const [busy, setBusy] = React.useState(false);
  const status = rider?.status ?? "pending";
  const enabled = status === "active" && !busy;

  const toggle = async () => {
    if (!enabled) return;
    setBusy(true);
    try {
      if (!isOnline) {
        const fix = await getCurrentFix();
        const r = await setOnlineAction(true, { lat: fix.lat, lng: fix.lng });
        if (!r.ok) { toast.error(t("online.updateFailed"), r.error); return; }
        setGps({ fix, status: "starting", error: null });
        setOnline(true);
        toast.success(t("online.nowOnline"), t("online.nowOnlineBody"));
      } else {
        const r = await setOnlineAction(false);
        if (!r.ok) { toast.error(t("online.updateFailed"), r.error); return; }
        setOnline(false);
        toast.info(t("online.nowOffline"), activeDelivery ? t("online.nowOfflineActive") : t("online.nowOfflineBody"));
      }
    } catch (e) {
      toast.error(t("online.updateFailed"), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return { isOnline, busy, enabled, status, toggle };
}

/** The header's online switch: one tap, green when accepting requests. */
export function OnlineSwitch({ className, tone = "default" }: { className?: string; tone?: "default" | "light" }) {
  const { t } = useT();
  const { isOnline, busy, enabled, toggle } = useOnlineToggle();
  const light = tone === "light";
  return (
    <button type="button" role="switch" aria-checked={isOnline} aria-busy={busy} disabled={!enabled} onClick={toggle} aria-label={isOnline ? t("online.youAreOnline") : t("online.youAreOffline")}
      className={cn("relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", light ? (isOnline ? "bg-white" : "bg-white/25") : (isOnline ? "bg-brand-600" : "bg-line-2"), className)}>
      <span className={cn("inline-block h-6 w-6 rounded-full shadow transition-transform", light && isOnline ? "bg-brand-700" : "bg-white", isOnline ? "translate-x-7" : "translate-x-1", busy && "animate-pulse-soft")} />
    </button>
  );
}
