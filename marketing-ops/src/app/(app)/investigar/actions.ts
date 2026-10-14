"use server";

import { revalidatePath } from "next/cache";
import { getBrand } from "@/lib/data";
import { localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { AiUnavailable } from "@/lib/generator-ai";
import { researchWithClaude } from "@/lib/research-ai";
import { createClient } from "@/lib/supabase/server";
import { takeAi } from "@/lib/usage";

export type ResearchResult = { id?: string; error?: string };

// Investiga con IA y guarda el resultado. La respuesta de Claude se valida en el servidor antes de guardarla.
export async function runResearch(brandId: string, focus: string): Promise<ResearchResult> {
  const { perms } = await requireSection("investigar");
  if (!perms.create) return { error: "Tu rol no investiga." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "La investigación con IA necesita la clave de Anthropic configurada en el servidor." };
  const brand = await getBrand(brandId);
  if (!brand) return { error: "Elegí una marca." };
  if ((await takeAi("investigar")) === "sin-cupo") return { error: "Se terminaron las acciones con IA de tu plan este mes. Mientras tanto tenés las ideas de abajo." };
  let research;
  try {
    research = await researchWithClaude(brand, focus.slice(0, 300), localDay());
    if (research.dropped) console.warn(`Investigación: se descartaron ${research.dropped} puntos sin fuentes o con datos inventados.`);
  } catch (e) {
    console.error("Investigación con IA no disponible:", e instanceof AiUnavailable ? e.message : e);
    return { error: "La IA no pudo terminar la investigación. Probá de nuevo en un rato; mientras tanto tenés las ideas de abajo." };
  }
  const supabase = await createClient();
  const { summary, trends, competitors, ideas, sources } = research;
  const { data, error } = await supabase.rpc("save_research", { p_brand_id: brand.id, p: { summary, trends, competitors, ideas, sources, focus: focus.trim().slice(0, 300) } });
  if (error) return { error: error.message };
  revalidatePath("/investigar");
  return { id: data as string };
}

// Pasa una idea guardada al calendario. El navegador manda qué idea y qué día; el contenido sale de la base.
export async function addResearchIdea(researchId: string, index: number, day: string): Promise<{ contentId?: string; error?: string }> {
  const { perms } = await requireSection("investigar");
  if (!perms.create) return { error: "Tu rol no crea contenidos." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Elegí un día." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_research_idea", { p_research_id: researchId, p_index: index, p_day: day });
  if (error) return { error: error.message };
  revalidatePath("/investigar");
  revalidatePath("/calendario");
  revalidatePath("/contenidos");
  return { contentId: data as string };
}
