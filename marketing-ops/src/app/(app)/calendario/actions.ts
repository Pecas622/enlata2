"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDays, isMonth, monthOf } from "@/lib/calendar";
import { getBrand, listContents, listResearch, listResults, publishedPieces } from "@/lib/data";
import { AiUnavailable } from "@/lib/generator-ai";
import { analyze } from "@/lib/metrics";
import { planSlots, rulePlan, type Plan } from "@/lib/planner";
import { planWithClaude } from "@/lib/planner-ai";
import { localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";

export async function reschedule(id: string, day: string | null): Promise<{ error?: string }> {
  await requireSection("calendario");
  if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Fecha inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_content", { p_id: id, p_day: day });
  if (error) return { error: error.message };
  revalidatePath("/calendario");
  revalidatePath("/contenidos");
  revalidatePath(`/contenidos/${id}`);
  return {};
}

export type PlanResult = { id?: string; error?: string; ai?: boolean };

// Arma el plan del mes de una marca y lo guarda. Con clave, Claude decide y escribe cada pieza; sin clave o si la IA
// falla, lo arman las reglas y las plantillas. Lo que devuelve la IA se valida acá antes de guardarlo.
export async function buildPlan(brandId: string, month: string): Promise<PlanResult> {
  const { perms } = await requireSection("calendario");
  if (!perms.create) return { error: "Tu rol no arma planes." };
  const today = localDay();
  if (!isMonth(month) || month < monthOf(today)) return { error: "Elegí este mes o uno que venga." };
  const brand = await getBrand(brandId);
  if (!brand) return { error: "Elegí una marca." };
  const [contents, results, research] = await Promise.all([listContents(), listResults(), listResearch(brand.id, 1)]);
  const existing = contents.filter((c) => c.brand_id === brand.id);
  const slots = planSlots(brand, month, existing, today);
  if (!slots.length) return { error: "Este mes ya está cubierto con la frecuencia de la marca: no hay fechas libres para sumar." };

  let plan: Plan & { fixed?: number } = rulePlan(brand, month, existing, today);
  let source: "ia" | "plantilla" = "plantilla";
  if (process.env.ANTHROPIC_API_KEY) {
    const since = addDays(today, -90);
    const rows = publishedPieces(existing, results).filter((p) => p.day >= since);
    const ctx = {
      research: research[0] ?? null,
      worked: analyze(rows).worked,
      existing: existing.filter((c) => c.publish_on?.startsWith(month)).map((c) => c.title || c.topic).filter(Boolean),
    };
    try {
      plan = await planWithClaude(brand, month, slots, ctx);
      source = "ia";
      if (plan.fixed) console.warn(`Plan del mes: ${plan.fixed} fechas se completaron con reglas o plantillas.`);
    } catch (e) {
      console.error("Plan con IA no disponible, se usan las reglas:", e instanceof AiUnavailable ? e.message : e);
    }
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_plan", { p_brand_id: brand.id, p_month: month, p: { source, summary: plan.summary, items: plan.items } });
  if (error) return { error: error.message };
  revalidatePath("/calendario/plan");
  return { id: data as string, ai: source === "ia" };
}

// Pasa al calendario las piezas elegidas. El navegador manda posiciones; el contenido sale del plan guardado.
export async function addPlanPieces(planId: string, indexes: number[], back: { month: string; brandId: string }): Promise<{ error?: string }> {
  const { perms } = await requireSection("calendario");
  if (!perms.create) return { error: "Tu rol no crea contenidos." };
  const clean = [...new Set(indexes)].filter((i) => Number.isInteger(i) && i >= 0 && i < 62);
  if (!clean.length) return { error: "Elegí al menos una pieza." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_plan_pieces", { p_plan_id: planId, p_indexes: clean });
  if (error) return { error: error.message };
  revalidatePath("/calendario");
  revalidatePath("/contenidos");
  revalidatePath("/inicio");
  redirect(`/calendario?mes=${isMonth(back.month) ? back.month : ""}&marca=${encodeURIComponent(back.brandId)}&agregadas=${data}`);
}
