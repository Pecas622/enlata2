"use server";

import { checkCopy, type Channel, type Format, type Goal } from "@/lib/channels";
import { getBrand } from "@/lib/data";
import { editInstruction, editSource, ruleEdit, type EditCopy, type EditPiece } from "@/lib/editor";
import { editWithClaude } from "@/lib/editor-ai";
import { AiUnavailable } from "@/lib/generator-ai";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { AI_LIMIT_NOTICE, takeAi } from "@/lib/usage";
import { canEdit, type Status } from "@/lib/workflow";

export type EditProposal = {
  error?: string;
  copy?: EditCopy;
  summary?: string;
  label?: string;
  source?: "ia" | "reglas";
  notice?: string;
  warnings?: string[];
};

// Propone una versión editada del texto que está en el editor (aunque no se haya guardado). No guarda nada:
// la persona la mira, la usa en el editor y guarda con save_content, que la vuelve a borrador si estaba aprobada.
export async function proposeEdit(id: string, current: EditCopy, action: string, free: string): Promise<EditProposal> {
  const { user, perms } = await requireSection("contenidos");
  if (!perms.create) return { error: "Tu rol no edita contenidos." };
  const ask = editInstruction(action, free);
  if (!ask) return { error: "Elegí un pedido o escribí qué querés cambiar." };
  const supabase = await createClient();
  const { data: c } = await supabase.from("contents").select("brand_id, channel, format, goal, status").eq("id", id).maybeSingle();
  if (!c) return { error: "Contenido inexistente." };
  if (!canEdit(c.status as Status, user.role)) return { error: "Una pieza publicada no se edita." };
  const body = String(current.body ?? "").slice(0, 4000);
  if (!body.trim()) return { error: "Escribí el texto primero: la IA edita lo que ya está." };
  const brand = await getBrand(c.brand_id);
  if (!brand) return { error: "Marca inexistente." };
  const piece: EditPiece = {
    body, hashtags: String(current.hashtags ?? "").slice(0, 400), cta: String(current.cta ?? "").slice(0, 200),
    channel: c.channel as Channel, format: c.format as Format, goal: c.goal as Goal,
  };
  const source = editSource(piece, brand, ask.prompt);
  const done = (copy: EditCopy, summary: string, from: "ia" | "reglas", notice?: string): EditProposal => ({
    copy, summary, label: ask.label, source: from, notice, warnings: checkCopy(copy, piece.channel, piece.format, brand, source),
  });

  const ai = await takeAi("editar");
  let notice = ai === "sin-cupo" ? AI_LIMIT_NOTICE : undefined;
  if (ai === "ok") {
    try {
      const r = await editWithClaude(brand, piece, ask.prompt);
      return done(r.copy, r.summary || "Listo.", "ia");
    } catch (e) {
      console.error("Editar con IA no disponible:", e instanceof AiUnavailable ? e.message : e);
      notice = "La IA no pudo con este pedido, así que lo hicieron las reglas.";
    }
  }
  const r = ruleEdit(piece, ask.action, brand);
  if (!r.ok) return { error: ai === "sin-cupo" ? `${AI_LIMIT_NOTICE} ${r.error}` : r.error };
  return done(r.copy, r.summary, "reglas", notice);
}
