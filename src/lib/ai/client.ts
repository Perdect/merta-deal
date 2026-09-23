import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

/**
 * Claude model used for the shopping assistant and order parsing.
 * Sonnet 5 is the default for cost/latency; override with ANTHROPIC_MODEL (e.g. claude-opus-5).
 */
export const AI_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";

export const isClaudeConfigured = () => Boolean(serverEnv().anthropicKey);

let cached: Anthropic | null = null;

/** Returns an Anthropic client when ANTHROPIC_API_KEY is set, otherwise null (callers fall back to the rule-based parser). */
export function getAnthropic(): Anthropic | null {
  const key = serverEnv().anthropicKey;
  if (!key) return null;
  if (!cached) cached = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 25_000 });
  return cached;
}
