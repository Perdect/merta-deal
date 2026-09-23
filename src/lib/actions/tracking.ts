"use server";
import { getOrderTracking } from "@/lib/data/orders";
import type { OrderTracking } from "@/types/app";

export async function getOrderTrackingAction(orderId: string): Promise<OrderTracking | null> {
  return getOrderTracking(orderId);
}
