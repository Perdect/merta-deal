import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The sign-in picture: the shop's own photo of a Merta Deal delivery partner holding a box of everyday
 * products (supplied by the owner on 23 Nov 2026; the other retailer's signs in the background are softened).
 * It replaced the drawn scooter illustration. Decorative, so it is hidden from screen readers. The parent
 * sets the box (`absolute inset-0 …`); the photo covers it, anchored a little above centre so the face and
 * the box of products both stay in view in a short banner and in a tall side panel.
 */
export function LoginArt({ className }: { className?: string }) {
  return <Image src="/brand/login-hero.jpg" alt="" aria-hidden fill priority sizes="(max-width: 640px) 100vw, 460px" className={cn("object-cover object-[50%_28%]", className)} />;
}
