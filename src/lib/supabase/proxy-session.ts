import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { env, isSupabaseConfigured } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";

const ROLE_HOME: Record<string, string> = { rider: "/rider", admin: "/admin", super_admin: "/admin", customer: "/" };

const ALL_ROLES = ["customer", "rider", "admin", "super_admin"];
const PROTECTED: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin", roles: ["admin", "super_admin"] },
  { prefix: "/rider", roles: ["rider", "customer", "admin", "super_admin"] }, // applicants (customers) see their application status
  { prefix: "/account", roles: ALL_ROLES },
  { prefix: "/orders", roles: ALL_ROLES },
  { prefix: "/checkout", roles: ALL_ROLES },
];

/** Refreshes the Supabase session cookie and enforces role-based route access. */
export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    // Let the /setup page render; everything else redirects there with a clear message.
    if (request.nextUrl.pathname.startsWith("/setup") || request.nextUrl.pathname.startsWith("/api")) return NextResponse.next({ request });
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Local JWT verification (asymmetric signing keys): no Auth round trip per request. An expired
  // session is refreshed here and the new cookies are written to the response.
  const { data: claims } = await supabase.auth.getClaims();
  const user = claims?.claims?.sub ? { id: claims.claims.sub, is_anonymous: Boolean(claims.claims.is_anonymous) } : null;
  const path = request.nextUrl.pathname;
  const portal = path === "/admin" || path.startsWith("/admin/") ? "admin" : path === "/rider" || path.startsWith("/rider/") ? "rider" : null;
  const portalLogin = portal ? `/${portal}/login` : null;

  // Staff login pages are public. Someone already signed in with the right access goes straight in.
  if (portalLogin && path === portalLogin) {
    if (user && !user.is_anonymous) {
      const me = await profileFor(supabase, user.id);
      const inside = portal === "admin" ? me.active && (me.role === "admin" || me.role === "super_admin") : me.active && me.role === "rider";
      const home = portal === "admin" ? "/admin" : "/rider";
      if (inside) return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next"), home, home), request.url));
    }
    return response;
  }

  const rule = PROTECTED.find((r) => path === r.prefix || path.startsWith(r.prefix + "/"));
  if (rule) {
    const back = path + request.nextUrl.search;
    // Admin and rider areas need a real (non-guest) account; each portal has its own sign-in page.
    if (!user || (portalLogin && user.is_anonymous)) {
      const url = new URL(portalLogin ?? "/login", request.url);
      url.searchParams.set("next", back);
      return NextResponse.redirect(url);
    }
    const me = await profileFor(supabase, user.id);
    const allowed = rule.roles.includes(me.role) && (portal !== "admin" || me.active);
    if (!allowed) {
      if (portalLogin) {
        // Signed in, but not with a staff account: the portal's login page explains and offers a switch.
        const url = new URL(portalLogin, request.url);
        url.searchParams.set("next", back);
        url.searchParams.set("denied", "1");
        return NextResponse.redirect(url);
      }
      return NextResponse.redirect(new URL(ROLE_HOME[me.role] ?? "/", request.url));
    }
    response.headers.set("x-user-role", me.role);
  }

  // Signed-in users skip the customer sign-in pages — except guests (they sign in to keep their cart) and
  // anyone sent here with a reason to switch accounts.
  if (user && !user.is_anonymous && !request.nextUrl.searchParams.get("reason") && (path === "/login" || path === "/register")) {
    const me = await profileFor(supabase, user.id);
    return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next"), ROLE_HOME[me.role] ?? "/"), request.url));
  }
  return response;
}

/** Role and active flag from the profile (never from user-editable metadata). */
async function profileFor(supabase: ReturnType<typeof createServerClient<Database>>, userId: string) {
  const { data } = await supabase.from("profiles").select("role, is_active").eq("id", userId).maybeSingle();
  return { role: data?.role ?? "customer", active: data?.is_active ?? false };
}
