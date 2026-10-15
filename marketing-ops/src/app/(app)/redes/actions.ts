"use server";

import { revalidatePath } from "next/cache";
import { decrypt, encrypt } from "@/lib/crypto";
import { requireSection } from "@/lib/guard";
import { IgError, profile, refresh, shouldRefresh } from "@/lib/instagram";
import { createClient } from "@/lib/supabase/server";

export type CheckResult = { ok?: string; error?: string };

// Prueba la conexión contra Instagram con el token guardado: trae usuario y seguidores, y renueva el token si está por
// vencer. Si Instagram dice que el token no sirve, la conexión queda Vencida y hay que reconectar.
export async function checkSocial(id: string): Promise<CheckResult> {
  const { perms } = await requireSection("redes");
  if (!perms.create) return { error: "Tu rol no maneja las redes." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("social_token", { p_id: id });
  const row = (data as { token_enc: string; token_expires_at: string | null; platform: string; connected_at: string }[] | null)?.[0];
  if (!row) return { error: "Esa conexión no existe." };
  if (row.platform !== "Instagram") return { error: "Por ahora solo se prueba Instagram." };
  let token: string;
  try {
    token = decrypt(row.token_enc);
  } catch {
    return { error: "No se pudo leer el token guardado: revisá TOKENS_KEY en el servidor o reconectá la cuenta." };
  }
  try {
    const patch: Record<string, string | number> = {};
    if (shouldRefresh(row.token_expires_at, row.connected_at)) {
      const fresh = await refresh(token);
      token = fresh.token;
      patch.token_enc = encrypt(fresh.token);
      patch.token_expires_at = fresh.expiresAt ?? "";
    }
    const me = await profile(token);
    await supabase.rpc("save_social_check", {
      p_id: id,
      p: { ...patch, status: "Conectada", username: me.username, name: me.name, picture_url: me.profile_picture_url, followers: me.followers_count ?? "" },
    });
    revalidatePath("/redes");
    return { ok: `Conectada: @${me.username}${me.followers_count !== null ? `, ${me.followers_count.toLocaleString("es-AR")} seguidores` : ""}.` };
  } catch (e) {
    const expired = e instanceof IgError && e.expired;
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await supabase.rpc("save_social_check", { p_id: id, p: { status: expired ? "Vencida" : "Error", last_error: msg } });
    revalidatePath("/redes");
    return { error: expired ? "Instagram dice que el permiso venció o se revocó. Volvé a conectar la cuenta." : `Instagram respondió: ${msg}` };
  }
}

export async function disconnectSocial(id: string): Promise<CheckResult> {
  const { perms } = await requireSection("redes");
  if (!perms.editBrand) return { error: "Solo el Administrador desconecta redes." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_social", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/redes");
  return { ok: "Desconectada." };
}
