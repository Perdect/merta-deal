import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env, serverEnv } from "@/lib/env";

/**
 * Service-role client. ONLY for trusted server paths that have no user session
 * (payment webhooks, push fan-out). Returns null when the key is not configured so callers
 * can surface a configuration error instead of silently failing.
 */
export function createAdminClient() {
  const { serviceRoleKey } = serverEnv();
  if (!serviceRoleKey || !env.supabaseUrl) return null;
  return createSupabaseClient<Database>(env.supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
