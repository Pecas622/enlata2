"use server";

import { revalidatePath } from "next/cache";
import type { FxSource } from "@/lib/fx";
import { refreshFx } from "@/lib/fx-server";
import { PHOTO_BUCKET } from "@/lib/photos";
import { getCurrentUser } from "@/lib/session";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type ConfigInput = {
  name: string; cuit: string; address: string; phone: string; fx: number; target_margin: number; max_discount_seller: number;
  warranty_new_days: number; warranty_used_days: number; cond_mult: Record<string, number>; defect_costs: Record<string, number>;
  base_values: { model: string; capacity: number; value: number }[];
};

export async function guardarConfig(input: ConfigInput): Promise<{ error?: string }> {
  const supabase = await createClient();
  // Con cotización automática, se guarda la vigente y no la que quedó en el formulario.
  const { data: cur } = await supabase.from("stores").select("fx, fx_source").eq("id", (await getCurrentUser()).storeId).single();
  if (cur && cur.fx_source !== "manual") input = { ...input, fx: Number(cur.fx) };
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

export async function guardarDolarYAlertas(input: { source: FxSource; extra: number; staleDays: number }): Promise<{ error?: string; warning?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_cotizacion_y_alertas", { p_source: input.source, p_extra: input.extra, p_stale_days: input.staleDays });
  if (error) return { error: error.message };
  let warning: string | undefined;
  if (input.source !== "manual") {
    const r = await refreshFx({ storeId: (await getCurrentUser()).storeId, force: true });
    if (r.failed) warning = "Se guardó, pero no se pudo consultar la cotización ahora. Se reintenta sola.";
  }
  revalidatePath("/", "layout");
  return { warning };
}

export async function actualizarCotizacion(): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user.role !== "Administrador") return { error: "Solo el administrador cambia la configuración." };
  const r = await refreshFx({ storeId: user.storeId, force: true });
  if (r.checked === 0) return { error: "La cotización está en manual." };
  if (r.failed) return { error: "No se pudo consultar la cotización. Queda la última que había." };
  revalidatePath("/", "layout");
  return {};
}
