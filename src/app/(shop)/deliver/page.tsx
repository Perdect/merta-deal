import type { Metadata } from "next";
import Link from "next/link";
import { Bike, ClipboardList, Clock, IndianRupee, KeyRound, MapPinned, PhoneCall, ShieldCheck, Smartphone } from "lucide-react";
import { RiderApplyForm } from "@/components/rider/apply-form";
import { AppBar } from "@/components/shop/app-bar";
import { Button } from "@/components/ui/button";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { getPublicSettings } from "@/lib/data/catalog";
import { site } from "@/config/site";

const title = `Deliver with Merta Deal in ${site.city}`;
const description = `Become a Merta Deal delivery partner in ${site.city}: deliver groceries on your bike or cycle, choose when you go online, and see your earning before you accept each delivery.`;

export const metadata: Metadata = { title, description, alternates: { canonical: "/deliver" }, openGraph: { type: "website", siteName: site.seoName, locale: "en_IN", title, description, url: "/deliver" } };
export const dynamic = "force-dynamic";

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const time12 = (t: string | null | undefined) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${(((h % 24) + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h % 24 < 12 ? "AM" : "PM"}`;
};

/**
 * Delivery partner recruitment (orange rider theme). Pay rates and hours come from the same settings and
 * business hours the order system uses — nothing here is hard-coded. Applying needs no account (0047): the
 * visitor leaves their details, an admin calls to verify and creates the email + password sign-in; only that
 * grants the delivery partner role.
 */
export default async function DeliverPage() {
  const supabase = await createClient();
  const [settings, user] = await Promise.all([getPublicSettings(), getSessionUser()]);
  const hours = (settings.business_hours ?? {}) as { open?: string; close?: string };
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const signedIn = Boolean(user && authUser && !authUser.is_anonymous);
  const { data: application } = signedIn ? await supabase.from("delivery_partners").select("status").eq("user_id", user!.id).maybeSingle() : { data: null };

  const base = num(settings.rider_base_earning); const perKm = num(settings.rider_per_km_earning);
  const opens = time12(hours.open); const closes = time12(hours.close);

  const isRider = signedIn && application?.status === "active";
  const cta = isRider
    ? { href: "/rider", label: "Open the delivery partner app", Icon: Bike }
    : { href: "#apply", label: "Apply now", Icon: ClipboardList };

  const steps = [
    { Icon: ClipboardList, t: "Send your details", s: "Name, mobile, email, vehicle, driving licence (not needed for a cycle). No account to create." },
    { Icon: PhoneCall, t: "We call you", s: "Merta Deal checks your details on the phone, usually within a day." },
    { Icon: KeyRound, t: "You get your sign-in", s: "We create your delivery partner login (your email + a password) and share it with you privately." },
    { Icon: Bike, t: "Start delivering", s: "Sign in at Delivery partner login, go online, accept requests and hand over with the customer's OTP." },
  ];

  return (
    <div className="theme-rider px-4 pb-10 pt-1 sm:px-0">
      <AppBar title="Deliver with Merta Deal" back="/" className="-mt-1" />
      <section className="mt-3 overflow-hidden rounded-lg border border-brand-100 bg-brand-50 p-5 sm:p-7">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-200"><Bike className="h-3.5 w-3.5" aria-hidden /> Delivery partners · {site.city}</p>
        <h1 className="mt-3 font-display text-2xl font-extrabold leading-tight text-ink sm:text-3xl">Deliver groceries in {site.city}. Earn on your own time.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">Short trips inside the city, from Merta Deal&apos;s pickup point to homes nearby. You choose when to go online, and every request shows your earning before you accept.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button href={cta.href} size="lg"><cta.Icon className="h-5 w-5" aria-hidden /> {cta.label}</Button>
        </div>
        {isRider ? null : <p className="mt-3 text-xs text-ink-3">Already a delivery partner? <Link href="/rider/login" className="font-semibold text-brand-700 underline-offset-2 hover:underline">Delivery partner login</Link></p>}
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Pay and hours">
        <div className="rounded-lg border border-line bg-card p-4 shadow-card">
          <IndianRupee className="h-5 w-5 text-brand-600" aria-hidden />
          <h2 className="mt-2 font-semibold text-ink">Pay per delivery</h2>
          <p className="mt-1 text-sm text-ink-2">{base && perKm ? <>₹{base} for each delivery plus ₹{perKm} per km.</> : "A fixed amount per delivery plus a per-km amount."} The exact earning is shown on every request.</p>
        </div>
        <div className="rounded-lg border border-line bg-card p-4 shadow-card">
          <Clock className="h-5 w-5 text-brand-600" aria-hidden />
          <h2 className="mt-2 font-semibold text-ink">Your hours</h2>
          <p className="mt-1 text-sm text-ink-2">Go online whenever you like{opens && closes ? <> — orders come in between {opens} and {closes}</> : null}.</p>
        </div>
        <div className="rounded-lg border border-line bg-card p-4 shadow-card">
          <MapPinned className="h-5 w-5 text-brand-600" aria-hidden />
          <h2 className="mt-2 font-semibold text-ink">Earnings you can see</h2>
          <p className="mt-1 text-sm text-ink-2">Every completed delivery is added to the Earnings tab, along with each payout Merta Deal makes to you.</p>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="how">
        <h2 id="how" className="font-display text-lg font-bold text-ink">How to join</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2">
          {steps.map(({ Icon, t, s }, i) => (
            <li key={t} className="flex gap-3 rounded-lg border border-line bg-card p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white" aria-hidden>{i + 1}</span>
              <div className="min-w-0"><p className="flex items-center gap-1.5 font-semibold text-ink"><Icon className="h-4 w-4 text-brand-600" aria-hidden />{t}</p><p className="mt-0.5 text-sm text-ink-2">{s}</p></div>
            </li>
          ))}
        </ol>
      </section>

      {isRider ? null : (
        <section id="apply" className="mt-8 scroll-mt-24" aria-labelledby="apply-h">
          <h2 id="apply-h" className="font-display text-lg font-bold text-ink">Apply now</h2>
          <p className="mt-1 mb-3 text-sm text-ink-3">Takes two minutes. We call to verify, then send your sign-in.</p>
          <RiderApplyForm />
        </section>
      )}

      <section className="mt-8 rounded-lg border border-line bg-card p-4" aria-labelledby="need">
        <h2 id="need" className="font-semibold text-ink">What you need</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
          <li className="flex gap-2"><Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />A smartphone with internet and location (GPS) turned on while you deliver.</li>
          <li className="flex gap-2"><Bike className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />A bicycle, bike or scooter. Motor vehicles need a valid driving licence.</li>
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />Aadhaar (we only ask for the last 4 digits) and an emergency contact number.</li>
        </ul>
        <p className="mt-3 text-xs text-ink-3">Questions? Call <a href={`tel:+${site.supportPhone.replace(/\D/g, "")}`} className="font-semibold text-brand-700 underline">{site.supportPhone}</a>.</p>
      </section>
    </div>
  );
}
