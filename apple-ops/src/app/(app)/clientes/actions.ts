"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: boolean };

export async function saveClient(_: FormState, fd: FormData): Promise<FormState> {
  const id = (fd.get("id") as string) || null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("guardar_cliente", {
    p_id: id,
    p_name: fd.get("name"),
    p_phone: fd.get("phone") ?? "",
    p_dni: fd.get("dni") ?? "",
    p_email: fd.get("email") ?? "",
    p_notes: fd.get("notes") ?? "",
  });
  if (error) return { error: error.message };
  revalidatePath("/clientes");
  revalidatePath("/ventas");
  revalidatePath(`/clientes/${data}`);
  if (!id) redirect(`/clientes/${data}`);
  return { ok: true };
}
