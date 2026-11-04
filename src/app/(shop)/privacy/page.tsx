import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/shop/legal-page";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${site.name} collects, uses and protects your personal data when you shop for groceries in ${site.city}.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="13 October 2026"
      intro={<>This policy explains what personal data {site.name} collects when you use mertadeal.com or the {site.name} app, why we need it, who we share it with and the choices you have. We process personal data in line with India&rsquo;s Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000. We never sell your personal data.</>}>
      <section>
        <h2>1. Data we collect</h2>
        <ul>
          <li><b>Account:</b> your mobile number, name, and (if you add them) email address and profile photo. Your sign-in PIN is stored only in encrypted (hashed) form; we cannot read it.</li>
          <li><b>Guest browsing:</b> if you shop without signing in, we create an anonymous guest session so your cart works.</li>
          <li><b>Addresses and location:</b> the delivery addresses you save, including a map pin. We read your device&rsquo;s location only when you tap &ldquo;use my location&rdquo; and allow it.</li>
          <li><b>Orders:</b> items, cart, coupons used, order history, delivery OTPs, ratings and reviews, and support conversations.</li>
          <li><b>Payments:</b> for online payments, card/UPI/bank details are entered on Razorpay&rsquo;s secure checkout and are not stored by us. We keep the payment status, amount and reference IDs. We also keep your Merta Wallet transactions.</li>
          <li><b>Notifications:</b> if you allow notifications, a device token so we can send order updates.</li>
          <li><b>Technical:</b> sign-in cookies that keep you logged in, and small settings stored on your device (such as your selected location). We do not use advertising cookies.</li>
        </ul>
      </section>
      <section>
        <h2>2. Why we use it</h2>
        <ul>
          <li>To create your account, take and deliver your orders, collect payment and process refunds.</li>
          <li>To show delivery charges, timings and availability for your area.</li>
          <li>To send order, delivery and refund updates, and to answer support requests.</li>
          <li>To prevent fraud and misuse, keep the service secure, and meet tax and legal obligations.</li>
        </ul>
      </section>
      <section>
        <h2>3. Who we share it with</h2>
        <ul>
          <li><b>The delivery partner</b> receives your name, phone number and delivery address. While your order is out for delivery, the partner&rsquo;s live location is shared with you for tracking.</li>
          <li><b>Service providers</b> who run parts of the service for us: Supabase (database and sign-in), Vercel (website hosting), Razorpay (online payments) and Google Maps (maps and address search). They may process data outside India under their own security commitments.</li>
          <li><b>Authorities</b>, when required by law or to protect our customers and partners.</li>
        </ul>
      </section>
      <section>
        <h2>4. How long we keep it</h2>
        <p>We keep your account data while your account is active. Order, invoice and payment records are kept for as long as Indian tax and accounting laws require, even after an account is deleted. Support conversations are kept to resolve disputes.</p>
      </section>
      <section>
        <h2>5. Your rights and choices</h2>
        <ul>
          <li>See and correct your profile and addresses any time in <Link href="/account">your account</Link>.</li>
          <li>Turn notifications off in your device or account settings.</li>
          <li>Ask for a copy of your data, or ask us to delete your account from <Link href="/account/settings">Account → Settings → Delete account</Link>. We confirm with you, finish any open orders or refunds, then remove your personal data (wallet balance is forfeited once the account is removed).</li>
          <li>Withdraw consent, raise a complaint, or nominate someone to act for you, by contacting us below.</li>
        </ul>
      </section>
      <section>
        <h2>6. Security</h2>
        <p>Data is sent over encrypted connections (HTTPS), access is limited to people who need it, and delivery partners and staff can see only the orders they handle.</p>
      </section>
      <section>
        <h2>7. Children</h2>
        <p>{site.name} is meant for adults. Anyone under 18 should use it with a parent or guardian.</p>
      </section>
      <section>
        <h2>8. Grievances</h2>
        <p>For any privacy concern or complaint, write to our Grievance Officer at <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> with the subject &ldquo;Privacy&rdquo;. We will acknowledge and resolve it within the time limits set by Indian law. You may also approach the Data Protection Board of India.</p>
      </section>
      <section>
        <h2>9. Changes</h2>
        <p>We will update this page when our practices change and show the new date at the top. See also our <Link href="/terms">Terms and Conditions</Link>.</p>
      </section>
    </LegalPage>
  );
}
