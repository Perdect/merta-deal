import type { Metadata, Viewport } from "next";

/**
 * Head tags that make /admin its own installed app ("MD Admin", blue), apart from the green shop
 * app and the rider app: its own manifest (id and scope /admin), icons and Apple title. Spread into
 * the `metadata` of the admin frame and of the admin sign-in page, the two entry points under /admin
 * that have no layout in common. Metadata merges shallowly, so `manifest`, `appleWebApp` and `icons`
 * here replace the shop's values from the root layout for these routes only; nothing else changes.
 */
export const adminAppMetadata = {
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "MD Admin" },
  icons: {
    icon: [{ url: "/icons/admin-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/admin-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/icons/admin-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
} satisfies Metadata;

/** Blue address bar / title bar for the admin app (the same blue as .theme-admin and admin.webmanifest); the rest mirrors the root viewport. */
export const adminAppViewport: Viewport = { themeColor: "#1d4ed8", width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };
