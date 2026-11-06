import { site } from "@/config/site";
import { socialLinks } from "@/lib/social";

type Settings = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Contact and identity facts for pages and search data. Optional facts stay null until filled in under Admin → Settings. */
export function businessFacts(settings: Settings) {
  const phone = str(settings.support_phone) || site.supportPhone;
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const hours = (settings.business_hours ?? {}) as { open?: string; close?: string };
  const gbp = str(settings.google_business_profile_url);
  return {
    phone,
    tel: `tel:+${digits.length === 10 ? `91${digits}` : digits}`,
    email: str(settings.support_email) || site.supportEmail,
    street: str(settings.business_street_address) || null,
    fssai: str(settings.fssai_license_no) || null,
    googleProfile: /^https:\/\//.test(gbp) ? gbp : null,
    hours: hours.open && hours.close ? { open: hours.open, close: hours.close } : null,
    hoursConfirmed: settings.business_hours_confirmed === true,
  };
}

/**
 * The one business entity, with the same @id on every page that describes it. It carries only what the
 * site shows: locality-level address until a street is confirmed, opening hours only once the owner marks
 * them correct, public profiles only once set, and no geo, price range, ratings or reviews.
 */
export function businessNode(settings: Settings) {
  const b = businessFacts(settings);
  const sameAs = [...new Set([...site.socialProfiles, ...socialLinks(settings).map((l) => l.url), ...(b.googleProfile ? [b.googleProfile] : [])])];
  return {
    "@type": ["LocalBusiness", "OnlineStore"], "@id": `${site.url}/#organization`, name: site.seoName, alternateName: [site.name, "MertaDeal.com"], url: `${site.url}/`,
    description: `Local ordering and delivery service in ${site.city}, ${site.state}: grocery and kirana staples, fresh vegetables and fruits, gifts and sweets, delivered by ${site.seoName}'s own delivery partners.`,
    logo: { "@type": "ImageObject", url: `${site.url}/icons/icon-512.png`, width: 512, height: 512 },
    image: `${site.url}/opengraph-image`,
    email: b.email, telephone: b.phone, slogan: site.tagline,
    address: { "@type": "PostalAddress", ...(b.street ? { streetAddress: b.street } : {}), addressLocality: site.city, addressRegion: site.state, postalCode: site.defaultPincode, addressCountry: "IN" },
    areaServed: [
      { "@type": "City", name: site.city, containedInPlace: { "@type": "State", name: site.state } },
      // Pincodes as plain text: areaServed accepts Text, and no schema.org Place type models a pincode.
      ...site.servicePincodes.map((code) => `${code}, ${site.city}, ${site.state}, India`),
    ],
    ...(b.hours && b.hoursConfirmed ? { openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: b.hours.open, closes: b.hours.close }] } : {}),
    contactPoint: { "@type": "ContactPoint", contactType: "customer service", telephone: b.phone, email: b.email, areaServed: "IN", availableLanguage: ["en", "hi"] },
    knowsLanguage: ["en", "hi"],
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/** JSON-LD for a script tag: "<" escaped so page text can never close the tag. */
export const jsonLdHtml = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
