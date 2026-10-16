// Editar con IA (Claude). Corre solo en el servidor. Reescribe la pieza según el pedido, con salida JSON con esquema;
// todo pasa por parseEdit, que descarta lo que traiga números inventados. Si falla, la acción usa las reglas (editor.ts).
import Anthropic from "@anthropic-ai/sdk";
import { CHANNEL_RULES, formatLabel } from "./channels";
import { AI_MODEL, AI_TIMEOUT_MS, AiUnavailable, FORMAT_GUIDE } from "./generator-ai";
import { ctaFor, type BrandCtx } from "./generator";
import { editSource, parseEdit, EditRejected, type EditCopy, type EditPiece } from "./editor";

const SCHEMA = {
  type: "object",
  properties: {
    texto: { type: "string", description: "El texto completo de la pieza ya editado, listo para copiar, con la misma estructura del formato." },
    hashtags: { type: "array", items: { type: "string" } },
    cta: { type: "string", description: "El llamado a la acción que quedó en el texto." },
    cambios: { type: "string", description: "Qué cambiaste, en una oración corta, en voseo. Por ejemplo: \"Acorté el medio y dejé el gancho\"." },
  },
  required: ["texto", "hashtags", "cta", "cambios"],
  additionalProperties: false,
} as const;

export function editSystemPrompt() {
  return `Sos editor de textos publicitarios de pequeñas empresas y emprendimientos de Argentina. Te pasan una pieza ya escrita y un pedido, y devolvés la pieza editada.

Reglas:
- Hacé lo que pide el pedido y nada más: lo que no hace falta cambiar, queda igual.
- Español rioplatense natural, con voseo.
- Usá solo lo que dice la pieza, los datos de la marca y el pedido. Nunca inventes precios, descuentos, porcentajes, plazos, cuotas, premios, cantidades, testimonios ni datos de contacto.
- Respetá el tono de la marca y no uses ninguna de sus palabras prohibidas.
- Mantené la estructura del formato (placas, escenas, líneas de anuncio o asunto del email) y el límite de caracteres del canal.
- Prohibido: "potenciá", "llevá tu negocio al siguiente nivel", "solución integral", "disruptivo", "revolucionario", "ecosistema".
- En LinkedIn y en emails, sin emojis.
- Si el pedido pide algo que no se puede sin inventar datos, editá lo que sí se puede y contalo en "cambios".`;
}

export function editUserPrompt(brand: BrandCtx, piece: EditPiece, instruction: string) {
  const rule = CHANNEL_RULES[piece.channel];
  const format = piece.format === "Mensaje" && piece.channel === "Email" ? "Email" : piece.format;
  const marca = {
    nombre: brand.name, rubro: brand.industry, que_hace: brand.description, por_que_elegirla: brand.value_prop,
    productos_o_servicios: brand.products, tono: brand.tone.join(", ") || "Cercano", palabras_prohibidas: brand.words_avoid,
    llamado_a_la_accion: ctaFor(brand, piece), hashtags_de_la_marca: brand.hashtags,
  };
  const hashtagRule = rule.maxHashtags === 0 || piece.format === "Anuncio" ? "Sin hashtags (devolvé la lista vacía)." : `Hasta ${rule.maxHashtags} hashtags; si el pedido no habla de hashtags, devolvé los mismos.`;
  return `Marca (JSON):
${JSON.stringify(marca, null, 2)}

Pieza:
- Canal: ${piece.channel}
- Formato: ${formatLabel(piece.format, piece.channel)}. ${FORMAT_GUIDE[format]}
- Objetivo: ${piece.goal}
- Límite del canal: ${rule.maxChars} caracteres en total. ${hashtagRule}

Texto actual:
"""
${piece.body}
"""
Hashtags actuales: ${piece.hashtags || "ninguno"}
Llamado a la acción actual: ${piece.cta || "ninguno"}

Pedido: ${instruction}`;
}

export async function editWithClaude(brand: BrandCtx, piece: EditPiece, instruction: string, client = new Anthropic()): Promise<{ copy: EditCopy; summary: string }> {
  const res = await client.beta.messages.create(
    {
      model: AI_MODEL,
      max_tokens: 6000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: editSystemPrompt(),
      messages: [{ role: "user", content: editUserPrompt(brand, piece, instruction) }],
    },
    { signal: AbortSignal.timeout(AI_TIMEOUT_MS), maxRetries: 0 },
  );
  if (res.stop_reason === "refusal") throw new AiUnavailable("la IA no respondió (refusal)");
  if (res.stop_reason === "max_tokens") throw new AiUnavailable("respuesta cortada");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return parseEdit(text, piece, editSource(piece, brand, instruction));
  } catch (e) {
    if (e instanceof EditRejected) throw new AiUnavailable(e.message);
    throw e;
  }
}
