"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Bike, PhoneCall, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { EmptyBlock } from "@/components/admin/kit";
import { AddRiderButton } from "@/components/admin/rider-manage";
import { reviewRiderApplicationAction } from "@/lib/actions/admin-riders";
import { VEHICLE_LABEL } from "@/components/admin/ops/pills";
import type { CityRow } from "@/lib/data/admin";
import type { RiderApplication } from "@/lib/data/rider-applications";
import { formatDateTime } from "@/lib/utils";

/** Delivery partner applications (0047): call to verify, then Create rider (prefilled) or decline with a note. */
export function RiderApplications({ items, cities }: { items: RiderApplication[]; cities: CityRow[] }) {
  if (items.length === 0) return <EmptyBlock icon={Bike} title="No new applications" description="People apply from the Deliver with Merta Deal page; each application appears here for you to call and create the rider's sign-in." />;
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => <Row key={a.id} a={a} cities={cities} />)}
    </ul>
  );
}

function Row({ a, cities }: { a: RiderApplication; cities: CityRow[] }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const review = async (status: "declined" | "new") => {
    setBusy(true);
    const r = await reviewRiderApplicationAction(a.id, status, note);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(status === "declined" ? "Application declined" : "Application reopened"); setNote(""); router.refresh();
  };
  return (
    <li className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:px-5">
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-ink">{a.full_name} <span className="font-normal text-ink-3">· {VEHICLE_LABEL[a.vehicle_type] ?? a.vehicle_type}{a.vehicle_number ? ` ${a.vehicle_number}` : ""}</span></p>
        <p className="text-ink-2"><a href={`tel:+91${a.phone}`} className="inline-flex items-center gap-1 font-medium text-brand-700"><PhoneCall className="h-3.5 w-3.5" aria-hidden />{a.phone}</a> · {a.email}</p>
        <p className="text-xs text-ink-3">{a.license_number ? `Licence ${a.license_number} · ` : ""}{a.aadhaar_last4 ? `Aadhaar ••••${a.aadhaar_last4} · ` : ""}{a.emergency_contact ? `Emergency ${a.emergency_contact} · ` : ""}Applied {formatDateTime(a.created_at)}</p>
        {a.note ? <p className="mt-1 rounded-md bg-surface px-2 py-1.5 text-xs text-ink-2">“{a.note}”</p> : null}
        {a.status === "declined" ? <p className="mt-1 text-xs text-ink-3">Declined{a.reviewer_name ? ` by ${a.reviewer_name}` : ""}{a.review_note ? `: ${a.review_note}` : ""}</p> : null}
      </div>
      <div className="space-y-2 sm:w-72">
        {a.status === "new" ? (
          <>
            <AddRiderButton cities={cities} label="Create rider sign-in" compact prefill={{ fullName: a.full_name, phone: a.phone, vehicle_type: a.vehicle_type, vehicle_number: a.vehicle_number ?? "", license_number: a.license_number ?? "", emergency_contact: a.emergency_contact ?? "", email: a.email, applicationId: a.id }} />
            <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Reason (kept for your records)" aria-label="Decline reason" />
            <Button size="sm" variant="outline" onClick={() => review("declined")} loading={busy}><XCircle className="h-4 w-4" /> Decline</Button>
          </>
        ) : a.status === "declined" ? (
          <Button size="sm" variant="ghost" onClick={() => review("new")} loading={busy}><RotateCcw className="h-4 w-4" /> Reopen</Button>
        ) : null}
      </div>
    </li>
  );
}
