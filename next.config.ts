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
    ];
  },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/(.*)", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" }, { key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(self), payment=(self \"https://checkout.razorpay.com\")" },
      ] },
    ];
  },
};

export default nextConfig;
