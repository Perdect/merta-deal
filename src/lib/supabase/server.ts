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

/**
 * The signed-in auth user, fetched once per request. `auth.getUser()` is a network call to Supabase
 * Auth; without this cache a page that needs the user in several places (layout, cart,
 * addresses…) paid for it several times over.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
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
