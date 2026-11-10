"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Store, UserRound, Phone, MapPin } from "lucide-react";
import { saveWholesaleProfileAction } from "@/lib/actions/wholesale";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import type { Address } from "@/types/app";
import type { WholesaleBuyer } from "@/lib/wholesale";
import { cn } from "@/lib/utils";

/** Optional wholesale details. Addresses come from the account's saved addresses so the delivery-zone check is the same as retail. */
export function WholesaleProfileForm({ addresses, current, defaults }: { addresses: Address[]; current: WholesaleBuyer | null; defaults: { name: string | null; phone: string | null } }) {
  const router = useRouter();
  const [shopName, setShopName] = React.useState(current?.shop_name ?? "");
  const [ownerName, setOwnerName] = React.useState(current?.owner_name ?? defaults.name ?? "");
  const [phone, setPhone] = React.useState(current?.phone ?? defaults.phone ?? "");
  const [gstin, setGstin] = React.useState(current?.gstin ?? "");
  const [needs, setNeeds] = React.useState(current?.monthly_needs ?? "");
  const [addressId, setAddressId] = React.useState<string | null>(current?.address_id ?? addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const r = await saveWholesaleProfileAction({ shopName, ownerName, phone, gstin, addressId, monthlyNeeds: needs });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast.success("Wholesale details saved");
    router.replace("/account/wholesale");
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Your name" required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} leftIcon={<UserRound className="h-4 w-4" />} maxLength={80} />
        <Input label="Mobile number" required type="tel" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} leftIcon={<Phone className="h-4 w-4" />} hint="We call this number about wholesale orders." />
      </div>
      <Input label="Shop name (optional)" value={shopName} onChange={(e) => setShopName(e.target.value)} leftIcon={<Store className="h-4 w-4" />} placeholder="e.g. Jain Kirana" maxLength={120} hint="Only if you run a shop. Leave empty for a home order." />
      <Input label="GSTIN (optional)" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase().slice(0, 15))} placeholder="15 characters" hint="Only if you want it on your bills." />
      <fieldset>
        <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink"><MapPin className="h-4 w-4 text-ink-3" aria-hidden /> Delivery address for wholesale orders</legend>
        {addresses.length === 0 ? (
          <Alert tone="info">Save an address first. <Link href="/account/addresses?new=1" className="font-semibold underline">Add address</Link>, then come back here.</Alert>
        ) : (
          <ul className="space-y-2">
            {addresses.map((a) => (
              <li key={a.id}>
                <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", addressId === a.id ? "border-brand-600 bg-brand-50" : "border-line bg-card")}>
                  <input type="radio" name="address" className="mt-1 accent-brand-600" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                  <span className="min-w-0 text-sm"><span className="block font-semibold text-ink">{a.label || a.type} · {a.full_name}</span><span className="block text-ink-2">{[a.house, a.street, a.area, `${a.city} – ${a.pincode}`].filter(Boolean).join(", ")}</span></span>
                </label>
              </li>
            ))}
            <li><Link href="/account/addresses?new=1" className="text-sm font-semibold text-brand-700">+ Add another address</Link></li>
          </ul>
        )}
      </fieldset>
      <Textarea label="What do you need every month? (optional)" value={needs} onChange={(e) => setNeeds(e.target.value.slice(0, 1000))} placeholder="e.g. 2 × 15 kg oil tins, 5 kg tea, 25 kg atta, biscuits, detergent…" hint="Helps us add products and confirm quotes before your first order." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" size="lg" fullWidth className="h-13 rounded-xl text-base" loading={busy} disabled={!addressId}>Save details</Button>
      <p className="text-center text-xs text-ink-3">No approval needed. You can order wholesale straight away from the <Link href="/wholesale#range" className="font-semibold text-brand-700">wholesale range</Link>.</p>
    </form>
  );
}
