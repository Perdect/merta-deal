import Link from "next/link";
import { cn } from "@/lib/utils";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import type { Category } from "@/types/app";

export function CategoryCard({ category, className, size = "md" }: { category: Pick<Category, "name" | "slug" | "icon" | "color" | "image_url">; className?: string; size?: "sm" | "md" | "lg" | "full" }) {
  // "full" lets the tile fill its grid column, so a short row of cards stays balanced
  // instead of leaving fixed-width circles stranded in wide columns.
  const dims = { sm: "h-14 w-14", md: "h-16 w-16 sm:h-20 sm:w-20", lg: "h-24 w-24", full: "aspect-square w-full max-w-[132px]" }[size];
  return (
    <Link href={`/c/${category.slug}`} className={cn("flex flex-col items-center gap-1.5 text-center", className)}>
      <span className={cn("flex items-center justify-center rounded-xl transition-transform group-hover:scale-105", dims)} style={{ backgroundColor: category.color ?? "#F1F9F1" }}>
        {category.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={category.image_url} alt="" className="h-3/4 w-3/4 object-contain" />
        ) : (
          <DynamicIcon name={category.icon} className={cn("text-brand-700", size === "full" ? "h-9 w-9 sm:h-11 sm:w-11" : "h-7 w-7 sm:h-8 sm:w-8")} />
        )}
      </span>
      <span className="line-clamp-2 text-xs font-semibold leading-tight text-ink sm:text-[13px]">{category.name}</span>
    </Link>
  );
}
