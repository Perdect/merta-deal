"use client";
import * as React from "react";
import { Power } from "lucide-react";
import { setOnlineAction } from "@/lib/actions/rider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useRiderStore } from "./rider-store";
import { getCurrentFix, GpsError } from "./use-rider-gps";
import { useT, type TKey } from "@/lib/rider-i18n";
import { EN } from "@/lib/rider-i18n-dict";

const GPS_ERROR_KEY: Record<GpsError["code"], TKey> = { unsupported: "gpsError.unsupported", denied: "gpsError.denied", timeout: "gpsError.timeout", unavailable: "gpsError.unavailable" };

/**
 * Going online needs a real GPS fix first (`rider_set_online(true, lat, lng)`); if the phone refuses
 * location the rider is told why, in their language, and stays offline. Nothing is faked. Shared by the
 * header switch and the home screen's big button: the busy flag and the last failure live in the store,
 * so the two never send at once and the reason stays on screen after the toast has gone.
 */
export function useOnlineToggle() {
  const { t } = useT();
  const rider = useRiderStore((s) => s.rider);
  const isOnline = useRiderStore((s) => s.isOnline);
  const activeDelivery = useRiderStore((s) => s.activeDelivery);
  const setOnline = useRiderStore((s) => s.setOnline);
  const setGps = useRiderStore((s) => s.setGps);
  const busy = useRiderStore((s) => s.onlineBusy);
  const errorKey = useRiderStore((s) => s.onlineError);
  const setBusy = useRiderStore((s) => s.setOnlineBusy);
  const status = rider?.status ?? "pending";
  const enabled = status === "active" && !busy;

  const toggle = async () => {
    if (!enabled || useRiderStore.getState().onlineBusy) return;
    setBusy(true, null);
    let failure: string | null = null;
    try {
      if (!isOnline) {
        const fix = await getCurrentFix();
        const r = await setOnlineAction(true, { lat: fix.lat, lng: fix.lng });
        if (!r.ok) { failure = r.error; toast.error(t("online.updateFailed"), r.error); return; }
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
      // A refused or missing GPS fix is named; anything else is a request that did not get through.
      failure = e instanceof GpsError ? GPS_ERROR_KEY[e.code] : "common.noConnectionRetry";
      toast.error(t("online.updateFailed"), t(failure as TKey));
    } finally {
      setBusy(false, failure);
    }
  };
  /** The reason the last attempt to go online failed, already worded (a dictionary line, or the server's own message). */
  const error = errorKey ? (errorKey in EN ? t(errorKey as TKey) : errorKey) : null;
  return { isOnline, busy, enabled, status, toggle, error };
}

/** The header's online switch with its word beside it: one tap, 48 px tall, white when online. */
export function OnlineSwitch({ className }: { className?: string }) {
  const { t } = useT();
  const { isOnline, busy, enabled, toggle } = useOnlineToggle();
  return (
    <button type="button" role="switch" aria-checked={isOnline} aria-busy={busy} disabled={!enabled} onClick={toggle} aria-label={isOnline ? t("online.youAreOnline") : t("online.youAreOffline")}
      className={cn("inline-flex h-12 shrink-0 items-center gap-2.5 rounded-full pl-4 pr-2 text-[15px] font-bold transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60",
        isOnline ? "bg-white text-brand-800" : "bg-white/15 text-white ring-1 ring-inset ring-white/40", className)}>
      <span aria-hidden>{busy ? "…" : isOnline ? t("status.online") : t("status.offline")}</span>
      <span aria-hidden className={cn("relative inline-flex h-8 w-[52px] items-center rounded-full transition-colors duration-200 motion-reduce:transition-none", isOnline ? "bg-brand-600" : "bg-white/30")}>
        <span className={cn("inline-block h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none", isOnline ? "translate-x-6" : "translate-x-1", busy && "motion-safe:animate-pulse-soft")} />
      </span>
    </button>
  );
}

/** The home screen's one control while offline: a large button that asks for the location and goes online. */
export function GoOnlineButton({ className }: { className?: string }) {
  const { t } = useT();
  const { busy, enabled, toggle, error } = useOnlineToggle();
  return (
    <div className={className}>
      <Button size="lg" fullWidth className="h-16 rounded-2xl text-[19px]" loading={busy} disabled={!enabled} onClick={toggle}>
        {busy ? t("online.gettingLocation") : <><Power className="h-6 w-6" aria-hidden /> {t("home.goOnline")}</>}
      </Button>
      {error ? <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-3.5 py-3 text-left text-[15px] font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
