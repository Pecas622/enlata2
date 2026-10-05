"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BulkRow } from "@/lib/accessories";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: boolean };

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));

function refresh(id?: string) {
  revalidatePath("/accesorios");
  revalidatePath("/ventas");
  if (id) revalidatePath(`/accesorios/${id}`);
}

export async function saveAccessory(_: FormState, fd: FormData): Promise<FormState> {
  const id = (fd.get("id") as string) || null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("guardar_accesorio", {
    p_id: id,
    p_name: fd.get("name"),
    p_category: fd.get("category"),
    p_price_ars: num(fd.get("price")),
    p_min_stock: num(fd.get("min_stock")) ?? 0,
    p_supplier: fd.get("supplier") ?? "",
    p_sku: fd.get("sku") ?? "",
    p_cost_ars: num(fd.get("cost")),
    p_stock: num(fd.get("stock")) ?? 0,
  });
  if (error) return { error: error.message };
  refresh(data);
  if (!id) redirect(`/accesorios/${data}`);
  return { ok: true };
}

export async function restockAccessory(_: FormState, fd: FormData): Promise<FormState> {
  const id = fd.get("id") as string;
  const supabase = await createClient();
  const { error } = await supabase.rpc("reponer_accesorio", { p_id: id, p_qty: num(fd.get("qty")), p_unit_cost: num(fd.get("unit_cost")) });
  if (error) return { error: error.message };
  refresh(id);
  return { ok: true };
}

export async function bulkLoad(rows: BulkRow[]): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("carga_masiva_accesorios", { p_rows: rows });
  if (error) return { error: error.message };
  refresh();
  return { count: data };
}
