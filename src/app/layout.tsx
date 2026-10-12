import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toast";
import { site } from "@/config/site";
import { LaunchSplash, SplashShellEnd } from "@/components/shared/launch-splash";
import { Analytics } from "@/components/shared/analytics";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap", weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  // Every page sets its own title, description and canonical; nothing here may imply one (a
  // site-wide canonical would point every page at the homepage).
  title: { default: `${site.seoName} | Grocery, Fruits & Vegetable Delivery in ${site.city}`, template: `%s | ${site.seoName}` },
  description: site.description,
  applicationName: site.seoName,
  manifest: "/manifest.webmanifest",
  openGraph: { type: "website", locale: "en_IN", siteName: site.seoName },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: site.name },
  formatDetection: { telephone: false },
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

// resizes-content: when the on-screen keyboard opens (Android Chrome), the layout shrinks instead of the
// keyboard covering fields and submit buttons. viewport-fit=cover + safe-area insets handle notches.
export const viewport: Viewport = { themeColor: "#329537", width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${jakarta.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <LaunchSplash />
        {children}
        <Toaster />
        <SplashShellEnd />
        <Analytics />
      </body>
    </html>
  );
}
