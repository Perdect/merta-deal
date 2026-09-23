import type { Database } from "@/types/database";

/** Channels mirror the Postgres enum `notification_channel`. */
export type NotificationChannel = Database["public"]["Enums"]["notification_channel"];

export type NotificationPayload = {
  userId: string;
  title: string;
  body: string;
  /** Absolute or site-relative URL to open when tapped. */
  url?: string | null;
  /** Free-form data (order_id, assignment_id, …) stored on the in-app row and sent with push. */
  data?: Record<string, unknown>;
  /** Notification type key, e.g. order_status. Defaults to "general". */
  type?: string;
};

export type SendResult =
  | { sent: true; count: number; detail?: string }
  | { sent: false; reason: "not_configured" | "no_recipient" | "error" | "not_implemented"; detail?: string; envVars?: string[] };

export interface NotificationProvider {
  channel: NotificationChannel;
  /** True only when every credential the transport needs is present. */
  isConfigured(): boolean;
  /** Never throws; never pretends. Returns the real outcome of the transport call. */
  send(payload: NotificationPayload): Promise<SendResult>;
}
