"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignupState = { error?: string; sent?: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Crea el usuario y lo deja adentro. Con invitación, usa el email invitado y entra a ese espacio; sin invitación,
// crea su propio espacio con el nombre del negocio (plan Prueba). Si Supabase pide confirmar el email, avisa que
// llegó un mail: al confirmar y entrar, la invitación o el espacio nuevo se toman solos (ver getCurrentUser).
export async function signup(_prev: SignupState, form: FormData): Promise<SignupState> {
  const token = String(form.get("token") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const business = String(form.get("business") ?? "").trim();
  if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };
  const supabase = await createClient();
  let email: string;
  if (token) {
    const { data: info } = await supabase.rpc("invitation_info", { p_token: token });
    const inv = (info as { email: string }[] | null)?.[0];
    if (!inv) return { error: "Esta invitación ya no sirve. Pedile al administrador que te mande una nueva." };
    email = inv.email;
  } else {
    email = String(form.get("email") ?? "").trim().toLowerCase();
    if (!business) return { error: "Escribí el nombre de tu negocio o agencia." };
    if (!EMAIL.test(email)) return { error: "El email no es válido." };
  }
  if (!name) return { error: "Escribí tu nombre." };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: token ? { name } : { name, workspace: business.slice(0, 80) }, emailRedirectTo: `${origin}/login?confirmado=1` },
  });
  if (error) {
    if (/already registered|already exists/i.test(error.message)) return { error: "Ese email ya tiene usuario. Entrá con tu contraseña desde el login." };
    return { error: "No se pudo crear el usuario: " + error.message };
  }
  if (!data.session) return { sent: `Te mandamos un mail a ${email} para confirmar. Confirmalo y después entrá con tu email y esta contraseña.` };
  // Con sesión ya está adentro: toma la invitación o crea su espacio.
  await supabase.rpc(token ? "accept_invitation" : "create_own_workspace");
  redirect(token ? "/inicio" : "/marca/nueva?bienvenida=1");
}
