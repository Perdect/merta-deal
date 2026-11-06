import { site } from "@/config/site";

/**
 * Social profiles of the business, read from the public `settings` rows `social_facebook`,
 * `social_instagram`, `social_linkedin`. Only a well-formed https link on the matching domain counts;
 * anything else is treated as "not set" so a typo never becomes a broken icon on every page.
 */
export type SocialNetwork = "facebook" | "instagram" | "linkedin";
export type SocialLink = { network: SocialNetwork; label: string; url: string };

export const SOCIAL_NETWORKS: { network: SocialNetwork; key: string; label: string; hosts: string[] }[] = [
  { network: "facebook", key: "social_facebook", label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"] },
  { network: "instagram", key: "social_instagram", label: "Instagram", hosts: ["instagram.com", "instagr.am"] },
  { network: "linkedin", key: "social_linkedin", label: "LinkedIn", hosts: ["linkedin.com", "lnkd.in"] },
];

/** Returns the normalised https URL when it points at one of `hosts` (or a subdomain), else null. */
export function validSocialUrl(raw: unknown, hosts: string[]): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  u.protocol = "https:";
  return u.toString();
}

/** Which network a settings key belongs to, or undefined for other keys. */
export const socialNetworkForKey = (key: string) => SOCIAL_NETWORKS.find((n) => n.key === key);

/** The links that are actually set, in display order. A setting wins; `site.socialProfiles` fills the gaps. */
export function socialLinks(settings: Record<string, unknown>): SocialLink[] {
  return SOCIAL_NETWORKS.flatMap((n) => {
    const url = validSocialUrl(settings[n.key], n.hosts) ?? site.socialProfiles.map((p) => validSocialUrl(p, n.hosts)).find(Boolean);
    return url ? [{ network: n.network, label: n.label, url }] : [];
  });
}
