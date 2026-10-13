"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "./cart";

/* Admin-managed Merta landmarks for address search (local_places; admins may write directly, RLS-checked). */

const placeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Enter the landmark name").max(120),
  aliases: z.array(z.string().trim().min(2).max(120)).max(10).default([]),
  area: z.string().trim().max(120).optional().transform((v) => v || null),
  pincode: z.string().trim().regex(/^\d{6}$/, "Pincode must be 6 digits").optional().or(z.literal("")).transform((v) => v || null),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  is_active: z.boolean().default(true),
});
export type LocalPlaceInput = z.input<typeof placeSchema>;
export type LocalPlace = { id: string; name: string; aliases: string[]; area: string | null; pincode: string | null; lat: number; lng: number; is_active: boolean };

async function adminClient() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) throw new Error("FORBIDDEN");
  return supabase;
}

export async function saveLocalPlaceAction(input: LocalPlaceInput): Promise<ActionResult<{ id: string }>> {
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details" };
  const { id, ...row } = parsed.data;
  try {
    const supabase = await adminClient();
    const q = id
      ? supabase.from("local_places" as never).update({ ...row, updated_at: new Date().toISOString() } as never).eq("id", id).select("id").single()
      : supabase.from("local_places" as never).insert(row as never).select("id").single();
    const { data, error } = await q;
    if (error) return { ok: false, error: friendlyError(error) };
    await supabase.rpc("audit", { p_action: id ? "local_place.update" : "local_place.create", p_entity: "local_place", p_entity_id: (data as { id: string }).id, p_after: row as never });
    revalidatePath("/admin/delivery");
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}

export async function deleteLocalPlaceAction(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid landmark" };
  try {
    const supabase = await adminClient();
    const { error } = await supabase.from("local_places" as never).delete().eq("id", id);
    if (error) return { ok: false, error: friendlyError(error) };
    await supabase.rpc("audit", { p_action: "local_place.delete", p_entity: "local_place", p_entity_id: id });
    revalidatePath("/admin/delivery");
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: friendlyError(e) }; }
}
