"use server";

import { redirect } from "next/navigation";
import { CHANNELS, FORMATS, GOALS, checkCopy, isValidCombo, type Channel, type Format, type Goal } from "@/lib/channels";
import { getBrand } from "@/lib/data";
import { generateVariants, sourceText, type GenRequest, type Variant } from "@/lib/generator";
import { AiUnavailable, generateWithClaude } from "@/lib/generator-ai";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";

export type GenInput = { brandId: string; channel: string; format: string; goal: string; topic: string; offer: string; extra: string; seed: number };
export type GenVariant = Variant & { warnings: string[] };
export type GenResult = { error?: string; source?: "ia" | "plantilla"; notice?: string; variants?: GenVariant[] };

function parse(input: GenInput): GenRequest | string {
  const { channel, format, goal } = input;
  if (!(CHANNELS as readonly string[]).includes(channel) || !(FORMATS as readonly string[]).includes(format) || !(GOALS as readonly string[]).includes(goal)) return "Elegí canal, formato y objetivo.";
  if (!isValidCombo(channel as Channel, format as Format)) return `${format} no está disponible en ${channel}.`;
  const topic = input.topic.trim().slice(0, 300);
  if (!topic) return "Contá de qué querés hablar.";
  return { channel: channel as Channel, format: format as Format, goal: goal as Goal, topic, offer: input.offer.trim().slice(0, 300), extra: input.extra.trim().slice(0, 500) };
}

export async function generate(input: GenInput): Promise<GenResult> {
  await requireSection("generar");
  const req = parse(input);
  if (typeof req === "string") return { error: req };
  const brand = await getBrand(input.brandId);
  if (!brand) return { error: "Elegí una marca." };

  let variants: Variant[];
  let source: "ia" | "plantilla" = "plantilla";
  let notice: string | undefined;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      variants = await generateWithClaude(brand, req);
      source = "ia";
    } catch (e) {
      console.error("Generador con IA no disponible:", e instanceof AiUnavailable ? e.message : e);
      variants = generateVariants(brand, req, input.seed);
      notice = "La IA no respondió a tiempo: estas variantes salen de las plantillas, con los mismos datos de la marca.";
    }
  } else {
    variants = generateVariants(brand, req, input.seed);
  }
  const src = sourceText(brand, req);
  return { source, notice, variants: variants.map((v) => ({ ...v, warnings: checkCopy(v, req.channel, req.format, brand, src) })) };
}

export async function saveVariant(input: GenInput, v: Variant, source: "ia" | "plantilla"): Promise<{ error?: string }> {
  await requireSection("generar");
  const req = parse(input);
  if (typeof req === "string") return { error: req };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_content", {
    p_id: null,
    p: {
      brand_id: input.brandId, channel: req.channel, format: req.format, goal: req.goal, topic: req.topic,
      title: v.title.slice(0, 120), body: v.body.slice(0, 4000), hashtags: v.hashtags.slice(0, 400), cta: v.cta.slice(0, 200), source,
    },
  });
  if (error) return { error: error.message };
  redirect(`/contenidos/${data}?nueva=1`);
}
