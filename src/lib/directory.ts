import { site } from "@/config/site";
import type { ServiceSlug } from "@/lib/service-pages";

export const BUSINESS_CATEGORIES = ["restaurant", "bakery", "hotel"] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export const DAY_LABEL: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
export type OpeningHours = Partial<Record<Day, { open: string; close: string }>>;

export type Business = {
  id: string; slug: string; category: BusinessCategory; name: string; description: string | null; logo_url: string | null; photos: string[];
  address_line: string | null; area: string | null; pincode: string | null; lat: number | null; lng: number | null; phone: string | null; whatsapp: string | null;
  opening_hours: OpeningHours | null; hours_verified: boolean; facilities: string[]; cuisines: string[]; veg_type: "pure_veg" | "veg_options" | "not_stated"; offers_rooms: boolean;
  accepts_delivery: boolean; delivery_coverage: string | null; delivery_charge: string | null; delivery_eta: string | null; order_confirmation: "immediate" | "business_approval";
  is_paid_placement: boolean; status: "draft" | "published" | "archived"; duplicate_of: string | null; contact_verified_at: string | null; updated_at: string;
};
export type MenuItem = { id: string; business_id: string; section: string | null; name: string; description: string | null; price: number | null; is_veg: boolean | null; is_available: boolean; product_id: string | null; sort_order: number };
export type ListingRequest = { id: string; kind: "new" | "update"; business_id: string | null; business_name: string; category: BusinessCategory; owner_name: string; owner_phone: string; whatsapp: string | null; address: string; details: string | null; status: "pending" | "approved" | "rejected"; review_note: string | null; created_at: string };

type DirectoryCopy = {
  path: string; plural: string; singular: string; schemaType: "Hotel" | "Restaurant" | "Bakery"; title: string; description: string; h1: string; hindi: string; intro: string;
  orderLabel: string | null; related: ServiceSlug[];
};

export const DIRECTORY: Record<BusinessCategory, DirectoryCopy> = {
  restaurant: {
    path: "/restaurants-merta-city", plural: "Restaurants", singular: "Restaurant", schemaType: "Restaurant",
    title: `Restaurants in ${site.city}: Menus, Timings & Delivery`,
    description: `Find restaurants in ${site.city}, Rajasthan. Compare menus, vegetarian options, timings and delivery, using details each business has confirmed with ${site.seoName}.`,
    h1: `Restaurants in ${site.city}`, hindi: `${site.cityHindi} के रेस्टोरेंट: मेन्यू, समय और डिलीवरी की जानकारी।`,
    intro: `Looking for somewhere to eat in ${site.city}, or a meal delivered? Search by name, or filter by cuisine, vegetarian options and delivery.`,
    orderLabel: "Order Food", related: ["food-delivery-merta-city", "fast-food-delivery-merta-city", "urgent-delivery-merta-city", "hotel-delivery-merta-city"],
  },
  bakery: {
    path: "/bakeries-merta-city", plural: "Bakeries", singular: "Bakery", schemaType: "Bakery",
    title: `Bakeries in ${site.city}: Cakes, Timings & Delivery`,
    description: `Find bakeries in ${site.city}, Rajasthan, for birthday cakes and baked goods. See products, timings and delivery details confirmed with ${site.seoName}.`,
    h1: `Bakeries in ${site.city}`, hindi: `${site.cityHindi} की बेकरी: केक, समय और डिलीवरी की जानकारी।`,
    intro: `Need a birthday cake or something fresh from the oven in ${site.city}? Search by name, or filter by what you need.`,
    orderLabel: "Order Cake", related: ["cake-delivery-merta-city", "sweets-delivery-merta-city", "gifts-delivery-merta-city", "urgent-delivery-merta-city"],
  },
  hotel: {
    path: "/hotels-merta-city", plural: "Hotels", singular: "Hotel", schemaType: "Hotel",
    title: `Hotels in ${site.city}: Rooms, Facilities & Contact`,
    description: `Find hotels in ${site.city}, Rajasthan. See facilities, location and contact details confirmed with ${site.seoName}, and enquire about rooms directly.`,
    h1: `Hotels in ${site.city}`, hindi: `${site.cityHindi} के होटल: सुविधाएं, पता और कमरों की जानकारी।`,
    intro: `Staying in ${site.city}? Only places offering accommodation are listed here. Search by name, then contact the hotel directly about rooms.`,
    orderLabel: null, related: ["hotel-delivery-merta-city", "food-delivery-merta-city", "delivery-boy-merta-city", "urgent-delivery-merta-city"],
  },
};

export const VEG_LABEL = { pure_veg: "Pure vegetarian", veg_options: "Vegetarian options", not_stated: null } as const;
export const profilePath = (b: Pick<Business, "category" | "slug">) => `${DIRECTORY[b.category].path}/${b.slug}`;

const time12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${(((h % 24) + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h % 24 < 12 ? "am" : "pm"}`; };
export const hoursText = (d: { open: string; close: string } | undefined) => (d ? `${time12(d.open)} – ${time12(d.close)}` : "Closed");

/** True or false only when reliable hours exist, null otherwise. Evaluated in India time. */
export function openNow(b: Pick<Business, "opening_hours" | "hours_verified">, now = new Date()): boolean | null {
  if (!b.hours_verified || !b.opening_hours) return null;
  const ist = new Date(now.getTime() + 330 * 60_000);
  const today = DAYS[(ist.getUTCDay() + 6) % 7];
  const slot = b.opening_hours[today];
  if (!slot) return false;
  const hm = `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
  return slot.close > slot.open ? hm >= slot.open && hm < slot.close : hm >= slot.open || hm < slot.close;
}

export const mapsHref = (b: Pick<Business, "lat" | "lng" | "name" | "address_line">) =>
  `https://www.google.com/maps/dir/?api=1&destination=${b.lat != null && b.lng != null ? `${b.lat},${b.lng}` : encodeURIComponent(`${b.name}, ${b.address_line ?? ""}, ${site.city}`)}`;

/** Hotel, Restaurant or Bakery data: only what the profile shows, nothing inferred. */
export function businessJsonLd(b: Business) {
  const d = DIRECTORY[b.category];
  const url = `${site.url}${profilePath(b)}`;
  const images = [...(b.logo_url ? [b.logo_url] : []), ...b.photos];
  const days = Object.entries(b.opening_hours ?? {}) as [Day, { open: string; close: string }][];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": d.schemaType, "@id": `${url}#business`, name: b.name, url, ...(b.description ? { description: b.description } : {}), ...(images.length ? { image: images } : {}),
        ...(b.phone ? { telephone: b.phone } : {}),
        address: { "@type": "PostalAddress", ...(b.address_line ? { streetAddress: b.address_line } : {}), addressLocality: site.city, addressRegion: site.state, ...(b.pincode ? { postalCode: b.pincode } : {}), addressCountry: "IN" },
        ...(b.lat != null && b.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng } } : {}),
        ...(b.hours_verified && days.length ? { openingHoursSpecification: days.map(([day, h]) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: DAY_LABEL[day], opens: h.open, closes: h.close === "24:00" ? "23:59" : h.close })) } : {}),
        ...(b.category !== "hotel" && b.cuisines.length ? { servesCuisine: b.cuisines } : {}),
        ...(b.category === "hotel" && b.facilities.length ? { amenityFeature: b.facilities.map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })) } : {}),
      },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${site.url}/` }, { "@type": "ListItem", position: 2, name: d.plural, item: `${site.url}${d.path}` }, { "@type": "ListItem", position: 3, name: b.name, item: url }] },
    ],
  };
}
