import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  const base = site.url.replace(/\/$/, "");
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin", "/store", "/rider", "/account", "/checkout", "/cart", "/api", "/orders", "/setup", "/login", "/register", "/forgot-password"] },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
