"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/admin/kit";
import { ImageUpload } from "@/components/shared/image-upload";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { saveBusinessAction, setBusinessStatusAction, type BusinessInput } from "@/lib/actions/directory";
import { BUSINESS_CATEGORIES, DAYS, DAY_LABEL, DIRECTORY, profilePath, type Business, type BusinessCategory, type OpeningHours } from "@/lib/directory";

const lines = (s: string) => s.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const toNum = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Number(s) : null);

/** Everything on a public profile. Fields left empty simply don't appear on the page. */
export function BusinessEditor({ business: b }: { business?: Business }) {
  const router = useRouter();
  const [f, setF] = React.useState({
    name: b?.name ?? "", slug: b?.slug ?? "", category: (b?.category ?? "restaurant") as BusinessCategory, description: b?.description ?? "", address_line: b?.address_line ?? "", area: b?.area ?? "", pincode: b?.pincode ?? "",
    lat: b?.lat != null ? String(b.lat) : "", lng: b?.lng != null ? String(b.lng) : "", phone: b?.phone ?? "", whatsapp: b?.whatsapp ?? "", facilities: b?.facilities.join(", ") ?? "", cuisines: b?.cuisines.join(", ") ?? "",
    veg_type: b?.veg_type ?? "not_stated", delivery_coverage: b?.delivery_coverage ?? "", delivery_charge: b?.delivery_charge ?? "", delivery_eta: b?.delivery_eta ?? "", order_confirmation: b?.order_confirmation ?? "business_approval", duplicate_of: b?.duplicate_of ?? "",
  });
  const [flags, setFlags] = React.useState({ offers_rooms: b?.offers_rooms ?? false, accepts_delivery: b?.accepts_delivery ?? false, hours_verified: b?.hours_verified ?? false, is_paid_placement: b?.is_paid_placement ?? false, contact_verified: Boolean(b?.contact_verified_at) });
  const [logo, setLogo] = React.useState<string | null>(b?.logo_url ?? null);
  const [photos, setPhotos] = React.useState<string[]>(b?.photos ?? []);
  const [hours, setHours] = React.useState<OpeningHours>(b?.opening_hours ?? {});
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const flag = (k: keyof typeof flags) => (e: React.ChangeEvent<HTMLInputElement>) => setFlags((v) => ({ ...v, [k]: e.target.checked }));

  const save = async () => {
    if (busy) return; setBusy(true);
    try {
      const input: BusinessInput = {
        id: b?.id, slug: f.slug || slugify(f.name), category: f.category, name: f.name, description: f.description, logo_url: logo, photos, address_line: f.address_line, area: f.area, pincode: f.pincode, lat: toNum(f.lat), lng: toNum(f.lng), phone: f.phone, whatsapp: f.whatsapp,
        opening_hours: Object.keys(hours).length ? hours : null, hours_verified: flags.hours_verified, facilities: lines(f.facilities), cuisines: lines(f.cuisines), veg_type: f.veg_type, offers_rooms: flags.offers_rooms, accepts_delivery: flags.accepts_delivery,
        delivery_coverage: f.delivery_coverage, delivery_charge: f.delivery_charge, delivery_eta: f.delivery_eta, order_confirmation: f.order_confirmation, is_paid_placement: flags.is_paid_placement, duplicate_of: f.duplicate_of || null, contact_verified: flags.contact_verified,
      };
      const r = await saveBusinessAction(input);
      if (!r.ok) { toast.error("Not saved", r.error); return; }
      toast.success("Saved");
      if (b) router.refresh(); else router.replace(`/admin/businesses/${r.data.id}`);
    } finally { setBusy(false); }
  };
  const status = async (s: "draft" | "published" | "archived") => {
    if (!b || busy) return; setBusy(true);
    try {
      const r = await setBusinessStatusAction(b.id, s, b.category, b.slug);
      if (!r.ok) { toast.error("Not changed", r.error); return; }
      toast.success(s === "published" ? "Published" : "Status changed"); router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Panel title="Profile">
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <Input label="Business name" required value={f.name} onChange={set("name")} />
          <Select label="Category" options={BUSINESS_CATEGORIES.map((c) => ({ value: c, label: DIRECTORY[c].singular }))} value={f.category} onChange={set("category")} />
          <Input label="Page address" value={f.slug} onChange={set("slug")} hint={`${DIRECTORY[f.category].path}/${f.slug || slugify(f.name) || "business-name"}`} />
          <Select label="Vegetarian" options={[{ value: "not_stated", label: "Not stated" }, { value: "pure_veg", label: "Pure vegetarian" }, { value: "veg_options", label: "Vegetarian options" }]} value={f.veg_type} onChange={set("veg_type")} />
          <div className="sm:col-span-2"><Textarea label="Description" rows={4} value={f.description} onChange={set("description")} maxLength={2000} hint="At least 40 characters, written for this business. Also used in search results." /></div>
          <Input label="Cuisines" value={f.cuisines} onChange={set("cuisines")} hint="Separate with commas" />
          <Input label="Facilities" value={f.facilities} onChange={set("facilities")} hint="Separate with commas" />
          <div><p className="mb-1.5 text-sm font-medium text-ink-2">Logo</p><div className="w-28"><ImageUpload bucket="banners" folder="businesses" value={logo} onChange={(url) => setLogo(url)} /></div>{logo ? <button type="button" className="mt-1 text-xs text-danger" onClick={() => setLogo(null)}>Remove</button> : null}</div>
          <div><p className="mb-1.5 text-sm font-medium text-ink-2">Photos (only real photos of this business)</p><div className="grid grid-cols-3 gap-2">{photos.map((p) => <div key={p}><ImageUpload bucket="banners" folder="businesses" value={p} onChange={(url) => { if (url) setPhotos((v) => v.map((x) => (x === p ? url : x))); }} /><button type="button" className="mt-1 text-xs text-danger" onClick={() => setPhotos((v) => v.filter((x) => x !== p))}>Remove</button></div>)}{photos.length < 12 ? <ImageUpload bucket="banners" folder="businesses" value={null} label="Add photo" onChange={(url) => { if (url) setPhotos((v) => [...v, url]); }} /> : null}</div></div>
        </div>
      </Panel>
      <Panel title="Contact and location">
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <Input label="Street address" value={f.address_line} onChange={set("address_line")} />
          <Input label="Area" value={f.area} onChange={set("area")} />
          <Input label="Pincode" inputMode="numeric" value={f.pincode} onChange={set("pincode")} />
          <Input label="Phone" value={f.phone} onChange={set("phone")} />
          <Input label="WhatsApp" value={f.whatsapp} onChange={set("whatsapp")} />
          <div className="grid grid-cols-2 gap-3"><Input label="Latitude" inputMode="decimal" value={f.lat} onChange={set("lat")} /><Input label="Longitude" inputMode="decimal" value={f.lng} onChange={set("lng")} /></div>
          <div className="sm:col-span-2"><Checkbox label="I have called this business and confirmed these details" checked={flags.contact_verified} onChange={flag("contact_verified")} /></div>
        </div>
      </Panel>
      <Panel title="Opening hours">
        <div className="space-y-2 p-4 sm:p-5">
          {DAYS.map((d) => { const h = hours[d]; return (
            <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
              <div className="w-32"><Checkbox label={DAY_LABEL[d]} checked={Boolean(h)} onChange={(e) => setHours((v) => { const n = { ...v }; if (e.target.checked) n[d] = { open: "09:00", close: "21:00" }; else delete n[d]; return n; })} /></div>
              {h ? <><Input aria-label={`${DAY_LABEL[d]} opens`} type="time" value={h.open} onChange={(e) => setHours((v) => ({ ...v, [d]: { ...h, open: e.target.value } }))} /><Input aria-label={`${DAY_LABEL[d]} closes`} type="time" value={h.close} onChange={(e) => setHours((v) => ({ ...v, [d]: { ...h, close: e.target.value } }))} /></> : <span className="text-ink-3">Closed</span>}
            </div>
          ); })}
          <Checkbox label="These hours are confirmed (shows Open now and adds them to search data)" checked={flags.hours_verified} onChange={flag("hours_verified")} />
        </div>
      </Panel>
      <Panel title="Services">
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          {f.category === "hotel" ? <div className="sm:col-span-2"><Checkbox label="Offers accommodation (shows Enquire About Rooms)" checked={flags.offers_rooms} onChange={flag("offers_rooms")} /></div> : null}
          <div className="sm:col-span-2"><Checkbox label="Accepts delivery orders" checked={flags.accepts_delivery} onChange={flag("accepts_delivery")} /></div>
          {flags.accepts_delivery ? <><Input label="Delivery coverage" value={f.delivery_coverage} onChange={set("delivery_coverage")} /><Input label="Delivery charge" value={f.delivery_charge} onChange={set("delivery_charge")} hint="As agreed with the business" /><Input label="Estimated delivery time" value={f.delivery_eta} onChange={set("delivery_eta")} /><Select label="Order confirmation" options={[{ value: "business_approval", label: "Needs business approval" }, { value: "immediate", label: "Immediate (linked cart items only)" }]} value={f.order_confirmation} onChange={set("order_confirmation")} /></> : null}
          <div className="sm:col-span-2"><Checkbox label="Paid placement (shown first and labelled on the page)" checked={flags.is_paid_placement} onChange={flag("is_paid_placement")} /></div>
          <Input label="Duplicate of (business ID)" value={f.duplicate_of} onChange={set("duplicate_of")} hint="Keeps this profile out of public pages." />
        </div>
      </Panel>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} loading={busy}>Save</Button>
        {b && b.status !== "published" ? <Button variant="outline" disabled={busy} onClick={() => status("published")}>Publish</Button> : null}
        {b && b.status === "published" ? <><Button variant="outline" disabled={busy} onClick={() => status("draft")}>Unpublish</Button><a href={profilePath(b)} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-700 hover:underline">View page</a></> : null}
        {b && b.status !== "archived" ? <Button variant="outline" disabled={busy} onClick={() => status("archived")}>Archive</Button> : null}
      </div>
    </div>
  );
}
