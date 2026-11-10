import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

/**
 * Lands the links Supabase Auth emails (password recovery, magic link, email change): exchanges the
 * one-time code for a session cookie, then continues to `next` (same-origin paths only). A missing or
 * used code goes to the sign-in page with a plain message instead of an error screen.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "/account/settings?reset=1");
  if (!code) return NextResponse.redirect(new URL("/login?link=invalid", url.origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?link=expired", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
