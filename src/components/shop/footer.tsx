import Link from "next/link";
import { Mail, Phone, Truck, MapPin, Bike, Megaphone } from "lucide-react";
import { site } from "@/config/site";
import { Logo } from "@/components/ui/misc";
import { InstallButtons } from "@/components/pwa/install-buttons";
import { SocialLinks } from "@/components/shop/social-links";
import type { SocialLink } from "@/lib/social";

/**
 * Footer: brand + app badges + social profiles (from settings, only when set), Shop, Help, For Partners (rider sign-up
 * live; ads coming soon), and a bottom bar with the legal links. Phones: brand on top, link columns two-up; desktop: four columns.
 */
export function Footer({ social = [] }: { social?: SocialLink[] }) {
  const tel = `tel:+${site.supportPhone.replace(/\D/g, "")}`;
  const link = "inline-flex items-center gap-2 text-ink-2 transition-colors hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600 pointer-coarse:min-h-11";
  const list = "mt-4 space-y-2.5 text-sm pointer-coarse:space-y-0";
  const heading = "text-[13px] font-bold uppercase tracking-wider text-ink";
  const icon = "h-4 w-4 shrink-0 text-ink-3";
  return (
    <footer className="mt-8 border-t border-line bg-card pb-nav md:mt-12 md:pb-0">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-9 sm:px-6 md:pb-10 md:pt-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-3 lg:grid-cols-[1.8fr_1fr_1fr_1fr] lg:gap-x-6 xl:gap-x-10">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-ink-2">{site.tagline}</p>
            <ul className="mt-4 space-y-2 text-[13px] text-ink-3">
              <li className="flex items-center gap-2"><MapPin className={icon} strokeWidth={1.75} aria-hidden />{site.city}, Rajasthan · {site.servicePincodes.join(", ")}</li>
              <li className="flex items-center gap-2"><Truck className={icon} strokeWidth={1.75} aria-hidden />{site.deliveryWindowShort} delivery across {site.city}</li>
            </ul>
            <h2 className={`${heading} mt-7`}>Download the app</h2>
            <InstallButtons className="mt-3 flex flex-wrap gap-2 space-y-0 [&>p]:basis-full [&>p]:text-xs" />
            {social.length ? <><h2 className={`${heading} mt-7`}>Follow us</h2><SocialLinks links={social} className="mt-3" /></> : null}
          </div>

          <nav aria-labelledby="footer-shop">
            <h2 id="footer-shop" className={heading}>Shop</h2>
            <ul className={list}>
              <li><Link href="/c/grocery" className={link}>Grocery &amp; kirana</Link></li>
              <li><Link href="/c/vegetables" className={link}>Vegetables</Link></li>
              <li><Link href="/c/fruits" className={link}>Fruits</Link></li>
              <li><Link href="/categories" className={link}>All categories</Link></li>
              <li><Link href="/delivery-area" className={link}>Delivery area &amp; charges</Link></li>
            </ul>
          </nav>

          <nav aria-labelledby="footer-help">
            <h2 id="footer-help" className={heading}>Help</h2>
            <ul className={list}>
              <li><a href={`mailto:${site.supportEmail}`} className={`${link} min-w-0`}><Mail className={icon} strokeWidth={1.75} aria-hidden /><span className="min-w-0">{site.supportEmail.split("@")[0]}@<wbr />{site.supportEmail.split("@")[1]}</span></a></li>
              <li><a href={tel} className={link}><Phone className={icon} strokeWidth={1.75} aria-hidden />{site.supportPhone}</a></li>
              <li><Link href="/about" className={link}>About {site.seoName}</Link></li>
              <li><Link href="/account/support" className={link}>Help &amp; support</Link></li>
              <li><Link href="/track" className={link}>Track an order</Link></li>
            </ul>
          </nav>

          <section aria-labelledby="footer-partners" className="col-span-2 md:col-span-1">
            <h2 id="footer-partners" className={heading}>For Partners</h2>
            <ul className={list}>
              <li><Link href="/deliver" className={link}><Bike className={icon} strokeWidth={1.75} aria-hidden />Deliver with Merta Deal</Link></li>
              {[
                { icon: Megaphone, label: "Advertise with us" },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex flex-wrap items-center gap-2 text-ink-3 pointer-coarse:min-h-11"><Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />{label}
                  <span className="rounded-full bg-saffron-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-saffron-700 ring-1 ring-inset ring-saffron-200">Coming soon</span></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-3">Want to work with us in {site.city}? Write to <a href={`mailto:${site.supportEmail}`} className="font-semibold text-brand-700 hover:underline">{site.supportEmail}</a>.</p>
          </section>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-4 text-xs text-ink-3 sm:px-6 md:flex-row md:justify-between">
          <p>© {new Date().getFullYear()} {site.name}. All rights reserved.</p>
          <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
            <Link href="/terms" className="hover:text-brand-700 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">Terms and Conditions</Link>
            <Link href="/privacy" className="hover:text-brand-700 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">Privacy Policy</Link>
            <Link href="/attributions" className="hover:text-brand-700 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">Image credits</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
