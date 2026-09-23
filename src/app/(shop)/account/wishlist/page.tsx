import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getMyWishlist } from "@/lib/data/account";
import { ProductGrid } from "@/components/shop/product-card";
import { PageHeader } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "My wishlist", robots: { index: false } };
export const dynamic = "force-dynamic";
const LIMIT = 50;

export default async function WishlistPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/wishlist");
  const all = await getMyWishlist();
  const products = all.slice(0, LIMIT);
  return (
    <div className="pt-1">
      <PageHeader title="My wishlist" back="/account" subtitle={all.length ? `${all.length} saved item${all.length === 1 ? "" : "s"}` : undefined} />
      {products.length === 0 ? (
        <EmptyState icon={<Heart className="h-7 w-7" />} title="Nothing saved yet" description="Tap the heart on any product to keep it here for later." action={<Button href="/categories">Browse products</Button>} />
      ) : (
        <div className="px-4 sm:px-0">
          <ProductGrid products={products} signedIn wished={new Set(products.map((p) => p.id))} />
          {all.length > LIMIT ? <p className="mt-4 text-center text-xs text-ink-3">Showing your {LIMIT} most recent saves.</p> : null}
        </div>
      )}
    </div>
  );
}
