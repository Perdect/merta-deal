import { redirect } from "next/navigation";

/** Orders now live inside the account area. */
export default async function OrdersRedirect({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(tab ? `/account/orders?tab=${encodeURIComponent(tab)}` : "/account/orders");
}
