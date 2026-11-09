import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

/**
 * Server Supabase client bound to the request cookies (Server Components, Route Handlers, Server Actions).
 * Built once per request: every data helper in a render shares the same client.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are refreshed by proxy.ts instead.
        }
      },
    },
  });
});

/** What a render needs to know about the signed-in person; the rest lives in `profiles`. */
export type AuthUser = { id: string; email: string | null; phone: string | null; is_anonymous: boolean; user_metadata: Record<string, unknown> };

/**
 * The signed-in auth user, resolved once per request. The project signs its JWTs with an asymmetric
 * key, so `getClaims()` verifies the token locally against the published JWKS instead of a round trip
 * to Supabase Auth on every page (`getUser()` cost 150–250 ms each). Every data query still carries
 * the JWT and is authorised by RLS in Postgres, so nothing here is trusted beyond identifying the row
 * owner. Falls back to `getUser()` if claims cannot be verified locally.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (!error && data?.claims?.sub) {
    const c = data.claims;
    return { id: c.sub, email: c.email ?? null, phone: c.phone ?? null, is_anonymous: Boolean(c.is_anonymous), user_metadata: (c.user_metadata ?? {}) as Record<string, unknown> };
  }
  if (error) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null, phone: user.phone ?? null, is_anonymous: Boolean(user.is_anonymous), user_metadata: (user.user_metadata ?? {}) as Record<string, unknown> } : null;
});

export type SessionUser = { id: string; email: string | null; role: Database["public"]["Enums"]["user_role"]; fullName: string | null; phone: string | null; avatarUrl: string | null };

/** Cached per request: the signed-in user + profile role, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const [supabase, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, full_name, phone, avatar_url").eq("id", user.id).maybeSingle();
  return {
    id: user.id,
    email: user.email ?? null,
    role: profile?.role ?? "customer",
    fullName: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
    phone: profile?.phone ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  };
});
