import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null;

/**
 * Anonymous, cookie-free client for public catalogue reads that sit behind the Next data cache
 * (`unstable_cache` cannot read cookies). RLS applies as `anon`, so it can only ever see what a
 * signed-out visitor sees. Never use it for anything belonging to a user.
 */
export function createPublicClient() {
  return (client ??= createSupabaseClient<Database>(env.supabaseUrl, env.supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } }));
}
