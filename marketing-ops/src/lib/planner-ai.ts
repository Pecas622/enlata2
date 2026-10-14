// Plan del mes con IA (Claude). Corre solo en el servidor: la clave sale de ANTHROPIC_API_KEY.
// Dos pasos: primero Claude decide qué va en cada fecha (con la marca, su última investigación y lo que funcionó),
// después desarrolla las piezas en tandas en paralelo. Las fechas las pone el plan por reglas (frecuencia, días
// libres, fechas comerciales) y todo pasa por parseStrategy y parsePieces: lo que no sirve se escribe con plantillas.
import Anthropic from "@anthropic-ai/sdk";
import { monthLabel, type Month, type PlanItem } from "./calendar";
import { CHANNEL_RULES, FORMATS, GOALS, formatLabel } from "./channels";
import { ctaFor } from "./generator";
import { AI_MODEL, AiUnavailable, FORMAT_GUIDE } from "./generator-ai";
import { allowedNumbers } from "./insights-ai";
import type { Insight } from "./metrics";
import { brandChannels, clampPerWeek, parsePieces, parseStrategy, planSummary, slotLine, type Plan, type PlanBrand } from "./planner";
import type { Research } from "./research";

export const STRATEGY_TIMEOUT_MS = 60_000;
export const PIECES_TIMEOUT_MS = 100_000;
const BATCH = 5;

export type PlanContext = {
  research?: Pick<Research, "summary" | "trends" | "competitors" | "ideas"> | null;
  worked?: Insight[]; // lo que funcionó en los últimos meses (análisis por reglas)
  existing?: string[]; // temas que la marca ya tiene en el mes
};

const STRATEGY_SCHEMA = {
  type: "object",
  properties: {
    resumen: { type: "string", description: "La estrategia del mes en 2 o 3 frases." },
    piezas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Una de las fechas dadas, YYYY-MM-DD." },
          red: { type: "string" },
          formato: { type: "string", enum: FORMATS.filter((f) => f !== "Anuncio") },
          objetivo: { type: "string", enum: [...GOALS] },
          tema: { type: "string", description: "De qué habla la pieza, concreto." },
          por_que: { type: "string", description: "Por qué conviene esta pieza en esta fecha: qué la justifica." },
        },
        required: ["fecha", "red", "formato", "objetivo", "tema", "por_que"],
        additionalProperties: false,
      },
    },
  },
  required: ["resumen", "piezas"],
  additionalProperties: false,
} as const;

const PIECES_SCHEMA = {
  type: "object",
  properties: {
    piezas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fecha: { type: "string" },
          titulo: { type: "string", description: "Nombre interno corto, sin emojis." },
          gancho: { type: "string", description: "La primera frase o los primeros 3 segundos." },
          estructura: { type: "string", description: "Cómo se arma: escenas, placas o partes, una por línea." },
          texto: { type: "string", description: "La pieza completa, lista para copiar, con la forma del formato." },
          hashtags: { type: "array", items: { type: "string" } },
          cta: { type: "string" },
          recursos: { type: "string", description: "Qué hace falta producir: fotos, video, placas, medidas." },
          horario: { type: "string", description: "Horario sugerido HH:MM, hora de Argentina." },
        },
        required: ["fecha", "titulo", "gancho", "estructura", "texto", "hashtags", "cta", "recursos", "horario"],
        additionalProperties: false,
      },
    },
  },
  required: ["piezas"],
  additionalProperties: false,
} as const;

const RULES = `- Español rioplatense natural, con voseo. Frases cortas, palabras de todos los días.
- Usá solo los datos de la marca. Nunca inventes precios, descuentos, porcentajes, cuotas, plazos, premios, cantidades, testimonios, métricas ni datos de contacto.
- No prometas resultados ni viralidad.
- Respetá el tono de la marca y no uses sus palabras prohibidas.`;

export function strategySystem() {
  return `Sos director de marketing de pequeñas empresas y emprendimientos de Argentina. Armás el plan de contenidos del mes: qué publicar en cada fecha, en qué red y formato, con qué objetivo y por qué.

Cómo trabajás:
- Te doy las fechas del mes ya elegidas (respetan la frecuencia de la marca y las fechas comerciales). Usá exactamente esas fechas, una pieza por fecha.
- Mezclá objetivos: no todo es vender. Variá los formatos y no repitas temas.
- Aprovechá lo que encontró la investigación y lo que le funcionó a la marca, y decilo en el "por qué". Si no hay datos, justificá con la fecha, el objetivo de la marca o su público, sin inventar cifras.
- Solo usá las redes de la marca.
${RULES}`;
}

const marcaJson = (b: PlanBrand) => ({
  nombre: b.name, rubro: b.industry, ciudad: b.city, mercado: b.market, que_hace: b.description, a_quien_le_habla: b.audience,
  por_que_elegirla: b.value_prop, productos_o_servicios: b.products, objetivos: b.goals, tono: b.tone.join(", ") || "Cercano",
  palabras_prohibidas: b.words_avoid, llamado_a_la_accion: b.cta, hashtags_de_la_marca: b.hashtags, identidad_visual: b.visual_style,
  redes: brandChannels(b).join(", "), publicaciones_por_semana: clampPerWeek(b.posts_per_week),
});

export function strategyPrompt(brand: PlanBrand, month: Month, slots: PlanItem[], ctx: PlanContext) {
  const research = ctx.research
    ? { resumen: ctx.research.summary, tendencias: ctx.research.trends.map((t) => `${t.title}: ${t.detail}`), competencia: ctx.research.competitors.map((c) => `${c.name}: ${c.detail}`), ideas: ctx.research.ideas.map((i) => `${i.topic} (${i.why})`) }
    : null;
  return `Mes: ${monthLabel(month)}.
Marca (JSON):
${JSON.stringify(marcaJson(brand), null, 2)}

Fechas del plan, con una propuesta por reglas que podés cambiar (JSON):
${JSON.stringify(slots.map(slotLine), null, 2)}

Última investigación de la marca: ${research ? JSON.stringify(research, null, 2) : "no hay."}
Lo que le funcionó: ${ctx.worked?.length ? ctx.worked.map((w) => `${w.title}. ${w.detail}`).join(" | ") : "todavía no hay resultados cargados."}
Temas que ya tiene este mes (no los repitas): ${ctx.existing?.length ? ctx.existing.join(" | ") : "ninguno."}`;
}

export function piecesSystem() {
  return `Sos redactor publicitario y community manager de pequeñas empresas de Argentina. Desarrollás las piezas de un plan de contenidos ya decidido: para cada fecha, el gancho, la estructura, el texto completo, los hashtags, el llamado a la acción, los recursos a producir y un horario sugerido.

${RULES}
- Emojis solo si el tono es cercano o divertido, como mucho 2 por pieza. En LinkedIn y emails, ninguno.
- El texto respeta la forma de cada formato y el largo de la red.
- El horario es una sugerencia para Argentina según la red y el público; no lo presentes como dato.`;
}

export function piecesPrompt(brand: PlanBrand, slots: (PlanItem & { reason: string })[]) {
  const piezas = slots.map((s) => {
    const rule = CHANNEL_RULES[s.channel];
    const format = s.format === "Mensaje" && s.channel === "Email" ? "Email" : s.format;
    return {
      fecha: s.publish_on, red: s.channel, formato: formatLabel(s.format, s.channel), objetivo: s.goal, tema: s.topic, por_que: s.reason,
      como_se_escribe: FORMAT_GUIDE[format], limite: `${rule.maxChars} caracteres`, hashtags: rule.maxHashtags ? `hasta ${rule.maxHashtags}, empezando por los de la marca` : "ninguno",
      llamado_a_la_accion: ctaFor(brand, { goal: s.goal, channel: s.channel }),
    };
  });
  return `Marca (JSON):
${JSON.stringify(marcaJson(brand), null, 2)}

Piezas a desarrollar (JSON):
${JSON.stringify(piezas, null, 2)}`;
}

type Client = Pick<Anthropic, "beta">;

async function ask(client: Client, system: string, content: string, schema: { [key: string]: unknown }, maxTokens: number, timeout: number): Promise<unknown> {
  const res = await client.beta.messages.create(
    {
      model: AI_MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content }],
    },
    { signal: AbortSignal.timeout(timeout), maxRetries: 0 },
  );
  if (res.stop_reason === "refusal") throw new AiUnavailable("la IA no respondió (refusal)");
  if (res.stop_reason === "max_tokens") throw new AiUnavailable("respuesta cortada");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new AiUnavailable("la IA no devolvió JSON");
  }
}

// Si falla el primer paso, todo el plan vuelve a las reglas (lo decide la acción). Si falla una tanda del segundo,
// solo esas fechas se escriben con plantillas.
export async function planWithClaude(brand: PlanBrand, month: Month, slots: PlanItem[], ctx: PlanContext, client: Client = new Anthropic()): Promise<Plan & { fixed: number }> {
  if (!slots.length) return { summary: "", items: [], fixed: 0 };
  const allowed = allowedNumbers([marcaJson(brand), ctx.research ?? null, ctx.worked ?? []]);
  const raw = await ask(client, strategySystem(), strategyPrompt(brand, month, slots, ctx), STRATEGY_SCHEMA, 8000, STRATEGY_TIMEOUT_MS);
  const strategy = parseStrategy(raw, slots, brandChannels(brand), allowed);
  const batches: (typeof strategy.slots)[] = [];
  for (let i = 0; i < strategy.slots.length; i += BATCH) batches.push(strategy.slots.slice(i, i + BATCH));
  const done = await Promise.all(
    batches.map((b) =>
      ask(client, piecesSystem(), piecesPrompt(brand, b), PIECES_SCHEMA, 12000, PIECES_TIMEOUT_MS)
        .catch(() => ({ piezas: [] }))
        .then((json) => parsePieces(json, b, brand)),
    ),
  );
  const items = done.flatMap((d) => d.items);
  return {
    summary: strategy.summary || planSummary(brand, month, items),
    items,
    fixed: strategy.fixed + done.reduce((n, d) => n + d.fixed, 0),
  };
}
