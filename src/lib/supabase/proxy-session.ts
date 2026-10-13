import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { env, isSupabaseConfigured } from "@/lib/env";

const ROLE_HOME: Record<string, string> = { store_owner: "/store", store_staff: "/store", rider: "/rider", admin: "/admin", super_admin: "/admin", customer: "/" };

const ALL_ROLES = ["customer", "store_owner", "store_staff", "rider", "admin", "super_admin"];
const PROTECTED: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin", roles: ["admin", "super_admin"] },
  { prefix: "/store/register", roles: ALL_ROLES },            // any signed-in user may register a kirana store
  { prefix: "/store", roles: ["store_owner", "store_staff", "admin", "super_admin"] },
  { prefix: "/rider", roles: ["rider", "customer", "admin", "super_admin"] }, // customers land on rider registration
  { prefix: "/account", roles: ["customer", "store_owner", "store_staff", "rider", "admin", "super_admin"] },
  { prefix: "/orders", roles: ["customer", "store_owner", "store_staff", "rider", "admin", "super_admin"] },
  { prefix: "/checkout", roles: ["customer", "store_owner", "store_staff", "rider", "admin", "super_admin"] },
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

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const rule = PROTECTED.find((r) => path === r.prefix || path.startsWith(r.prefix + "/"));

  if (rule) {
    if (!user) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    const role = (user.app_metadata?.role as string | undefined) ?? (await roleFor(supabase, user.id));
    if (!rule.roles.includes(role)) {
      // Staff areas: a guest or customer session gets the sign-in page (to switch to the staff account)
      // instead of a silent bounce to the shop home, which looked like a broken link.
      if (path.startsWith("/admin") || (path.startsWith("/store") && !path.startsWith("/store/register"))) {
        const url = new URL("/login", request.url);
        url.searchParams.set("next", path + request.nextUrl.search);
        url.searchParams.set("reason", path.startsWith("/admin") ? "admin" : "store");
        return NextResponse.redirect(url);
      }
      return NextResponse.redirect(new URL(ROLE_HOME[role] ?? "/", request.url));
    }
    response.headers.set("x-user-role", role);
  }

  // Signed-in users skip the sign-in pages — except guests (they sign in to keep their cart) and anyone
  // sent here to switch to a staff account.
  if (user && !user.is_anonymous && !request.nextUrl.searchParams.get("reason") && (path === "/login" || path === "/register")) {
    const role = await roleFor(supabase, user.id);
    return NextResponse.redirect(new URL(request.nextUrl.searchParams.get("next") ?? ROLE_HOME[role] ?? "/", request.url));
  }
  return response;
}

async function roleFor(supabase: ReturnType<typeof createServerClient<Database>>, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return data?.role ?? "customer";
}
