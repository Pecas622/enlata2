"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EditState = { error?: string; ok?: boolean };

export async function editDevice(_prev: EditState, form: FormData): Promise<EditState> {
  const id = String(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("editar_equipo", {
    p_device: id,
    p_price_usd: Number(form.get("price")),
    p_status: String(form.get("status")),
    p_notes: String(form.get("notes") ?? ""),
  });
  if (error) return { error: error.message };
  revalidatePath(`/stock/${id}`);
  revalidatePath("/stock");
  return { ok: true };
}
