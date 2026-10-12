import { ImageResponse } from "next/og";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default Open Graph card: brand green, wordmark, tagline and the city line. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #2A7F2F 0%, #329537 60%, #3FAA45 100%)", color: "#FFFFFF", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 84, height: 84, borderRadius: 24, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="64" height="64" viewBox="0 0 64 64"><g transform="translate(0 -2.5)"><path d="M12 18h6l5 22h22l5-16H21" fill="none" stroke="#329537" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="26" cy="48" r="3.5" fill="#329537" /><circle cx="42" cy="48" r="3.5" fill="#329537" /><path d="M37 25l-6.5 9h5.5l-3 7.5 7.5-9.5h-5.5z" fill="#F2A93B" /></g></svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>{site.name}</div>
            <div style={{ fontSize: 22, opacity: 0.85 }}>{`${site.city}, ${site.state} · ${site.defaultPincode}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{site.tagline}</div>
          <div style={{ fontSize: 30, opacity: 0.92, maxWidth: 980, lineHeight: 1.3 }}>Groceries, fresh fruits and vegetables from Merta Deal, Merta City&apos;s own online grocery stores — delivered in 20–25 minutes.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24, opacity: 0.9 }}>
          <div style={{ display: "flex", gap: 28 }}>
            <span>Sadar Bazaar</span><span>Station Road</span><span>Nagaur Road</span><span>Jodhpur Road</span>
          </div>
          <span style={{ fontWeight: 700 }}>{site.url.replace(/^https?:\/\//, "")}</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
