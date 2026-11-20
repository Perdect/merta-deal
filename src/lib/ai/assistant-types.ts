import { z } from "zod";
import type { AssistantSource, MatchCandidate, ShoppingItem } from "./schemas";

/**
 * Shapes shared by the assistant's server code and its screen. Nothing here touches the server, so the
 * client components can import it.
 */

/** The questions the assistant may answer, each from one block of live shop data (settings + delivery zones). */
export const FACT_TOPICS = ["delivery_charge", "free_delivery", "minimum_order", "delivery_time", "opening_hours", "payment_methods", "service_area"] as const;
export type FactTopic = (typeof FACT_TOPICS)[number];

/** One answer block, written by code from the data. Every figure in `lines` is a value read from the database. */
export type FactCard = { topic: FactTopic; title: string; lines: string[] };

export const ASSISTANT_INTENTS = ["shopping", "shop_question", "reorder", "account", "other"] as const;
export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];

/**
 * One row of a proposed list: what was asked for and the catalogue products that are it. No candidates
 * means the shop does not list it (shown as "not in our shop right now"), unless `lookup_failed`, which
 * means the catalogue could not be read and nothing is claimed either way.
 */
export type AssistantLine = { item: ShoppingItem; candidates: MatchCandidate[]; lookup_failed?: boolean };

export type AssistantLink = { href: string; label: string };

export type AssistantAnswer = {
  /** What produced the answer: Claude, the built-in rules, or (a plain "buy again" request) the customer's own orders. */
  source: AssistantSource | "orders";
  model: string | null;
  /** Set when the AI key is configured but the call failed and the rules answered instead. */
  fallback_reason: string | null;
  intent: AssistantIntent;
  reply: string;
  /** Where the product rows come from: the request just made, or the customer's own delivered orders. */
  lines_from: "request" | "orders";
  lines: AssistantLine[];
  /** Blocks of shop data that answer the question asked. Built by code, never by the model. */
  facts: FactCard[];
  /** Existing pages to go to when the assistant cannot answer (tracking, orders, support, delivery area). */
  links: AssistantLink[];
  /** True when a "buy again" request came from someone who is not signed in. */
  needs_sign_in?: boolean;
};

export const assistantAskSchema = z.object({
  message: z.string().trim().max(1200).default(""),
  mode: z.enum(["list", "order"]).default("list"),
  /** "reorder" skips the message altogether and reads the signed-in customer's own past orders. */
  action: z.enum(["ask", "reorder"]).default("ask"),
}).refine((v) => v.action === "reorder" || v.message.length >= 2, { message: "Kuch likhiye ya boliye", path: ["message"] });
export type AssistantAsk = z.infer<typeof assistantAskSchema>;
