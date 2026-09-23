import { redirect } from "next/navigation";

/** Universal QR landing: opens the home screen with the location sheet. Printed QR codes point here. */
export default function StartPage() {
  redirect("/?pick=1");
}
