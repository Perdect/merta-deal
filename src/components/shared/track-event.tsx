"use client";
import * as React from "react";
import { track, type AnalyticsItem } from "@/lib/analytics";

/** Fires one analytics event when mounted (once per page view; `onceKey` dedupes across reloads). */
export function TrackEvent({ name, params, onceKey }: { name: "view_item" | "purchase"; params: { value?: number; transaction_id?: string; items: AnalyticsItem[] }; onceKey?: string }) {
  React.useEffect(() => {
    if (onceKey) {
      try { if (sessionStorage.getItem(onceKey)) return; sessionStorage.setItem(onceKey, "1"); } catch { /* private mode */ }
    }
    track(name, params);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
