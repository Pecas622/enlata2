"use server";

import type { Channel, Format } from "@/lib/channels";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { AI_LIMIT_NOTICE, takeAi } from "@/lib/usage";
import { AiUnavailable } from "@/lib/generator-ai";
import { planWithClaude, type Frame } from "@/lib/video-ai";
import { INSTRUCTION_MAX, MAX_FRAMES, readInstruction, rulePlan, validatePlan, type VideoPlan } from "@/lib/video";
import { canEdit, type Status } from "@/lib/workflow";

export type VideoProposal = { error?: string; plan?: VideoPlan; source?: "ia" | "reglas"; notice?: string };

const MAX_FRAME_B64 = 200_000;

// Arma el plan de edición de un video de la pieza. No toca el video: lo arma el navegador con este plan.
// Con `instruction` sigue lo que pidió la persona; con `previous`, cambia la edición anterior según ese pedido.
export async function proposeVideoPlan(id: string, input: { duration: number; frames: Frame[]; instruction?: string; previous?: VideoPlan }): Promise<VideoProposal> {
  const { user, perms } = await requireSection("contenidos");
  if (!perms.create) return { error: "Tu rol no edita contenidos." };
  const duration = Number(input.duration);
  if (!(duration > 0) || duration > 600) return { error: "No pude leer cuánto dura el video. Probá con otro archivo (hasta 10 minutos)." };
  const frames = (Array.isArray(input.frames) ? input.frames : [])
    .filter((f) => typeof f?.data === "string" && f.data.length < MAX_FRAME_B64 && /^[A-Za-z0-9+/=]+$/.test(f.data) && Number.isFinite(f.t))
    .slice(0, MAX_FRAMES);
  const supabase = await createClient();
  const { data: c } = await supabase.from("contents").select("channel, format, goal, status, body, hook, cta, brands(name, words_avoid, cta, products, description, value_prop)").eq("id", id).maybeSingle();
  if (!c) return { error: "Contenido inexistente." };
  if (!canEdit(c.status as Status, user.role)) return { error: "Una pieza publicada no se edita." };
  const brand = (c.brands as unknown as { name: string; words_avoid: string; cta: string; products: string; description: string; value_prop: string } | null) ?? { name: "", words_avoid: "", cta: "", products: "", description: "", value_prop: "" };
  const piece = { body: c.body ?? "", hook: c.hook ?? "", cta: c.cta || brand.cta || "" };
  const instruction = String(input.instruction ?? "").replace(/\s+/g, " ").trim().slice(0, INSTRUCTION_MAX);
  // Lo que escribió la persona también vale como fuente: sus textos y números son suyos.
  const source = [piece.body, piece.hook, piece.cta, brand.name, brand.products, brand.description, brand.value_prop, instruction].join(" ");
  const format = c.format as Format;
  const previous = input.previous ? validatePlan({ tramos: input.previous.segments, textos: input.previous.overlays }, duration, format, source + " " + (input.previous.overlays ?? []).map((o) => o.text).join(" ")) : undefined;

  const ai = frames.length ? await takeAi("video") : "sin-clave";
  let notice = ai === "sin-cupo" ? AI_LIMIT_NOTICE : undefined;
  if (ai === "ok") {
    try {
      const plan = await planWithClaude(
        { channel: c.channel as Channel, format, goal: c.goal, ...piece, brand: brand.name, wordsAvoid: brand.words_avoid, instruction, previous: previous?.segments.length ? previous : undefined },
        duration, frames, source + (previous ? " " + previous.overlays.map((o) => o.text).join(" ") : ""),
      );
      return { plan, source: "ia" };
    } catch (e) {
      console.error("Plan de video con IA no disponible:", e instanceof AiUnavailable ? e.message : e);
      notice = "La IA no pudo armar la edición, así que salió de las reglas con el guion de la pieza.";
    }
  }
  if (instruction && !Object.keys(readInstruction(instruction)).length) {
    notice = `${notice ? notice + " " : ""}Sin IA, de tu pedido solo puedo aplicar cuánto dura ("que dure 15 segundos"), desde dónde arranca ("arrancá en el segundo 5") y "sin textos".`;
  }
  return { plan: rulePlan(duration, format, piece, source, instruction), source: "reglas", notice };
}
