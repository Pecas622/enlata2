"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CHANNELS, FORMATS, isValidCombo, unbackedNumbers, type Channel, type Format, type Goal } from "@/lib/channels";
import { getBrand } from "@/lib/data";
import { generateVariants, sourceText, type GenRequest } from "@/lib/generator";
import { AiUnavailable, generateWithClaude } from "@/lib/generator-ai";
import { requireSection } from "@/lib/guard";
import { hookOf, resourcesFor, structureFor, suggestedTime } from "@/lib/planner";
import { STATUSES, type Status } from "@/lib/workflow";
import { createClient } from "@/lib/supabase/server";
import { takeAi } from "@/lib/usage";

export type ActionState = { error?: string; ok?: string };

export async function saveContent(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("id") ?? "");
  const p = {
    title: String(form.get("title") ?? "").trim().slice(0, 120),
    body: String(form.get("body") ?? "").slice(0, 4000),
    hashtags: String(form.get("hashtags") ?? "").trim().slice(0, 400),
    cta: String(form.get("cta") ?? "").trim().slice(0, 200),
    publish_on: String(form.get("publish_on") ?? ""),
    post_time: /^\d{2}:\d{2}$/.test(String(form.get("post_time") ?? "")) ? String(form.get("post_time")) : "",
    hook: String(form.get("hook") ?? "").trim().slice(0, 300),
    structure: String(form.get("structure") ?? "").slice(0, 3000),
    resources: String(form.get("resources") ?? "").trim().slice(0, 500),
    rationale: String(form.get("rationale") ?? "").trim().slice(0, 500),
    // Si el texto salió de "Editar con IA", el historial dice con qué pedido.
    edited_with: ["ia", "reglas"].includes(String(form.get("edited_with") ?? "")) ? String(form.get("edited_with")) : "",
    edit_note: String(form.get("edit_note") ?? "").trim().slice(0, 300),
  };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_content", { p_id: id, p });
  if (error) return { error: error.message };
  revalidatePath(`/contenidos/${id}`);
  revalidatePath("/contenidos");
  return { ok: "Cambios guardados." };
}

export async function moveContent(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("id") ?? "");
  const to = String(form.get("to") ?? "") as Status;
  if (!STATUSES.includes(to)) return { error: "Estado inválido." };
  const note = String(form.get("note") ?? "").trim();
  if (form.get("needsNote") === "1" && !note) return { error: "Contá qué hay que cambiar." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_content_status", { p_id: id, p_status: to, p_note: note });
  if (error) return { error: error.message };
  revalidatePath(`/contenidos/${id}`);
  revalidatePath("/contenidos");
  revalidatePath("/inicio");
  return {};
}

// Copia la pieza tal cual, sin fecha, como borrador nuevo.
export async function duplicateContent(id: string): Promise<{ error?: string }> {
  const { perms } = await requireSection("contenidos");
  if (!perms.create) return { error: "Tu rol no crea contenidos." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_content", { p_id: id, p: { mode: "duplicate" } });
  if (error) return { error: error.message };
  revalidatePath("/contenidos");
  revalidatePath("/calendario");
  redirect(`/contenidos/${data}?copia=1`);
}

// Escribe la misma idea para otra red: con IA si hay clave (y si falla, plantillas). La pieza nueva queda el mismo día.
export async function adaptContent(id: string, channel: string, format: string): Promise<{ error?: string }> {
  const { perms } = await requireSection("contenidos");
  if (!perms.create) return { error: "Tu rol no crea contenidos." };
  if (!(CHANNELS as readonly string[]).includes(channel) || !(FORMATS as readonly string[]).includes(format) || !isValidCombo(channel as Channel, format as Format)) {
    return { error: "Elegí una red y un formato que existan juntos." };
  }
  const supabase = await createClient();
  const { data: piece } = await supabase.from("contents").select("brand_id, channel, format, goal, topic, title, body, publish_on").eq("id", id).maybeSingle();
  if (!piece) return { error: "Contenido inexistente." };
  if (piece.channel === channel && piece.format === format) return { error: "Elegí otra red o formato: para una copia igual usá Duplicar." };
  const brand = await getBrand(piece.brand_id);
  if (!brand) return { error: "Marca inexistente." };
  const req: GenRequest = {
    channel: channel as Channel, format: format as Format, goal: piece.goal as Goal, topic: piece.topic || piece.title,
    extra: piece.body ? `Es la adaptación de esta pieza de ${piece.channel}; mantené la idea y lo que dice, con la forma de la nueva red: ${piece.body.slice(0, 600)}` : "",
  };
  let v = generateVariants(brand, req)[0];
  let source: "ia" | "plantilla" = "plantilla";
  if ((await takeAi("adaptar")) === "ok") {
    try {
      // Si la IA mete un precio o porcentaje que no estaba, se queda la versión por plantilla.
      const ai = (await generateWithClaude(brand, req)).find((x) => !unbackedNumbers(x.body, sourceText(brand, req)).length);
      if (ai) { v = ai; source = "ia"; }
    } catch (e) {
      console.error("Adaptar con IA no disponible:", e instanceof AiUnavailable ? e.message : e);
    }
  }
  const { data, error } = await supabase.rpc("copy_content", {
    p_id: id,
    p: {
      mode: "adapt", channel, format, source, title: v.title.slice(0, 120), body: v.body.slice(0, 4000), hashtags: v.hashtags, cta: v.cta,
      hook: hookOf(v.body), structure: structureFor(format as Format, channel as Channel), resources: resourcesFor(format as Format, channel as Channel, brand.visual_style),
      publish_on: piece.publish_on ?? "", post_time: piece.publish_on ? suggestedTime(channel as Channel, format as Format, piece.publish_on) : "",
    },
  });
  if (error) return { error: error.message };
  revalidatePath("/contenidos");
  revalidatePath("/calendario");
  redirect(`/contenidos/${data}?adaptada=1`);
}

export async function deleteContent(id: string, back = "/contenidos"): Promise<{ error?: string }> {
  const { perms } = await requireSection("contenidos");
  if (!perms.create) return { error: "Tu rol no borra contenidos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_content", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/contenidos");
  revalidatePath("/calendario");
  revalidatePath("/inicio");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/contenidos");
}
