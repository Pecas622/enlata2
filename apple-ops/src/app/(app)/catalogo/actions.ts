"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
