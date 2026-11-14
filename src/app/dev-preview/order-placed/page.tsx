import { notFound } from "next/navigation";
import { OrderPlacedSplash } from "@/components/shop/order-placed-splash";

/** Development only: the post-checkout confirmation with fixture data, so the design can be checked without placing an order. */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  const confirmed = state !== "pending";
  return (
    <OrderPlacedSplash
      orderId="preview"
      orderNumber="MD2611001072"
      confirmed={confirmed}
      label="Home"
      addressLine="11, AAdil, Sadar Bazaar, Merta City"
      etaLabel={confirmed ? "8:40 pm" : null}
      codNote={confirmed ? "Keep ₹1,240 cash ready for the rider" : null}
    />
  );
}
