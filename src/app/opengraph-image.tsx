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
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0B6E4F 0%, #0E8A63 60%, #12A374 100%)", color: "#FFFFFF", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 84, height: 84, borderRadius: 24, background: "#F4B942", display: "flex", alignItems: "center", justifyContent: "center", color: "#0B3D2C", fontSize: 52, fontWeight: 800 }}>M</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>{site.name}</div>
            <div style={{ fontSize: 22, opacity: 0.85 }}>{`${site.city}, ${site.state} · ${site.defaultPincode}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{site.tagline}</div>
          <div style={{ fontSize: 30, opacity: 0.92, maxWidth: 980, lineHeight: 1.3 }}>Groceries, masala, dairy and daily essentials from Merta City&apos;s trusted kirana stores — delivered in 30–60 minutes.</div>
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
