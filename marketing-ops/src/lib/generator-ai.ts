// Generador con IA (Claude). Corre solo en el servidor: la clave sale de ANTHROPIC_API_KEY y nunca llega
// al navegador. Devuelve 3 variantes con salida estructurada (JSON con esquema). Si algo falla, tarda más de
// AI_TIMEOUT_MS o la respuesta no sirve, la acción vuelve al generador por plantillas (generator.ts).
import Anthropic from "@anthropic-ai/sdk";
import { CHANNEL_RULES, formatLabel, normalizeHashtags, AD_PRIMARY_MAX, AD_TITLE_MAX, EMAIL_SUBJECT_MAX, STORY_MAX } from "./channels";
import { ctaFor, type BrandCtx, type GenRequest, type Variant } from "./generator";

export const AI_MODEL = "claude-opus-5-5";
export const AI_TIMEOUT_MS = 40_000;

export class AiUnavailable extends Error {}

const SCHEMA = {
  type: "object",
  properties: {
    variantes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          angulo: { type: "string", description: "Ángulo en 1 a 3 palabras, por ejemplo \"Pregunta\" o \"Detrás de escena\"." },
          titulo: { type: "string", description: "Nombre interno corto de la pieza, sin emojis." },
          texto: { type: "string", description: "El texto completo de la pieza, listo para copiar, con la estructura del formato." },
          hashtags: { type: "array", items: { type: "string" } },
          cta: { type: "string", description: "Llamado a la acción usado en el texto." },
        },
        required: ["angulo", "titulo", "texto", "hashtags", "cta"],
        additionalProperties: false,
      },
    },
  },
  required: ["variantes"],
  additionalProperties: false,
} as const;

export const FORMAT_GUIDE: Record<string, string> = {
  Post: "Un posteo: primera línea que frene el scroll, 1 a 3 párrafos cortos y el llamado a la acción al final.",
  Carrusel: "Un carrusel de 4 a 7 placas. Escribí cada placa en su línea como \"Placa N: ...\" (máximo 15 palabras por placa) y al final una línea \"Texto del posteo: ...\".",
  Reel: "Un guion de video vertical de 15 a 30 segundos. Cada escena en su línea con el tiempo, por ejemplo \"0-3 s · Gancho: ...\", con lo que se ve y el texto en pantalla. Al final una línea \"Texto del posteo: ...\".",
  Historia: `Una historia: líneas \"Texto: ...\" (hasta ${STORY_MAX} caracteres), \"Sticker: ...\" (qué sticker usar) y \"Cierre: ...\".`,
  Anuncio: `Un anuncio de Meta: líneas \"Texto principal: ...\" (hasta ${AD_PRIMARY_MAX} caracteres), \"Título: ...\" (hasta ${AD_TITLE_MAX}), \"Descripción: ...\" (hasta 30) y \"Botón: ...\" (Comprar, Enviar mensaje, Más información o Reservar). Sin hashtags.`,
  Mensaje: "Un mensaje de difusión de WhatsApp: saludo corto que diga quién escribe, el motivo en 2 o 3 líneas y cómo responder. Sin hashtags.",
  Email: `Un email: primera línea \"Asunto: ...\" (hasta ${EMAIL_SUBJECT_MAX} caracteres), saludo, 2 o 3 párrafos cortos, el llamado a la acción y la firma. Sin hashtags.`,
};

export function systemPrompt() {
  return `Sos redactor publicitario y community manager de pequeñas empresas y emprendimientos de Argentina. Escribís piezas para redes, anuncios y mensajes que venden sin sonar a publicidad.

Reglas:
- Español rioplatense natural, con voseo. Frases cortas, palabras de todos los días.
- Usá solo los datos de la marca y del pedido. Nunca inventes precios, descuentos, porcentajes, plazos, premios, cantidades, testimonios ni datos de contacto. Si el pedido no trae una oferta, la pieza no tiene oferta.
- Respetá el tono de la marca y no uses ninguna de sus palabras prohibidas.
- Prohibido: "potenciá", "llevá tu negocio al siguiente nivel", "solución integral", "disruptivo", "revolucionario", "ecosistema".
- Emojis: solo si el tono es cercano o divertido, y como mucho 2 por pieza. En LinkedIn y en emails, ninguno.
- Cada variante tiene un ángulo distinto (por ejemplo: una pregunta, un beneficio concreto, una escena de la vida real). No repitas la misma primera línea.
- El llamado a la acción va al final y es concreto.
- Devolvé exactamente 3 variantes.`;
}

export function userPrompt(brand: BrandCtx, req: GenRequest) {
  const rule = CHANNEL_RULES[req.channel];
  const format = req.format === "Mensaje" && req.channel === "Email" ? "Email" : req.format;
  const marca = {
    nombre: brand.name,
    rubro: brand.industry,
    ciudad: brand.city,
    mercado: brand.market ?? "",
    que_hace: brand.description,
    a_quien_le_habla: brand.audience,
    por_que_elegirla: brand.value_prop,
    productos_o_servicios: brand.products,
    tono: brand.tone.join(", ") || "Cercano",
    palabras_prohibidas: brand.words_avoid,
    llamado_a_la_accion: ctaFor(brand, req),
    hashtags_de_la_marca: brand.hashtags,
    instagram: brand.instagram,
    web: brand.website,
  };
  const hashtagRule = rule.maxHashtags === 0 || req.format === "Anuncio" ? "Sin hashtags (devolvé la lista vacía)." : `Hasta ${rule.maxHashtags} hashtags, empezando por los de la marca.`;
  return `Marca (JSON):
${JSON.stringify(marca, null, 2)}

Pedido:
- Canal: ${req.channel}
- Formato: ${formatLabel(req.format, req.channel)}. ${FORMAT_GUIDE[format]}
- Objetivo: ${req.goal}
- De qué habla: ${req.topic}
- Oferta o dato concreto: ${req.offer?.trim() || "ninguno (no inventes ninguna oferta)"}
- Algo más para decir: ${req.extra?.trim() || "nada"}
- Límite del canal: ${rule.maxChars} caracteres en total. ${hashtagRule}`;
}

type Raw = { variantes?: { angulo?: unknown; titulo?: unknown; texto?: unknown; hashtags?: unknown; cta?: unknown }[] };

// Valida y normaliza la respuesta del modelo. Lo que no tenga texto se descarta.
export function parseVariants(json: string, req: GenRequest): Variant[] {
  let raw: Raw;
  try {
    raw = JSON.parse(json) as Raw;
  } catch {
    throw new AiUnavailable("la IA no devolvió JSON");
  }
  const max = req.format === "Anuncio" ? 0 : CHANNEL_RULES[req.channel].maxHashtags;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const out = (raw.variantes ?? [])
    .map((v) => ({
      angle: s(v.angulo, 40) || "Variante",
      title: s(v.titulo, 80),
      body: s(v.texto, 4000),
      hashtags: max ? normalizeHashtags(Array.isArray(v.hashtags) ? v.hashtags.filter((h): h is string => typeof h === "string") : [], max) : "",
      cta: s(v.cta, 160),
    }))
    .filter((v) => v.body)
    .slice(0, 3);
  if (!out.length) throw new AiUnavailable("la IA no devolvió variantes");
  return out.map((v) => ({ ...v, title: v.title || v.body.split("\n")[0].slice(0, 60) }));
}

export async function generateWithClaude(brand: BrandCtx, req: GenRequest, client = new Anthropic()): Promise<Variant[]> {
  const res = await client.beta.messages.create(
    {
      model: AI_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt(brand, req) }],
    },
    { signal: AbortSignal.timeout(AI_TIMEOUT_MS), maxRetries: 0 },
  );
  if (res.stop_reason === "refusal") throw new AiUnavailable("la IA no respondió (refusal)");
  if (res.stop_reason === "max_tokens") throw new AiUnavailable("respuesta cortada");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return parseVariants(text, req);
}
