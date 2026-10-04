"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";

export type SwitchState = { error?: string };

// Cambio de usuario en el mostrador: el usuario actual valida el PIN del otro (misma tienda)
// y, si es correcto, el servidor abre la sesión del otro sin pedir su contraseña.
export async function switchUser(_prev: SwitchState, form: FormData): Promise<SwitchState> {
  const target = String(form.get("profile") ?? "");
  const pin = String(form.get("pin") ?? "");
  if (!target || !/^\d{4}$/.test(pin)) return { error: "Elegí un usuario e ingresá su PIN de 4 dígitos." };

  const current = await getCurrentUser();
  const supabase = await createClient();
  const { data: ok, error } = await supabase.rpc("verificar_pin", { p_profile: target, p_pin: pin });
  if (error || !ok) return { error: "PIN incorrecto. Después de 5 intentos se bloquea 5 minutos." };

  const admin = createServiceClient();
  const { data: authUser } = await admin.auth.admin.getUserById(target);
  const email = authUser.user?.email;
  if (!email) return { error: "Ese usuario no tiene acceso configurado." };
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link.properties?.hashed_token) return { error: "No se pudo cambiar de usuario." };

  const { error: otpError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (otpError) return { error: "No se pudo cambiar de usuario." };

  const { data: next } = await admin.from("profiles").select("name").eq("id", target).single();
  await admin.from("audit_log").insert({
    store_id: current.storeId, profile_id: target, user_name: next?.name ?? "", action: "Cambio de usuario",
    detail: `De ${current.name} a ${next?.name ?? ""} con PIN`,
  });
  redirect("/dashboard");
}
