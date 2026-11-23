"use server";
import type { ActionResult } from "@/lib/actions/cart";
import { getDeliveryCodeStatus } from "@/lib/data/alerts";
import type { DeliveryCodeStatusData } from "@/components/admin/notifications-admin";
import { friendlyError } from "@/lib/utils";

/**
 * Admin → Notifications: how the delivery code SMS requests went (0059). The database refuses anyone who is
 * not an admin (`admin_delivery_code_log`), and nothing it returns holds a code, a phone number or a name.
 */
export async function getDeliveryCodeStatusAction(): Promise<ActionResult<DeliveryCodeStatusData>> {
  try {
    return { ok: true, data: await getDeliveryCodeStatus() };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}
