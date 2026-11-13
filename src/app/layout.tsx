import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toast";
import { site } from "@/config/site";
import { LaunchSplash, SplashShellEnd } from "@/components/shared/launch-splash";
import { Analytics } from "@/components/shared/analytics";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap", weight: ["600", "700", "800"] });

/** Launch images iOS shows while the installed app opens, as [CSS width, CSS height, pixel ratio]. iOS matches them exactly. */
const IOS_SPLASH = [[440, 956, 3], [430, 932, 3], [428, 926, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [402, 874, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [375, 667, 2], [320, 568, 2], [768, 1024, 2], [834, 1194, 2], [1024, 1366, 2]] as const;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  // Every page sets its own title, description and canonical; nothing here may imply one (a
  // site-wide canonical would point every page at the homepage).
  title: { default: `${site.seoName} | Online Grocery Delivery in ${site.city}`, template: `%s | ${site.seoName}` },
  description: site.description,
  applicationName: site.seoName,
  manifest: "/manifest.webmanifest",
  openGraph: { type: "website", locale: "en_IN", siteName: site.seoName },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: site.name, startupImage: IOS_SPLASH.map(([w, h, r]) => ({ url: `/splash/apple-${w * r}x${h * r}.png`, media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)` })) },
  formatDetection: { telephone: false },
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

// resizes-content: when the on-screen keyboard opens (Android Chrome), the layout shrinks instead of the
// keyboard covering fields and submit buttons. viewport-fit=cover + safe-area insets handle notches.
export const viewport: Viewport = { themeColor: "#329537", width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" data-scroll-behavior="smooth" className={`${inter.variable} ${jakarta.variable} h-full`}>
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
