import { redirect } from "next/navigation";

/** Merta Deal sells directly, so the only payouts are to riders. */
export default function AdminPayoutsPage() {
  redirect("/admin/payouts/riders");
}
