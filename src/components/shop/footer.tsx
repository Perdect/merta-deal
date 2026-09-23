import Link from "next/link";
import { site, seoPages } from "@/config/site";
import { Logo } from "@/components/ui/misc";

export function Footer() {
  return (
    <footer className="mt-10 hidden border-t border-line bg-card md:block">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 md:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-ink-3">{site.tagline}</p>
          <p className="mt-2 text-xs text-ink-3">Delivering across {site.city}, {site.state}. Expanding to Nagaur, Jodhpur, Ajmer, Pali and Jaipur.</p>
        </div>
        <div>
          <h4 className="text-sm font-bold text-ink">Shop</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <li><Link href="/categories" className="hover:text-brand-700">All categories</Link></li>
            <li><Link href="/stores" className="hover:text-brand-700">Kirana stores near you</Link></li>
            <li><Link href="/c/local-products" className="hover:text-brand-700">Local products of Merta</Link></li>
            <li><Link href="/assistant" className="hover:text-brand-700">AI shopping assistant</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-bold text-ink">Merta City</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            {seoPages.map((p) => <li key={p.slug}><Link href={`/${p.slug}`} className="hover:text-brand-700">{p.title}</Link></li>)}
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-bold text-ink">Partner with us</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <li><Link href="/register?role=store_owner" className="hover:text-brand-700">Register your kirana store</Link></li>
            <li><Link href="/register?role=rider" className="hover:text-brand-700">Become a delivery partner</Link></li>
            <li><Link href="/account/support" className="hover:text-brand-700">Help &amp; support</Link></li>
            <li><a href={`tel:${site.supportPhone.replace(/\s/g, "")}`} className="hover:text-brand-700">{site.supportPhone}</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-ink-3">© {new Date().getFullYear()} {site.name}. Made in Merta City, Rajasthan. · <Link href="/attributions" className="hover:text-brand-700">Image credits</Link></div>
    </footer>
  );
}
