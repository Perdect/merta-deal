"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Mail, Phone } from "lucide-react";
import type { Profile } from "@/types/app";
import { updateProfileAction } from "@/lib/actions/account";
import { ImageUpload } from "@/components/shared/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { isValidIndianMobile } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = { customer: "Customer", store_owner: "Store owner", store_staff: "Store staff", rider: "Delivery partner", admin: "Admin", super_admin: "Super admin" };

/** Avatar + name/phone/email with an inline edit modal (avatar uploads to `avatars/<userId>/`). */
export function ProfileCard({ profile, email }: { profile: Profile; email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(profile.full_name ?? "");
  const [phone, setPhone] = React.useState(profile.phone ?? "");
  const [avatar, setAvatar] = React.useState<string | null>(profile.avatar_url);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const reset = () => { setName(profile.full_name ?? ""); setPhone(profile.phone ?? ""); setAvatar(profile.avatar_url); setErrors({}); };
  const close = () => { setOpen(false); reset(); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Enter your name";
    if (!isValidIndianMobile(phone)) errs.phone = "Enter a valid 10-digit mobile number";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const r = await updateProfileAction({ full_name: name.trim(), phone, avatar_url: avatar });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Profile updated");
    setOpen(false); router.refresh();
  };

  return (
    <>
      <section className="rounded-lg border border-line bg-card p-4 shadow-card">
        <div className="flex items-center gap-4">
          <Avatar name={profile.full_name} src={profile.avatar_url} size={64} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold text-ink">{profile.full_name || "Add your name"}</h2>
              {profile.is_guest ? <Badge tone="saffron">Guest</Badge> : profile.role !== "customer" ? <Badge tone="brand">{ROLE_LABEL[profile.role] ?? profile.role}</Badge> : null}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-2"><Phone className="h-3.5 w-3.5 text-ink-4" />{profile.phone ? `+91 ${profile.phone}` : <span className="text-ink-3">No mobile number yet</span>}</p>
            <p className="flex items-center gap-1.5 truncate text-sm text-ink-2"><Mail className="h-3.5 w-3.5 text-ink-4" />{email || profile.email || <span className="text-ink-3">No email yet</span>}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Edit profile"><Pencil className="h-4 w-4" /><span className="hidden sm:inline">Edit</span></Button>
        </div>
      </section>

      <Modal open={open} onClose={close} title="Edit profile" description="Your name and number are shared with the store and rider for deliveries.">
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-center gap-4">
            <ImageUpload bucket="avatars" folder={profile.id} value={avatar} onChange={(url) => setAvatar(url)} label="Photo" className="h-24 w-24 shrink-0 rounded-full" maxMb={3} />
            <p className="text-xs text-ink-3">Optional. Square photos look best; we compress them on your device before upload.</p>
          </div>
          <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" />
          <Input label="Mobile number" required inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} error={errors.phone} autoComplete="tel" hint="10-digit Indian mobile number" />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>Cancel</Button>
            <Button type="submit" className="flex-1" loading={busy}>Save</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
