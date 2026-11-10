import { redirect } from "next/navigation";

/** The wholesale page moved from /account/shop to /account/wholesale when wholesale opened to every customer. */
export default function LegacyShopRedirect() {
  redirect("/account/wholesale");
}
