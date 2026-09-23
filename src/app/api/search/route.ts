import { NextResponse, type NextRequest } from "next/server";
import { searchProducts } from "@/lib/data/catalog";
import { parseListingParams } from "@/lib/listing-params";

export const dynamic = "force-dynamic";

/** Paged product search (used for "Load more"). Same params as the /search page. */
export async function GET(req: NextRequest) {
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const res = await searchProducts(parseListingParams(sp));
  return NextResponse.json(res, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
}
