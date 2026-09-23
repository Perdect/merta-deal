"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Browser Supabase client (singleton). Uses the anon key; RLS enforces access. */
export function createClient() {
  if (client) return client;
  client = createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
  return client;
}
