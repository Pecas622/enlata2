// Investigación con IA (Claude + búsqueda web). Corre solo en el servidor: la clave sale de ANTHROPIC_API_KEY.
// Claude busca qué publica la competencia y de qué se habla en el rubro de la marca, y propone ideas. La respuesta
// pasa por parseResearch: cada punto tiene que citar páginas que la búsqueda encontró de verdad.
// La búsqueda web no se puede combinar con la salida JSON con esquema (las citas lo impiden), así que el JSON se pide
// en el texto y se valida a mano.
import Anthropic from "@anthropic-ai/sdk";
import { datesInMonth, monthOf, shiftMonth, shortDate, type Day } from "./calendar";
import { CHANNELS, FORMATS, GOALS } from "./channels";
import type { BrandCtx } from "./generator";
import { AI_MODEL, AiUnavailable } from "./generator-ai";
import { parseResearch, ResearchUnusable, type Research, type Source } from "./research";

// Buscar lleva más que escribir: varias búsquedas y leer los resultados.
export const RESEARCH_TIMEOUT_MS = 170_000;
const MAX_SEARCHES = 6;
const MAX_CONTINUATIONS = 3;

export function systemPrompt() {
  return `Sos investigador de marketing para pequeñas empresas y emprendimientos de Argentina. Antes de que la marca escriba sus publicaciones, buscás en internet qué está publicando su competencia y de qué se está hablando en su rubro y en su ciudad, y con eso proponés ideas concretas para publicar.

Cómo trabajás:
- Usá la búsqueda web. Buscá competidores del mismo rubro en la misma ciudad o zona (sus redes, su web, notas sobre ellos), temas y tendencias del rubro en Argentina en las últimas semanas, y fechas o noticias que la marca pueda aprovechar.
- Solo contá lo que encontraste. Cada tendencia y cada competidor lleva las URL exactas de las páginas de donde sale. Si no encontraste nada de un competidor, no lo inventes.
- Las ideas son para esta marca, con lo que vende y su tono. Nunca inventes precios, descuentos, cuotas, plazos ni datos de la marca. No copies a la competencia: tomá lo que les funciona y pensalo para esta marca.
- Español rioplatense, con voseo. Frases cortas y concretas.

Cuando termines de buscar, respondé solo con un bloque \`\`\`json con esta forma:
{
  "resumen": "2 o 3 frases con lo más importante que encontraste",
  "tendencias": [{ "titulo": "...", "detalle": "qué se está hablando y por qué le sirve a la marca", "fuentes": ["https://..."] }],
  "competencia": [{ "nombre": "...", "que_publica": "qué publica, en qué formato y qué parece funcionarle", "fuentes": ["https://..."] }],
  "ideas": [{ "tema": "de qué habla la pieza", "por_que": "qué de lo investigado la justifica", "red": "${CHANNELS.join(" | ")}", "formato": "${FORMATS.join(" | ")}", "objetivo": "${GOALS.join(" | ")}", "fuentes": ["https://..."] }]
}
Hasta 4 tendencias, hasta 4 competidores y entre 4 y 6 ideas.`;
}

export function userPrompt(brand: BrandCtx, focus: string, today: Day) {
  const month = monthOf(today);
  const dates = [...datesInMonth(month), ...datesInMonth(shiftMonth(month, 1))].filter((d) => d.day >= today).map((d) => `${d.name} (${shortDate(d.day)})`);
  const marca = {
    nombre: brand.name, rubro: brand.industry, ciudad: brand.city, que_hace: brand.description, a_quien_le_habla: brand.audience,
    por_que_elegirla: brand.value_prop, productos_o_servicios: brand.products, tono: brand.tone.join(", "), instagram: brand.instagram, web: brand.website,
  };
  return `Hoy es ${today}. Investigá para esta marca (JSON):
${JSON.stringify(marca, null, 2)}

${focus.trim() ? `La persona pidió mirar en especial: ${focus.trim()}` : "No pidió nada en especial: buscá competidores de su rubro en su zona y lo que se está hablando del rubro."}
Fechas comerciales que vienen: ${dates.join(", ") || "ninguna fuerte"}.`;
}

type Block = { type: string; [k: string]: unknown };

// Junta todas las páginas que devolvió la búsqueda, estén donde estén (resultados directos, filtrados por código o citas).
export function sourcesIn(blocks: unknown): Source[] {
  const out = new Map<string, string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if ((o.type === "web_search_result" || o.type === "web_search_result_location") && typeof o.url === "string") {
      if (!out.get(o.url)) out.set(o.url, typeof o.title === "string" ? o.title : "");
    }
    Object.values(o).forEach(walk);
  };
  walk(blocks);
  return [...out].map(([url, title]) => ({ url, title }));
}

type Client = Pick<Anthropic, "beta">;

export async function researchWithClaude(brand: BrandCtx, focus: string, today: Day, client: Client = new Anthropic()): Promise<Research & { dropped: number }> {
  const signal = AbortSignal.timeout(RESEARCH_TIMEOUT_MS);
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: userPrompt(brand, focus, today) }];
  const all: Block[] = [];
  let finalText = "";
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const res = await client.beta.messages.create(
      {
        model: AI_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: systemPrompt(),
        tools: [{
          type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES,
          user_location: { type: "approximate", country: "AR", city: brand.city || null, timezone: "America/Argentina/Mendoza" },
        }],
        messages,
      },
      { signal, maxRetries: 0 },
    );
    all.push(...(res.content as unknown as Block[]));
    if (res.stop_reason === "refusal") throw new AiUnavailable("la IA no respondió (refusal)");
    if (res.stop_reason === "max_tokens") throw new AiUnavailable("respuesta cortada");
    if (res.stop_reason === "pause_turn") {
      // La búsqueda quedó a mitad de camino: se reenvía el turno y el servidor sigue donde estaba.
      messages.splice(1, messages.length - 1, { role: "assistant", content: all as never });
      continue;
    }
    finalText = all.flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : [])).join("");
    break;
  }
  if (!finalText) throw new AiUnavailable("la búsqueda no terminó");
  try {
    return parseResearch(finalText, sourcesIn(all), brand);
  } catch (e) {
    if (e instanceof ResearchUnusable) throw new AiUnavailable(e.message);
    throw e;
  }
}
