/**
 * Each admin section settles in with a short fade and rise when it is opened from the sidebar. A template
 * (not the layout) because it remounts when the section changes; filters, tabs and paging inside a section
 * are search params and do not replay it. Reduced-motion users get no animation.
 */
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-safe:animate-page-in">{children}</div>;
}
