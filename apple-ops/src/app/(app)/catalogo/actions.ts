"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { checkPhoto, PHOTO_BUCKET, photoPath } from "@/lib/photos";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: boolean };

function refresh(slug?: string) {
  revalidatePath("/catalogo");
  if (slug) revalidatePath(`/catalogo/${slug}`);
}

export async function saveCatalog(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_catalogo", {
    p: {
      slug: fd.get("slug"), headline: fd.get("headline"), tagline: fd.get("tagline"), whatsapp: fd.get("whatsapp"),
      published: fd.get("published") === "on", show_accessories: fd.get("show_accessories") === "on",
    },
  });
  if (error) return { error: error.message };
  refresh(String(fd.get("slug") ?? ""));
  return { ok: true };
}

export async function setDeviceFlags(device: string, visible: boolean, featured: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("catalogo_equipo", { p_device: device, p_visible: visible, p_featured: featured });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function saveAssistant(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_asistente", {
    p_on: fd.get("assistant_on") === "on", p_name: String(fd.get("assistant_name") ?? ""), p_greeting: String(fd.get("greeting") ?? ""),
  });
  if (error) return { error: error.message };
  refresh(String(fd.get("slug") ?? ""));
  return { ok: true };
}

// Foto de un equipo: la base valida rol y equipo (catalogo_equipo_foto) y el servidor sube el archivo
// con la clave de servicio. Si la subida falla, se vuelve a la foto anterior.
export async function uploadDevicePhoto(fd: FormData): Promise<{ error?: string; path?: string }> {
  const user = await getCurrentUser();
  const device = String(fd.get("device") ?? "");
  const file = fd.get("file");
  if (!(file instanceof File)) return { error: "Elegí una foto." };
  const ok = checkPhoto(file.type, file.size);
  if ("error" in ok) return ok;
  const path = photoPath(user.storeId, device, ok.ext, Date.now());
  const supabase = await createClient();
  const { data: old, error } = await supabase.rpc("catalogo_equipo_foto", { p_device: device, p_path: path });
  if (error) return { error: error.message };
  const storage = createServiceClient().storage.from(PHOTO_BUCKET);
  const up = await storage.upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (up.error) {
    await supabase.rpc("catalogo_equipo_foto", { p_device: device, p_path: old });
    return { error: "No se pudo subir la foto. Probá de nuevo." };
  }
  if (old) await storage.remove([old]);
  refresh();
  return { path };
}

export async function removeDevicePhoto(device: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: old, error } = await supabase.rpc("catalogo_equipo_foto", { p_device: device, p_path: null });
  if (error) return { error: error.message };
  if (old) await createServiceClient().storage.from(PHOTO_BUCKET).remove([old]);
  refresh();
  return {};
}
