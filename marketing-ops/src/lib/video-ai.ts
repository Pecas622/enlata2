// Plan de edición de video con IA (Claude). Corre solo en el servidor. Claude mira fotogramas del video con su
// momento y la pieza, y devuelve qué tramos quedan y qué textos van en pantalla (JSON con esquema). Todo pasa por
// validatePlan; si falla o no deja ningún tramo, la acción usa rulePlan.
import Anthropic from "@anthropic-ai/sdk";
import { formatLabel, type Channel, type Format } from "./channels";
import { AI_MODEL, AI_TIMEOUT_MS, AiUnavailable } from "./generator-ai";
import { OVERLAY_MAX, targetLength, validatePlan, type VideoPlan } from "./video";

const SCHEMA = {
  type: "object",
  properties: {
    tramos: {
      type: "array",
      description: "Los tramos del video original que quedan, en orden, en segundos.",
      items: { type: "object", properties: { inicio: { type: "number" }, fin: { type: "number" } }, required: ["inicio", "fin"], additionalProperties: false },
    },
    textos: {
      type: "array",
      description: "Textos en pantalla. Los tiempos son del video ya editado (empieza en 0).",
      items: {
        type: "object",
        properties: {
          inicio: { type: "number" },
          fin: { type: "number" },
          texto: { type: "string", description: `Hasta ${OVERLAY_MAX} caracteres.` },
          posicion: { type: "string", enum: ["arriba", "centro", "abajo"] },
        },
        required: ["inicio", "fin", "texto", "posicion"],
        additionalProperties: false,
      },
    },
    resumen: { type: "string", description: "Qué hiciste, en una oración corta, en voseo." },
  },
  required: ["tramos", "textos", "resumen"],
  additionalProperties: false,
} as const;

export type Frame = { t: number; data: string }; // data: JPEG en base64, sin el prefijo data:

export type VideoPiece = {
  channel: Channel; format: Format; goal: string; body: string; hook: string; cta: string; brand: string; wordsAvoid: string;
  instruction?: string;    // lo que pidió la persona, con sus palabras
  previous?: VideoPlan;    // la edición anterior, cuando pide cambios sobre ella
};

export function videoSystemPrompt() {
  return `Sos editor de videos cortos para redes de pequeñas empresas y emprendimientos de Argentina. Te pasan fotogramas de un video con su momento en segundos y la pieza para la que es, y decidís cómo editarlo.

Reglas:
- Elegí los tramos que mejor muestran el producto o el servicio y sacá lo que sobra: tiempos muertos, cuadros movidos, oscuros o repetidos.
- El primer segundo tiene que enganchar: arrancá con el momento más llamativo.
- Los textos en pantalla salen de la pieza (gancho, guion, llamado a la acción). Cortos, que se lean en 2 o 3 segundos. Español rioplatense, con voseo.
- Nunca inventes precios, descuentos, porcentajes, plazos ni datos. No uses las palabras prohibidas de la marca.
- Que los textos no tapen lo importante de la imagen: elegí arriba, centro o abajo según lo que ves.
- El último texto es el llamado a la acción.
- Si la persona escribe un pedido, seguilo por encima de estas reglas de estilo (qué mostrar, el orden, los textos, el largo, sin textos), pero nunca inventes datos ni te pases del largo máximo del formato. Los textos que escriba la persona entre comillas van tal cual.
- Si te pasan la edición anterior, cambiá solo lo que pide el pedido y dejá el resto igual.`;
}

export function videoUserPrompt(piece: VideoPiece, duration: number) {
  const { min, ideal, max } = targetLength(piece.format);
  return `Marca: ${piece.brand}. Palabras prohibidas: ${piece.wordsAvoid || "ninguna"}.
Pieza: ${piece.channel} · ${formatLabel(piece.format, piece.channel)} · objetivo ${piece.goal}.
Gancho: ${piece.hook || "(sin gancho cargado)"}
Llamado a la acción: ${piece.cta || "(sin llamado cargado)"}
Texto o guion de la pieza:
"""
${piece.body.slice(0, 2000)}
"""

El video original dura ${duration.toFixed(1)} s. El editado tiene que durar entre ${min} y ${max} s (ideal ${ideal} s), o menos si el original es más corto o si la persona lo pide. Se ve vertical (9:16).
Arriba de cada fotograma va su momento en segundos.${piece.previous ? `

Edición anterior (JSON, tiempos en segundos):
${JSON.stringify({ tramos: piece.previous.segments, textos: piece.previous.overlays })}` : ""}${piece.instruction?.trim() ? `

Pedido de la persona: ${piece.instruction.trim()}` : ""}`;
}

export async function planWithClaude(piece: VideoPiece, duration: number, frames: Frame[], source: string, client = new Anthropic()): Promise<VideoPlan> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const f of frames) {
    content.push({ type: "text", text: `Segundo ${f.t.toFixed(1)}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } });
  }
  content.push({ type: "text", text: videoUserPrompt(piece, duration) });
  const res = await client.beta.messages.create(
    {
      model: AI_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: videoSystemPrompt(),
      messages: [{ role: "user", content }],
    },
    { signal: AbortSignal.timeout(AI_TIMEOUT_MS), maxRetries: 0 },
  );
  if (res.stop_reason === "refusal") throw new AiUnavailable("la IA no respondió (refusal)");
  if (res.stop_reason === "max_tokens") throw new AiUnavailable("respuesta cortada");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AiUnavailable("la IA no devolvió JSON");
  }
  const plan = validatePlan(raw as Parameters<typeof validatePlan>[0], duration, piece.format, source);
  if (!plan.segments.length) throw new AiUnavailable("la IA no dejó ningún tramo válido");
  return plan;
}
