import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Debounced typeahead backed by the synonym-aware `search_suggest` function. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  if (q.trim().length < 2) return NextResponse.json({ products: [], brands: [], categories: [], stores: [] });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_suggest", { p_query: q, p_limit: 8 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
}
