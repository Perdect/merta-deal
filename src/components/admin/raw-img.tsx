import { cn } from "@/lib/utils";

/** Plain <img> for admin previews of arbitrary Storage URLs (thumbnails, logos, banners) where next/image sizing adds no value. */
export function RawImg({ src, alt = "", className, width, height }: { src: string; alt?: string; className?: string; width?: number; height?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={width} height={height} className={cn(className)} />;
}
