"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: boolean };

// Alta: la cuenta de Auth se crea con la clave de servicio (solo en el servidor y solo si quien
// pide es administrador); el perfil, el rol y el PIN los valida y guarda guardar_usuario.
export async function saveUser(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser();
  if (me.role !== "Administrador") return { error: "Solo el administrador gestiona usuarios." };
  const supabase = await createClient();
  let id = (fd.get("id") as string) || null;
  const isNew = !id;
  const admin = createServiceClient();

  if (isNew) {
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const password = String(fd.get("password") ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Escribí un email válido." };
    if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };
    if (!/^\d{4}$/.test(String(fd.get("pin") ?? ""))) return { error: "Elegí un PIN de 4 dígitos para el usuario." };
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: fd.get("name") } });
    if (error || !data.user) {
      return { error: /already|registered|exists/i.test(error?.message ?? "") ? "Ya hay una cuenta con ese email." : "No se pudo crear la cuenta." };
    }
    id = data.user.id;
  }

  const { error } = await supabase.rpc("guardar_usuario", {
    p_id: id,
    p_name: fd.get("name"),
    p_role: fd.get("role"),
    p_commission: Number(fd.get("commission")) || 0,
    p_active: fd.get("active") === "on",
    p_pin: fd.get("pin") ?? "",
  });
  if (error) {
    if (isNew) await admin.auth.admin.deleteUser(id!);
    return { error: error.message };
  }
  revalidatePath("/usuarios");
  if (isNew) redirect(`/usuarios?nuevo=${id}`);
  return { ok: true };
}
