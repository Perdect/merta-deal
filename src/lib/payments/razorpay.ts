import "server-only";
import crypto from "node:crypto";
import Razorpay from "razorpay";
import { serverEnv } from "@/lib/env";

/** Razorpay server SDK, or null when keys are not configured (callers return a clear 503). */
export function getRazorpay() {
  const { razorpayKeyId, razorpayKeySecret } = serverEnv();
  if (!razorpayKeyId || !razorpayKeySecret) return null;
  return new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret });
}

/** Verifies the checkout callback signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const { razorpayKeySecret } = serverEnv();
  if (!razorpayKeySecret) return false;
  const expected = crypto.createHmac("sha256", razorpayKeySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** Verifies a webhook body against X-Razorpay-Signature using the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const { razorpayWebhookSecret } = serverEnv();
  if (!razorpayWebhookSecret || !signature) return false;
  const expected = crypto.createHmac("sha256", razorpayWebhookSecret).update(rawBody).digest("hex");
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
