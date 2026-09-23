import Link from "next/link";
import { Sparkles, Timer, ShieldCheck, Store, Mic } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { getHomeFeed, getWishlistIds, getCollections } from "@/lib/data/catalog";
import { SectionHeader } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { BannerCarousel } from "@/components/shop/banner-carousel";
import { CategoryCard } from "@/components/shop/category-card";
import { ProductRail } from "@/components/shop/product-card";
import { StoreCard } from "@/components/shop/store-card";
import { site } from "@/config/site";

export const revalidate = 60;

export default async function HomePage() {
  const [user, feed, wished, collections] = await Promise.all([getSessionUser(), getHomeFeed(), getWishlistIds(), getCollections()]);
  if (!feed) return <ErrorState title="We couldn't load the store" description="Please check your connection and try again." retryHref="/" />;
  const signedIn = Boolean(user);

  return (
    <div className="space-y-8 pt-3 sm:pt-5">
      <section aria-label="Offers"><BannerCarousel banners={feed.banners} /></section>

      <section aria-labelledby="cats">
        <SectionHeader title="Shop by category" href="/categories" />
        <div className="grid grid-cols-4 gap-x-2 gap-y-4 px-4 sm:grid-cols-6 sm:px-0 lg:grid-cols-12">
          {feed.categories.map((c) => <CategoryCard key={c.id} category={c} />)}
        </div>
      </section>

      <section className="mx-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-card p-3 text-center sm:mx-0 sm:p-4">
        {[{ icon: Timer, t: "30–60 min", s: "local delivery" }, { icon: Store, t: `${feed.nearby_stores.length}+ stores`, s: "in Merta City" }, { icon: ShieldCheck, t: "OTP verified", s: "safe handover" }].map(({ icon: Icon, t, s }) => (
          <div key={t} className="flex flex-col items-center gap-1">
            <Icon className="h-5 w-5 text-brand-600" />
            <span className="text-sm font-bold text-ink">{t}</span>
            <span className="text-[11px] text-ink-3">{s}</span>
          </div>
        ))}
      </section>

      {feed.buy_again.length ? (
        <section><SectionHeader title="Buy again" subtitle="From your previous orders" href="/orders" /><ProductRail products={feed.buy_again} signedIn={signedIn} wished={wished} /></section>
      ) : null}

      <section><SectionHeader title="Best sellers" subtitle="Most loved in Merta" href="/search?sort=popular" /><ProductRail products={feed.best_sellers} signedIn={signedIn} wished={wished} /></section>

      <section><SectionHeader title="Deals of the day" subtitle="Biggest savings right now" href="/search?sort=discount&minDiscount=10" /><ProductRail products={feed.deals} signedIn={signedIn} wished={wished} /></section>

      {collections.length ? (
        <section aria-label="Collections">
          <SectionHeader title="Curated for Merta" subtitle="Ready-made baskets for every occasion" />
          <div className="scroll-x px-4 sm:px-0">
            {collections.map((c, i) => (
              <Link key={c.id} href={c.href} className={`flex w-[220px] flex-col justify-between rounded-xl p-4 text-white shadow-card ${["bg-brand-700", "bg-[#B23A2E]", "bg-[#1F3A5F]", "bg-saffron-600"][i % 4]}`}>
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">{c.kind}</span>
                <span className="mt-6 font-display text-lg font-extrabold leading-tight">{c.title}</span>
                {c.description ? <span className="mt-1 line-clamp-2 text-xs text-white/80">{c.description}</span> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="px-4 sm:px-0">
        <Link href="/assistant" className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-brand-700 to-brand-600 p-4 text-white shadow-card">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15"><Sparkles className="h-6 w-6 text-saffron-300" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold">AI shopping assistant</span>
            <span className="block text-sm text-white/85">“Family of 4 ke liye ek hafte ka saaman” — get a ready list in seconds.</span>
          </span>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15"><Mic className="h-5 w-5" /></span>
        </Link>
      </section>

      {feed.popular.length ? <section><SectionHeader title="Popular in Merta" subtitle="Trending this month" href="/search?sort=popular" /><ProductRail products={feed.popular} signedIn={signedIn} wished={wished} /></section> : null}

      <section>
        <SectionHeader title="Nearby kirana stores" subtitle="Order from the shops you already trust" href="/stores" />
        <div className="scroll-x px-4 sm:px-0">{feed.nearby_stores.map((s) => <StoreCard key={s.id} store={s} compact />)}</div>
      </section>

      <section><SectionHeader title={signedIn ? "Recommended for you" : "Top rated"} href="/search?sort=popular" /><ProductRail products={feed.recommended} signedIn={signedIn} wished={wished} /></section>

      <section><SectionHeader title="New arrivals" href="/search?sort=newest" /><ProductRail products={feed.new_arrivals} signedIn={signedIn} wished={wished} /></section>

      <section><SectionHeader title="Local products of Merta" subtitle="Papad, ker sangri, Mathania mirch & more" href="/c/local-products" /><ProductRail products={feed.local_products} signedIn={signedIn} wished={wished} /></section>

      <section className="px-4 pb-4 text-center text-xs text-ink-3 sm:px-0">
        <p className="font-semibold text-ink-2">{site.name} · {site.tagline}</p>
        <p className="mt-1">Currently serving Merta City (341510, 341511). Nagaur, Jodhpur, Ajmer, Pali &amp; Jaipur coming soon.</p>
      </section>
    </div>
  );
}
