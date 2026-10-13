import Link from "next/link";
import { Mail, Phone, Truck, MapPin } from "lucide-react";
import { site } from "@/config/site";
import { Logo } from "@/components/ui/misc";
import { InstallButtons } from "@/components/pwa/install-buttons";

/** Compact footer on every screen size: customer care, delivery info, useful links, app install. */
export function Footer() {
  const tel = `tel:+${site.supportPhone.replace(/\D/g, "")}`;
  const link = "inline-flex items-center text-ink-2 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600 pointer-coarse:min-h-11 pointer-coarse:min-w-11";
  return (
    <footer className="mt-6 border-t border-line bg-card pb-nav md:mt-10 md:pb-0">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-5 px-4 py-5 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr_1.1fr] md:gap-6 md:py-8">
        <div className="col-span-2 md:col-span-1">
          <Logo />
          <p className="mt-2 text-sm text-ink-3">{site.tagline}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3"><MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />Merta City, Rajasthan · 341510, 341511</p>
        </div>
        <div>
          <h2 className="text-sm font-bold text-ink">Customer care</h2>
          <ul className="mt-2 space-y-1.5 text-[13px] pointer-coarse:space-y-0 sm:text-sm">
            <li><a href={`mailto:${site.supportEmail}`} className={`inline-flex min-w-0 items-center gap-1.5 ${link}`}><Mail className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /><span>{site.supportEmail.split("@")[0]}@<wbr />{site.supportEmail.split("@")[1]}</span></a></li>
            <li><a href={tel} className={`inline-flex items-center gap-1.5 ${link}`}><Phone className="h-4 w-4" strokeWidth={1.75} aria-hidden />{site.supportPhone}</a></li>
            <li><Link href="/account/support" className={link}>Help &amp; support</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold text-ink">Delivery</h2>
          <ul className="mt-2 space-y-1.5 text-[13px] pointer-coarse:space-y-0 sm:text-sm">
            <li className="inline-flex items-center gap-1.5 text-ink-2"><Truck className="h-4 w-4" strokeWidth={1.75} aria-hidden />{site.deliveryWindowShort} across Merta City</li>
            <li><Link href="/delivery-area" className={link}>Delivery area & charges</Link></li>
            <li><Link href="/track" className={link}>Track an order</Link></li>
            <li><Link href="/c/grocery" className={link}>Grocery & kirana</Link></li>
            <li><Link href="/c/vegetables" className={link}>Vegetables</Link></li>
            <li><Link href="/c/fruits" className={link}>Fruits</Link></li>
            <li><Link href="/terms" className={link}>Terms and Conditions</Link></li>
            <li><Link href="/privacy" className={link}>Privacy Policy</Link></li>
            <li><Link href="/attributions" className={link}>Image credits</Link></li>
          </ul>
        </div>
        <div className="col-span-2 md:col-span-1">
          <h2 className="text-sm font-bold text-ink">Download App</h2>
          <InstallButtons className="mt-2 grid grid-cols-2 gap-2 space-y-0 md:grid-cols-1 [&>p]:col-span-2 md:[&>p]:col-span-1" />
        </div>
      </div>
      <div className="border-t border-line px-4 py-3 text-center text-xs text-ink-3">© {new Date().getFullYear()} {site.name}. All rights reserved.</div>
    </footer>
  );
}
