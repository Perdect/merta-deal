import { LogoMark } from "@/components/ui/misc";
import { site } from "@/config/site";

/** Printable QR poster ("Scan to order") used by store + admin dashboards. */
export function QrPoster({ path, title, subtitle, code }: { path: string; title: string; subtitle?: string; code?: string }) {
  const img = `/api/qr?path=${encodeURIComponent(path)}&size=640`;
  return (
    <div className="mx-auto w-[360px] rounded-2xl border border-line bg-white p-6 text-center shadow-card print:shadow-none" id="qr-poster">
      <div className="flex items-center justify-center gap-2"><LogoMark size={36} /><span className="font-display text-xl font-extrabold text-ink">Merta<span className="text-fresh">Deal</span></span></div>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-saffron-700">Scan · Order · Pay</p>
      <div className="mx-auto mt-4 w-[260px] rounded-xl border-4 border-brand-600 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt={`QR code for ${title}`} width={244} height={244} />
      </div>
      <h3 className="mt-4 font-display text-lg font-bold text-ink">{title}</h3>
      {subtitle ? <p className="text-sm text-ink-3">{subtitle}</p> : null}
      <p className="mt-3 text-xs text-ink-3">Open your camera, scan, choose your location and pay. No app install needed.</p>
      {code ? <p className="mt-2 font-mono text-[11px] text-ink-4">{code}</p> : null}
      <p className="mt-1 text-[11px] text-ink-4">{site.url.replace(/^https?:\/\//, "")}</p>
    </div>
  );
}
