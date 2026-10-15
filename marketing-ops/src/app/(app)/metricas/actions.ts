"use server";

import { revalidatePath } from "next/cache";
import { listBrands, listContents, listResults, publishedPieces } from "@/lib/data";
import { localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { AiUnavailable } from "@/lib/generator-ai";
import { analyzeWithClaude } from "@/lib/insights-ai";
import { analyze, inPeriod, previousPeriod, resolvePeriod, type Analysis } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";
import { AI_LIMIT_NOTICE, takeAi } from "@/lib/usage";

export type ResultsState = { error?: string; ok?: string };

const FIELDS = ["reach", "interactions", "clicks", "inquiries", "sales", "spend"] as const;

export async function saveResults(_prev: ResultsState, form: FormData): Promise<ResultsState> {
  const { perms } = await requireSection("metricas");
  if (!perms.create) return { error: "Tu rol no carga resultados." };
  const id = String(form.get("content_id") ?? "");
  const p: Record<string, string> = { notes: String(form.get("notes") ?? "").trim() };
  for (const k of FIELDS) {
    // Acepta "1.450" o "1450"; en pesos también "22.000,50".
    const raw = String(form.get(k) ?? "").trim().replace(/\s|\$/g, "").replace(/\./g, "").replace(",", ".");
    if (raw && !(k === "spend" ? /^\d+(\.\d{1,2})?$/ : /^\d+$/).test(raw)) return { error: k === "spend" ? "La inversión tiene que ser un monto en pesos." : "Los resultados tienen que ser números enteros, sin signos." };
    p[k] = raw || "0";
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_results", { p_content_id: id, p });
  if (error) return { error: error.message };
  revalidatePath(`/contenidos/${id}`);
  revalidatePath("/metricas");
  return { ok: "Resultados guardados." };
}

export type AiAnalysis = { analysis?: Analysis; source?: "ia" | "reglas"; notice?: string; error?: string };

// El análisis con IA se pide a mano (cuesta una llamada); por defecto la pantalla muestra el de reglas.
export async function analyzeWithAI(mes: string | null, brandId: string | null): Promise<AiAnalysis> {
  await requireSection("metricas");
  if (!process.env.ANTHROPIC_API_KEY) return { error: "El análisis con IA necesita la clave de Anthropic configurada en el servidor." };
  const today = localDay();
  const period = resolvePeriod(mes ?? undefined, today);
  const prevPeriod = previousPeriod(period);
  const [contents, results, brands] = await Promise.all([listContents(), listResults(), listBrands()]);
  const brand = brands.find((b) => b.id === brandId);
  const all = publishedPieces(contents, results).filter((p) => !brand || p.brand_id === brand.id);
  const rows = all.filter((p) => inPeriod(p.day, period));
  const prev = all.filter((p) => inPeriod(p.day, prevPeriod));
  const rules = analyze(rows, prev);
  if (!rows.some((p) => p.results)) return { analysis: rules, source: "reglas" };
  if ((await takeAi("analizar")) === "sin-cupo") return { analysis: rules, source: "reglas", notice: AI_LIMIT_NOTICE };
  try {
    const ai = await analyzeWithClaude(rows, prev, period);
    if (ai.dropped) console.warn(`Análisis con IA: se descartaron ${ai.dropped} puntos con números que no estaban en los datos.`);
    return { analysis: { ...ai, summary: ai.summary || rules.summary }, source: "ia" };
  } catch (e) {
    console.error("Análisis con IA no disponible:", e instanceof AiUnavailable ? e.message : e);
    return { analysis: rules, source: "reglas", notice: "La IA no respondió a tiempo: este análisis sale de las reglas, con los mismos resultados." };
  }
}
