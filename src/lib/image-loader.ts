"use client";
/**
 * next/image loader for the whole app (next.config.ts → images.loaderFile).
 *
 * Pictures are resized by the shop's own /api/img route, not by Vercel's metered image optimizer (its
 * monthly allowance ran out on 22 Nov 2026 and photos went missing) and not served at their stored size
 * (some uploads are over 3 MB, which made every page crawl on mobile data). Each width is produced once and
 * then held by the CDN for a year. SVGs and inline data are passed through untouched.
 */
export default function imageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  if (src.startsWith("data:") || src.startsWith("blob:") || /\.svg(\?|$)/i.test(src)) return src;
  return `/api/img?u=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 72}`;
}
