"use client";
import { createClient } from "@/lib/supabase/client";

export type Bucket = "product-images" | "avatars" | "banners" | "wholesale-photos";

/**
 * Uploads a file to Supabase Storage from the browser (RLS on storage.objects: product images and
 * banners are admin-only, avatars and wholesale request photos live under <userId>/...). Returns the public URL.
 */
export async function uploadFile(bucket: Bucket, folder: string, file: File, opts: { maxMb?: number } = {}) {
  const maxMb = opts.maxMb ?? 5;
  if (file.size > maxMb * 1024 * 1024) throw new Error(`File is larger than ${maxMb} MB`);
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

/** Client-side downscale to keep uploads small on mobile networks (max 1200px, JPEG/WebP). */
export async function compressImage(file: File, maxSize = 1200, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 600 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/webp", quality));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
}
