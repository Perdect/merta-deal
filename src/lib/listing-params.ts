import type { SearchParams } from "@/lib/data/catalog";

/** Parses listing URL search params (shared by /search, /c/[slug], /s/[slug] and the JSON API). */
export function parseListingParams(sp: Record<string, string | string[] | undefined>, overrides: Partial<SearchParams> = {}): SearchParams {
  const get = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };
  const num = (k: string) => { const v = get(k); return v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined; };
  return {
    q: get("q")?.slice(0, 80) || undefined,
    category: get("category") || undefined,
    brands: get("brand")?.split(",").filter(Boolean),
    minPrice: num("minPrice"), maxPrice: num("maxPrice"), minDiscount: num("minDiscount"),
    inStock: get("inStock") === "1", localOnly: get("local") === "1",
    storeId: get("store") || undefined,
    sort: get("sort") || "relevance",
    page: Math.max(1, num("page") ?? 1), pageSize: 24,
    ...overrides,
  };
}
