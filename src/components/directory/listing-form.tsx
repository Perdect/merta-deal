"use client";
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { submitListingAction } from "@/lib/actions/directory";
import { BUSINESS_CATEGORIES, DIRECTORY, type BusinessCategory } from "@/lib/directory";

/** Sends a listing or change request to the admin queue. Nothing here goes live on its own. */
export function ListingForm({ category, updateSlug, tel, phone }: { category?: BusinessCategory; updateSlug?: string; tel: string; phone: string }) {
  const [f, setF] = React.useState({ businessName: "", category: category ?? "restaurant", ownerName: "", ownerPhone: "", whatsapp: "", address: "", details: "", website: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<boolean | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const r = await submitListingAction({ businessName: f.businessName, category: f.category as BusinessCategory, ownerName: f.ownerName, ownerPhone: f.ownerPhone.replace(/\D/g, "").slice(-10), whatsapp: f.whatsapp.replace(/\D/g, "").slice(-10), address: f.address, details: f.details, kind: updateSlug ? "update" : "new", businessSlug: updateSlug }, f.website);
      if (!r.ok) setError(r.error); else setSaved(r.data.saved);
    } catch { setSaved(false); } finally { setBusy(false); }
  };
  if (saved != null) {
    return (
      <div role="status" className="rounded-lg border border-line bg-card p-4 shadow-card">
        <p className="flex items-center gap-2 font-display text-base font-bold text-ink">{saved ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> : <TriangleAlert className="h-5 w-5 text-warning" aria-hidden />}{saved ? "We have your request" : "Your request hasn't reached us yet"}</p>
        <p className="mt-1 text-sm text-ink-2">{saved ? "We'll call you to check the details. Your profile goes live only after we've approved it." : "We couldn't save it here. Please call us instead."}</p>
        {saved ? null : <a href={tel} className="tap mt-3 inline-flex h-11 items-center rounded-lg border border-line px-4 text-sm font-semibold text-ink">Call {phone}</a>}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Business name" required value={f.businessName} onChange={set("businessName")} maxLength={120} autoComplete="organization" />
        <Select label="Type of business" required options={BUSINESS_CATEGORIES.map((c) => ({ value: c, label: DIRECTORY[c].singular }))} value={f.category} onChange={set("category")} />
        <Input label="Your name" required value={f.ownerName} onChange={set("ownerName")} maxLength={80} autoComplete="name" />
        <Input label="Mobile number" type="tel" inputMode="numeric" required value={f.ownerPhone} onChange={set("ownerPhone")} maxLength={14} autoComplete="tel-national" hint="We call this number to verify the business." />
        <Input label="WhatsApp number (optional)" type="tel" inputMode="numeric" value={f.whatsapp} onChange={set("whatsapp")} maxLength={14} />
        <Input label="Business address" required value={f.address} onChange={set("address")} maxLength={300} />
        <div className="sm:col-span-2"><Textarea label={updateSlug ? "What should change?" : "About your business"} rows={3} value={f.details} onChange={set("details")} maxLength={2000} hint={updateSlug ? undefined : "What you offer, timings, facilities, and whether you take delivery orders. We'll ask for photos and your menu when we call."} /></div>
      </div>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label></div>
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p> : null}
      <Button type="submit" loading={busy} fullWidth className="mt-3 sm:w-auto">{updateSlug ? "Send update request" : "Send listing request"}</Button>
      <p className="mt-2 text-xs text-ink-3">Your request is reviewed by our team before anything is published. See our <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">Privacy Policy</Link>.</p>
    </form>
  );
}
