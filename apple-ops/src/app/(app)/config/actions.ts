"use server";

import { revalidatePath } from "next/cache";
import { PHOTO_BUCKET } from "@/lib/photos";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type ConfigInput = {
  name: string; cuit: string; address: string; phone: string; fx: number; target_margin: number; max_discount_seller: number;
  warranty_new_days: number; warranty_used_days: number; cond_mult: Record<string, number>; defect_costs: Record<string, number>;
  base_values: { model: string; capacity: number; value: number }[];
};

export async function guardarConfig(input: ConfigInput): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_config", { p: input });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

export async function cargarDemo(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cargar_demo");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

// Deja el local en cero para entregarlo. También borra de Storage las fotos de los equipos borrados.
export async function borrarDemo(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("borrar_demo");
  if (error) return { error: error.message };
  const photos = (data as string[] | null) ?? [];
  if (photos.length) await createServiceClient().storage.from(PHOTO_BUCKET).remove(photos);
  revalidatePath("/", "layout");
  return {};
}
