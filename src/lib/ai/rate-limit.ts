import "server-only";
import type { NextRequest } from "next/server";

/**
 * Tiny in-memory token bucket keyed by client IP. Good enough to stop a single client
 * from hammering the paid AI routes; it is per server instance (Vercel functions are not
 * shared), so treat it as a soft limit, not a security boundary.
 */
type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export function clientIp(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? req.headers.get("cf-connecting-ip") ?? "unknown";
}

/** Returns { ok, retryAfter } for `capacity` requests per `windowMs`. */
export function rateLimit(key: string, capacity = 20, windowMs = 60_000) {
  const now = Date.now();
  const refillPerMs = capacity / windowMs;
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_KEYS) buckets.delete(buckets.keys().next().value as string);
    b = { tokens: capacity, updated: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(capacity, b.tokens + (now - b.updated) * refillPerMs);
  b.updated = now;
  if (b.tokens >= 1) { b.tokens -= 1; return { ok: true as const, retryAfter: 0 }; }
  return { ok: false as const, retryAfter: Math.ceil((1 - b.tokens) / refillPerMs / 1000) };
}
