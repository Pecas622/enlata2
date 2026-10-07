"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: boolean };

const amount = (v: FormDataEntryValue | null) => (v == null || String(v).trim() === "" ? null : Number(v));

function refresh() {
  for (const path of ["/caja", "/ventas", "/dashboard"]) revalidatePath(path);
}

export async function abrirCaja(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("abrir_caja", { p_opening_ars: amount(fd.get("ars")) ?? 0, p_opening_usd: amount(fd.get("usd")) ?? 0 });
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function registrarMovimiento(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("movimiento_caja", {
    p_type: fd.get("type"), p_method: fd.get("method"), p_concept: fd.get("concept"), p_amount: amount(fd.get("amount")) ?? 0,
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

// La base vuelve a calcular el esperado y decide si la diferencia necesita motivo.
export async function cerrarCaja(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cerrar_caja", {
    p_counted_ars: amount(fd.get("ars")), p_counted_usd: amount(fd.get("usd")), p_note: fd.get("note") ?? "",
  });
  if (error) return { error: error.message };
  refresh();
  redirect(`/caja/${data}?cerrada=1`);
}
