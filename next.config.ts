import type { NextConfig } from "next";

const supabaseHost = (() => { try { return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined; } catch { return undefined; } })();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      ...(supabaseHost ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }] : []),
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536],
    imageSizes: [40, 48, 64, 72, 96, 128, 180, 256],
    // Product photos never change under the same name (hashed files in /public, timestamped uploads in
    // storage), so an optimised copy can be kept for a month instead of being rebuilt on every visit.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  /** Retired URLs: permanent redirects so links and search results land on the page that replaced them. */
  async redirects() {
    return [
      { source: "/grocery-merta-city", destination: "/c/grocery", permanent: true },
      { source: "/fresh-grocery-merta", destination: "/c/vegetables", permanent: true },
      { source: "/masala-merta", destination: "/c/grocery", permanent: true },
      { source: "/kirana-store-merta", destination: "/c/grocery", permanent: true },
      { source: "/grocery-delivery-merta", destination: "/delivery-area", permanent: true },
      { source: "/stores", destination: "/categories", permanent: true },
      { source: "/s/:slug", destination: "/categories", permanent: true },
      // The store portal merged into the admin panel (0030): /store/orders -> /admin/orders, etc.
      { source: "/store", destination: "/admin", permanent: true },
      { source: "/store/:path*", destination: "/admin/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      // Content-hashed product and category artwork: browsers and the image optimiser may keep it for a year.
      { source: "/products/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/categories/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/banners/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/(.*)", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" }, { key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(self), payment=(self \"https://checkout.razorpay.com\")" },
      ] },
    ];
  },
};

export default nextConfig;
