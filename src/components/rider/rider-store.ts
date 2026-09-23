"use client";
import { create } from "zustand";
import type { DeliveryPartner, RiderStats, TrackingLocation } from "@/types/app";

export type GpsFix = { lat: number; lng: number; accuracy: number | null; heading: number | null; speed: number | null; at: number };
export type GpsStatus = "idle" | "starting" | "watching" | "denied" | "unavailable" | "error";
export type GpsState = { status: GpsStatus; fix: GpsFix | null; lastSentAt: number | null; sendError: string | null; error: string | null };

/**
 * Client mirror of the rider's row + live GPS state. The database is the source of truth
 * (delivery_partners row, rider_dashboard_stats RPC); this store lets the top bar, home screen
 * and GPS streamer share one view of "am I online / on a delivery / where am I".
 */
type RiderState = {
  rider: DeliveryPartner | null;
  stats: RiderStats | null;
  isOnline: boolean;
  activeDelivery: boolean;
  /** Bumped by realtime events on delivery_assignments so screens refetch. */
  assignmentsVersion: number;
  realtime: boolean;
  gps: GpsState;
  hydrate: (rider: DeliveryPartner, activeDelivery: boolean) => void;
  setRider: (rider: DeliveryPartner) => void;
  setStats: (stats: RiderStats | null) => void;
  setOnline: (v: boolean) => void;
  setActiveDelivery: (v: boolean) => void;
  bumpAssignments: () => void;
  setRealtime: (v: boolean) => void;
  setGps: (patch: Partial<GpsState>) => void;
};

const idleGps: GpsState = { status: "idle", fix: null, lastSentAt: null, sendError: null, error: null };

export const useRiderStore = create<RiderState>((set) => ({
  rider: null,
  stats: null,
  isOnline: false,
  activeDelivery: false,
  assignmentsVersion: 0,
  realtime: false,
  gps: idleGps,
  hydrate: (rider, activeDelivery) => set({ rider, isOnline: rider.is_online, activeDelivery }),
  setRider: (rider) => set({ rider, isOnline: rider.is_online }),
  setStats: (stats) => set((s) => ({ stats, activeDelivery: stats ? stats.active > 0 : s.activeDelivery, isOnline: stats ? stats.rider.is_online : s.isOnline, rider: stats ? stats.rider : s.rider })),
  setOnline: (isOnline) => set((s) => ({ isOnline, rider: s.rider ? { ...s.rider, is_online: isOnline } : s.rider })),
  setActiveDelivery: (activeDelivery) => set({ activeDelivery }),
  bumpAssignments: () => set((s) => ({ assignmentsVersion: s.assignmentsVersion + 1 })),
  setRealtime: (realtime) => set({ realtime }),
  setGps: (patch) => set((s) => ({ gps: { ...s.gps, ...patch } })),
}));

/** Converts the latest browser fix into the shape `LiveMap` expects. */
export function fixToTrackingLocation(fix: GpsFix | null): TrackingLocation | null {
  if (!fix) return null;
  return { lat: fix.lat, lng: fix.lng, heading: fix.heading, speed_mps: fix.speed, accuracy_m: fix.accuracy, recorded_at: new Date(fix.at).toISOString() };
}
