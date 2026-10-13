import Link from "next/link";
import { site } from "@/config/site";
import { AppBar } from "./app-bar";

/** Readable long-form layout shared by the Terms and Privacy pages. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="px-4 pb-10 pt-2 sm:px-0">
      <AppBar title={title} back="/" className="-mt-2" />
      <nav aria-label="Breadcrumb" className="text-xs text-ink-3 max-lg:hidden"><Link href="/" className="tap hover:text-brand-700">Home</Link> / <span className="text-ink">{title}</span></nav>
      {/* The bar shows the title on phones; the h1 stays for search engines and screen readers. */}
      <h1 className="mt-3 font-display text-2xl font-bold leading-tight text-ink max-lg:sr-only">{title}</h1>
      <p className="mt-1 text-xs text-ink-3 max-lg:mt-0">Last updated {updated}</p>
      <div className="mt-4 max-w-3xl space-y-6 text-[15px] leading-relaxed text-ink-2 [&_a]:font-semibold [&_a]:text-brand-700 [&_a:hover]:underline [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1.5 [&_p+p]:mt-2 [&_section>*+*]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <p>{intro}</p>
        {children}
        <section>
          <h2>Contact</h2>
          <p>
            {site.name}, {site.city}, Rajasthan, India · Email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> · Phone <a href={`tel:${site.supportPhone.replace(/\s/g, "")}`}>{site.supportPhone}</a> · or{" "}
            <Link href="/account/support">Help &amp; support</Link> in your account.
          </p>
        </section>
      </div>
    </article>
  );
}
