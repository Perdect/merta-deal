import type { MetadataRoute } from "next";
import { site } from "@/config/site";

/**
 * Crawling rules. Private areas stay protected by authentication (proxy.ts + layouts); this file only
 * keeps crawlers out of them and out of internal search results. Pages that must not be indexed but
 * may be crawled (track, assistant, start) carry a `noindex` robots meta tag instead, because a
 * robots.txt block would stop Google from seeing that tag.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/store", "/rider", "/account", "/checkout", "/cart", "/orders", "/api/", "/setup", "/login", "/register", "/forgot-password", "/search", "/qr/", "/r/"],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
