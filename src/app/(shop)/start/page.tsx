import type { Metadata } from "next";
import { redirect } from "next/navigation";

/** Universal QR landing: opens the home screen with the location sheet. Printed QR codes point here. */
export const metadata: Metadata = { title: "Start shopping", robots: { index: false, follow: true } };

export default function StartPage() {
  redirect("/?pick=1");
}
