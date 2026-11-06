# MertaDeal — local SEO (Merta City)

Site: **https://mertadeal.com** (www, http and merta-deal.vercel.app all 308-redirect here).
Checked against Google Search Central documentation (crawling, canonicals, robots meta, sitemaps,
Product / Organization / Breadcrumb structured data, soft 404s). Rankings are never guaranteed;
changes take weeks to show in Search Console.

## Search intent → page

| Search | Page |
|---|---|
| grocery delivery in Merta City · MertaDeal | `/` |
| online kirana Merta City · मेड़ता सिटी में किराना डिलीवरी | `/c/grocery` |
| vegetable delivery Merta City · सब्ज़ी होम डिलीवरी | `/c/vegetables` |
| fruit delivery Merta City · फल होम डिलीवरी | `/c/fruits` |
| delivery charges / areas / timings Merta | `/delivery-area` (built live from delivery_zones + settings) |
| product names (e.g. "Aashirvaad atta 5 kg Merta") | `/p/<slug>` |

| gift / sweets / food / fast food / cake delivery Merta City | `/gifts-delivery-merta-city`, `/sweets-delivery-merta-city`, `/food-delivery-merta-city`, `/fast-food-delivery-merta-city`, `/cake-delivery-merta-city` |
| bulk sweets order Merta City | `/bulk-gifts-sweets-merta-city` |
| urgent delivery Merta City | `/urgent-delivery-merta-city` |
| home, hotel, office delivery Merta City | `/home-delivery-merta-city`, `/hotel-delivery-merta-city`, `/office-delivery-merta-city` |
| delivery boy in Merta City | `/delivery-boy-merta-city` |
| hotels, restaurants, bakeries in Merta City | `/hotels-merta-city`, `/restaurants-merta-city`, `/bakeries-merta-city` (+ `/<slug>` profiles) |

Service page wording lives in `src/lib/service-pages.ts`. Twenty minutes is always a target, never a promise; live figures come from settings.
Directory pages are `noindex` and out of the sitemap until they have a published profile. Only complete, contact-verified, non-duplicate profiles can be published (enforced by a trigger, migration 0040).

Retired duplicate location pages redirect permanently: `/grocery-merta-city`, `/masala-merta` → `/c/grocery`;
`/fresh-grocery-merta` → `/c/vegetables`; `/grocery-delivery-merta` → `/delivery-area`; `/stores`, `/s/*` → `/categories`.

## What is implemented (code)
- Unique title / description / canonical / H1 on home, categories, products and the delivery page
  (`src/config/seo.ts` for launch-category copy). The old site-wide `canonical: "/"` was removed.
- Filtered/sorted listings (`?sort=`, `?brand=` …) are `noindex, follow` and canonicalise to the
  category; `?page=N` is self-canonical.
- `noindex`: account, sign-in, cart, checkout, orders, search, track, assistant, not-found pages.
  robots.txt blocks private areas and internal search; authentication still protects private pages.
- Sitemap lists only canonical, indexable, 200-status URLs (home, categories, delivery area, active
  categories with products, products shown on the site).
- Missing/removed products and switched-off categories render "Page not found" with `noindex`.
  (Next.js streams the shell before the page decides, so the HTTP status stays 200; Google treats
  `noindex` pages as excluded. Temporarily out-of-stock products keep their page, marked OutOfStock.)
- Structured data: `OnlineStore` + `WebSite` (home), `Product`/`Offer` (price, INR, stock — identical to
  the visible page), `BreadcrumbList` (products, categories, delivery page), `CollectionPage`.
  Ratings appear only from approved genuine reviews (demo-account reviews were unpublished).
- GA4 events (view_item, add_to_cart, purchase) with no personal data — active once
  `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set. `GOOGLE_SITE_VERIFICATION` env adds the Search Console meta tag.

## Owner actions (need your accounts)

### 1. Google Search Console (15 min)
1. https://search.google.com/search-console → Add property → **Domain** → `mertadeal.com`.
2. Copy the TXT record → Hostinger hPanel → Domains → mertadeal.com → DNS records → Add **TXT**, name `@`.
3. Verify, then **Sitemaps** → submit `https://mertadeal.com/sitemap.xml`.
4. URL inspection → request indexing for `/`, `/c/grocery`, `/c/vegetables`, `/c/fruits`, `/delivery-area`.
5. Optional: Settings → Associations → link Google Analytics.

### 2. Google Analytics 4 (10 min)
Create a GA4 property (time zone India, currency INR) → Web stream for `https://mertadeal.com` →
copy the Measurement ID (`G-XXXX`) → Vercel → Project → Settings → Environment Variables →
`NEXT_PUBLIC_GA_MEASUREMENT_ID` (Production) → redeploy. Mark `purchase` as a key event.
Track organic visits (Reports → Acquisition → Organic Search), product views, add-to-cart and purchases.
Before enabling, add a short privacy notice to the site (analytics cookies) — required good practice
under India's DPDP Act.

### 3. Google Business Profile (eligibility first)
- Eligible as a **service-area business** only if MertaDeal makes deliveries in person and has a real
  location staff work from (not a virtual office). Use MertaDeal's own address — **never the supplier's
  Jaipur address**. Hide the address and set the service area to Merta City (341510, 341511).
- Name: **MertaDeal** (exactly as on the site/logo). Category: *Grocery delivery service* (secondary:
  *Grocery store* only if customers can walk in). Phone: +91 88750 20202. Website: https://mertadeal.com.
  Hours: 6:00 am–11:00 pm daily (keep identical to the site). Email support@mertadeal.com.
- Verification is done by the owner (usually a video showing the business, equipment and signage).
- Then add the street address to the site's structured data (ask to switch `OnlineStore` to a
  `GroceryStore` LocalBusiness with the verified address) — not before.

### 4. Reviews
Ask every customer after delivery (order page / WhatsApp) for a Google review using the GBP review
link. No discounts, coupons or rewards in exchange for reviews, no staff/family reviews, and reply to
every review. On-site product reviews are already limited to delivered orders.

### 5. Content still missing
- Privacy policy, terms and refund/return policy pages (needed for Play Store, GBP trust and
  merchant listings) — send the text and they will be published and linked in the footer.
- Confirm the five delivery zones and pincodes in Admin → Delivery zones are genuinely served
  (the delivery page shows them as-is).

## Measurements (2026-10-12, live, median of 5)
See the session report for before/after TTFB, HTML and JavaScript sizes. PageSpeed Insights was
unavailable (shared daily API quota exhausted) — run https://pagespeed.web.dev/ on `/`,
`/c/grocery` and a product page, and watch Search Console → Core Web Vitals once field data exists.
Largest remaining cost: ~320 KB (gzip) of JavaScript per page, of which ~68 KB is the Supabase
browser client loaded on every page — the next optimisation candidate.

## Google Business Profile: suggestions for the service pages
- Use the primary category that matches what customers mostly buy, and add only secondary categories the business really operates as. Delivery of gifts and sweets is a service, not a category to claim without a shop.
- Add each service (gift delivery, sweets delivery, urgent delivery, pickup and drop) with a one-line description and a link to its page.
- Keep hours, phone and WhatsApp identical to the site, and paste the profile link into Admin → Settings so it joins `sameAs`.
- Post real photos of packed orders and riders, and ask real customers for reviews. Never buy or write reviews.
- Posts: festival booking dates for bulk orders, linking to `/bulk-gifts-sweets-merta-city`.

## Homepage: suggestions
- Add a "Gifts, sweets, cakes and more" tile row once those categories have products.
- Keep the H1 on grocery until most orders are something else.
- Replace the share image, which only mentions groceries, once gifts and sweets are live.
