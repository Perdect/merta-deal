import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/shop/legal-page";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: `Terms for ordering groceries, sweets, cakes and other products from ${site.name} in ${site.city}: orders, payments, delivery, cancellations and refunds.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms and Conditions" updated="13 October 2026"
      intro={<>These terms apply when you use mertadeal.com or the {site.name} app to order groceries, sweets, cakes, bakery items, dry fruits and other products for delivery in {site.city}, Rajasthan. By creating an account or placing an order you agree to them. Please also read our <Link href="/privacy">Privacy Policy</Link>.</>}>
      <section>
        <h2>1. The service</h2>
        <p>{site.name} is a local online grocery service. Products are sold and packed by {site.name} and delivered by our delivery partners within our <Link href="/delivery-area">delivery areas</Link>.</p>
      </section>
      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>You sign in with your mobile number and a 6-digit PIN. Keep your PIN private; you are responsible for orders placed from your account.</li>
          <li>Give correct contact and address details so we can deliver. You must be 18 or older, or use the service with a parent or guardian.</li>
          <li>We may suspend accounts used for fraud, abuse of offers, or harassment of our staff or delivery partners.</li>
        </ul>
      </section>
      <section>
        <h2>3. Prices and charges</h2>
        <ul>
          <li>Product prices are in Indian rupees and include applicable taxes (MRP is tax-inclusive). Prices and stock can change until you place the order.</li>
          <li>A delivery fee applies based on your area, and is waived above the free-delivery amount shown for that area. A small platform fee may apply; GST is charged on delivery and platform fees. Every charge is shown in your cart before you pay.</li>
          <li>A minimum order value may apply in some areas. Coupons are subject to the conditions shown with them and cannot be exchanged for cash.</li>
        </ul>
      </section>
      <section>
        <h2>4. Orders</h2>
        <p>Cash-on-delivery orders are confirmed as soon as they are placed; online orders are confirmed once payment is received. We may decline an order (for example, if an item has run out); you are told immediately and any payment is refunded as described below. Product photos are for reference; packaging may vary.</p>
      </section>
      <section>
        <h2>5. Payment</h2>
        <p>You can pay by Cash on Delivery (where available), online through Razorpay (UPI, cards, net banking), or with your Merta Wallet balance.</p>
      </section>
      <section>
        <h2>6. Delivery</h2>
        <p>Delivery times shown are estimates and can vary with weather, traffic and demand. At handover, share the delivery OTP with the delivery partner; the order is marked delivered only after the correct OTP is entered. Please check your items at the door.</p>
      </section>
      <section>
        <h2>7. Cancellations</h2>
        <p>You can cancel an order from the order page until it has been packed. After that, cancellation is not available, but you can contact support.</p>
      </section>
      <section>
        <h2>8. Refunds, damaged or wrong items</h2>
        <ul>
          <li>For cancelled or declined orders: wallet payments are refunded to your wallet immediately; online payments are refunded to the original payment method within 5–7 working days; nothing is charged for unpaid Cash on Delivery orders.</li>
          <li>If an item is damaged, spoiled, missing or wrong, report it through <Link href="/account/support">Help &amp; support</Link> or by phone within 24 hours of delivery (photos help). We will replace it or refund it.</li>
          <li>Freshly made items such as sweets and cakes vary naturally in size and appearance; this alone is not a defect.</li>
        </ul>
      </section>
      <section>
        <h2>9. Reviews</h2>
        <p>Reviews can be written only for delivered orders and must be honest and respectful. We may remove reviews that are fake, offensive or unrelated. We never pay or reward anyone for reviews.</p>
      </section>
      <section>
        <h2>10. Acceptable use</h2>
        <p>Do not misuse the service: no false orders, payment fraud, scraping, attempts to break security, or abuse of staff or delivery partners.</p>
      </section>
      <section>
        <h2>11. Liability</h2>
        <p>We work hard to keep the service accurate and available, but it is provided &ldquo;as is&rdquo;. To the extent the law allows, our liability for any order is limited to the amount you paid for it. Nothing here limits your rights under the Consumer Protection Act, 2019.</p>
      </section>
      <section>
        <h2>12. Governing law</h2>
        <p>These terms are governed by the laws of India. Disputes are subject to the courts having jurisdiction over {site.city}, Rajasthan.</p>
      </section>
      <section>
        <h2>13. Changes</h2>
        <p>We may update these terms; the date at the top shows the latest version. Continuing to use {site.name} after a change means you accept the updated terms.</p>
      </section>
    </LegalPage>
  );
}
