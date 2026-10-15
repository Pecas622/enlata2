"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { MEDIA_BUCKET } from "@/lib/media";
import { permsFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

// Registra un archivo que el navegador ya subió a Storage. Si la base no lo acepta (tope del plan, marca ajena),
// se borra de Storage para que no quede huérfano.
export async function registerMedia(input: { path: string; name: string; kind: "logo" | "foto"; contentId?: string; back: string }): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!permsFor(user.role).create) return { error: "Tu rol no sube archivos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_media", { p: { path: input.path, name: input.name.slice(0, 200), kind: input.kind, content_id: input.contentId ?? "" } });
  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([input.path]);
    return { error: error.message };
  }
  revalidatePath(input.back);
  return {};
}

export async function deleteMedia(id: string, back: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!permsFor(user.role).create) return { error: "Tu rol no borra archivos." };
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("delete_media", { p_id: id });
  if (error) return { error: error.message };
  await supabase.storage.from(MEDIA_BUCKET).remove([path as string]);
  revalidatePath(back);
  return {};
}
