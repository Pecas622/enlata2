"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/guard";
import { scheduleAt } from "@/lib/publish";
import { publisherReady, runPublications } from "@/lib/publisher";
import { createClient } from "@/lib/supabase/server";

export type PublishState = { ok?: string; error?: string };

function done(id: string) {
  revalidatePath(`/contenidos/${id}`);
  revalidatePath("/calendario");
  revalidatePath("/redes");
}

// Publica ya: la programa para ahora (la base valida rol, estado, cuenta y archivos) y corre el publicador solo para
// esta pieza. Si es un video que Instagram todavía procesa, queda "Publicando" y el cron la termina.
export async function publishNow(_: PublishState, form: FormData): Promise<PublishState> {
  const id = String(form.get("id") ?? "");
  const { perms } = await requireSection("contenidos");
  if (!perms.create) return { error: "Tu rol no publica." };
  if (!publisherReady()) return { error: "Falta configurar el publicador en el servidor (SUPABASE_SERVICE_ROLE_KEY y TOKENS_KEY)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_publication", { p_content_id: id, p_at: new Date().toISOString() });
  if (error) return { error: error.message };
  try {
    const r = await runPublications({ only: id, limit: 1 });
    const o = r.outcomes[id];
    done(id);
    if (!o) return { ok: "Quedó en la cola: sale en unos minutos." };
    if ("ok" in o) return { ok: "¡Publicada en Instagram!" };
    if ("retry" in o) return { ok: "Instagram está procesando el video. Cuando termine, queda publicada sola." };
    return { error: `Instagram no la publicó: ${o.error}` };
  } catch (e) {
    done(id);
    return { error: e instanceof Error ? e.message : "No se pudo publicar." };
  }
}

export async function schedulePublication(_: PublishState, form: FormData): Promise<PublishState> {
  const id = String(form.get("id") ?? "");
  const { perms } = await requireSection("contenidos");
  if (!perms.create) return { error: "Tu rol no publica." };
  const at = scheduleAt(String(form.get("day") ?? ""), String(form.get("time") ?? ""));
  if (!at) return { error: "Elegí el día y la hora." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_publication", { p_content_id: id, p_at: at });
  if (error) return { error: error.message };
  done(id);
  return { ok: "Programada." };
}

export async function cancelPublication(_: PublishState, form: FormData): Promise<PublishState> {
  const id = String(form.get("id") ?? "");
  const { perms } = await requireSection("contenidos");
  if (!perms.create) return { error: "Tu rol no publica." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_publication", { p_content_id: id });
  if (error) return { error: error.message };
  done(id);
  return { ok: "Cancelada." };
}
