import type { SocialLink, SocialNetwork } from "@/lib/social";
import { cn } from "@/lib/utils";

/** Brand glyphs drawn inline (lucide dropped its brand icons). 24×24 viewBox, currentColor. */
function Glyph({ network, className }: { network: SocialNetwork; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", "aria-hidden": true, focusable: false } as const;
  if (network === "facebook") return (
    <svg {...common} fill="currentColor"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.026 4.388 11.02 10.125 11.927v-8.437H7.078v-3.49h3.047V9.43c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.971h-1.513c-1.491 0-1.956.93-1.956 1.886v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" /></svg>
  );
  if (network === "linkedin") return (
    <svg {...common} fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" /></svg>
  );
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="5" /><circle cx="12" cy="12" r="4.25" /><circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" stroke="none" /><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" /></svg>
  );
}

/** Icon row for the footer and the About page; renders nothing when no profile is set. */
export function SocialLinks({ links, className, size = "md" }: { links: SocialLink[]; className?: string; size?: "sm" | "md" }) {
  if (!links.length) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-2", className)} aria-label="Follow us">
      {links.map((l) => (
        <li key={l.network}>
          <a href={l.url} target="_blank" rel="noopener noreferrer me" aria-label={`${l.label} (opens in a new tab)`} title={l.label}
            className={cn("tap inline-flex items-center justify-center rounded-full border border-line bg-card text-ink-2 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600", size === "sm" ? "h-9 w-9" : "h-11 w-11")}>
            <Glyph network={l.network} className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
          </a>
        </li>
      ))}
    </ul>
  );
}
