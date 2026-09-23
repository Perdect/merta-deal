import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestProductImage, fetchImage } from "@/lib/images/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  items: z.array(z.object({
    slug: z.string().min(1).optional(),
    product_id: z.string().uuid().optional(),
    url: z.string().url(),
    credit: z.string().max(200).optional(),
    source: z.string().max(120).optional(),
  })).min(1).max(50),
  setPrimary: z.boolean().default(true),
});

/**
 * Bulk import of supplied product photos (brand/supplier asset kits, or your own pack shots).
 * Each image is normalised to the catalogue's house style, uploaded to the product-images bucket
 * and attached to the product. Admin only. The caller owns the rights to the images they pass in.
 */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is required to store imported images." }, { status: 503 });

  const results: { slug?: string; product_id?: string; ok: boolean; url?: string; error?: string; source_px?: string }[] = [];
  for (const item of parsed.data.items) {
    try {
      const q = item.product_id
        ? await supabase.from("products").select("id, slug").eq("id", item.product_id).maybeSingle()
        : await supabase.from("products").select("id, slug").eq("slug", item.slug ?? "").maybeSingle();
      if (!q.data) { results.push({ slug: item.slug, product_id: item.product_id, ok: false, error: "Product not found" }); continue; }

      const raw = await fetchImage(item.url);
      const out = await ingestProductImage(raw);
      const path = `catalog/${q.data.slug}-${Date.now()}.webp`;
      const up = await admin.storage.from("product-images").upload(path, out.webp, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
      if (up.error) { results.push({ slug: q.data.slug, ok: false, error: up.error.message }); continue; }
      const { data: pub } = admin.storage.from("product-images").getPublicUrl(path);

      const { data: prod } = await supabase.from("products").select("image_url, images").eq("id", q.data.id).single();
      const gallery = (prod?.images ?? []) as string[];
      const patch = parsed.data.setPrimary
        ? { image_url: pub.publicUrl, images: prod?.image_url ? [prod.image_url, ...gallery].slice(0, 8) : gallery }
        : { images: [...gallery, pub.publicUrl].slice(0, 8) };
      const { error } = await supabase.from("products").update(patch).eq("id", q.data.id);
      if (error) { results.push({ slug: q.data.slug, ok: false, error: error.message }); continue; }
      await supabase.rpc("audit", { p_action: "product.image_import", p_entity: "products", p_entity_id: q.data.id, p_after: { url: pub.publicUrl, source: item.source ?? item.url, credit: item.credit ?? null } as never });
      results.push({ slug: q.data.slug, ok: true, url: pub.publicUrl, source_px: `${out.sourceWidth}×${out.sourceHeight}` });
    } catch (e) {
      results.push({ slug: item.slug, product_id: item.product_id, ok: false, error: e instanceof Error ? e.message : "Import failed" });
    }
  }
  return NextResponse.json({ imported: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
}
