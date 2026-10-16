// Editar una pieza con IA: los pedidos rápidos, el camino por reglas (sin clave o sin cupo) y el control de lo que
// devuelve la IA. La IA reescribe el texto que ya está, no inventa datos: lo que traiga un precio, porcentaje o cuota
// que no estaba en la pieza, en la marca ni en el pedido se descarta.
import { CHANNEL_RULES, normalizeHashtags, unbackedNumbers, type Channel, type Format, type Goal } from "./channels";
import { ctaFor, usesEmoji, type BrandCtx } from "./generator";

export type EditCopy = { body: string; hashtags: string; cta: string };
export type EditPiece = EditCopy & { channel: Channel; format: Format; goal: Goal };

export const EDIT_ACTIONS = [
  { id: "corto", label: "Más corto", prompt: "Hacelo más corto: sacá lo que sobra y quedate con lo importante. Mantené el gancho y el llamado a la acción." },
  { id: "vendedor", label: "Más vendedor", prompt: "Hacelo más vendedor: que el beneficio se entienda en la primera línea y el llamado a la acción invite a escribir o comprar ya, sin exagerar ni inventar ofertas." },
  { id: "cercano", label: "Más cercano", prompt: "Hacelo más cercano y cálido, como le hablaría el dueño a un cliente de siempre." },
  { id: "formal", label: "Más formal", prompt: "Hacelo más formal y profesional, sin perder el voseo." },
  { id: "gancho", label: "Mejor gancho", prompt: "Reescribí la primera línea para que frene el scroll. El resto cambialo solo si hace falta para que siga bien." },
  { id: "cta", label: "Reforzar el llamado", prompt: "Reforzá el llamado a la acción del final: que sea concreto y diga qué hacer." },
  { id: "emojis", label: "Sumar emojis", prompt: "Sumá emojis con criterio: como mucho 3, donde ayuden a leer." },
  { id: "sin-emojis", label: "Sacar emojis", prompt: "Sacá todos los emojis sin cambiar nada más." },
  { id: "corregir", label: "Corregir", prompt: "Corregí ortografía, puntuación y espacios sin cambiar lo que dice." },
] as const;

export type EditActionId = (typeof EDIT_ACTIONS)[number]["id"];

export const EDIT_MAX_INSTRUCTION = 300;

// Lo que se le pide a la IA: un pedido rápido o lo que escribió la persona. Devuelve la etiqueta para el historial.
export function editInstruction(action: string, free: string): { prompt: string; label: string; action: EditActionId | null } | null {
  const quick = EDIT_ACTIONS.find((a) => a.id === action);
  if (quick) return { prompt: quick.prompt, label: quick.label, action: quick.id };
  const text = free.trim().replace(/\s+/g, " ").slice(0, EDIT_MAX_INSTRUCTION);
  return text ? { prompt: text, label: text, action: null } : null;
}

// ---------- camino por reglas ----------

// Emojis y pictogramas (con sus modificadores), no letras ni números.
const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic})|[\u{1F3FB}-\u{1F3FF}])*/gu;
const CTA_RE = /whats|escrib|ped[ií]|reserv|compr|sac[aá] turno|link|respond|consult|contanos|guardalo|agend/i;
// Líneas con estructura ("Placa 1:", "Texto principal:", "0-3 s · ...", "Asunto:"): se recortan sin perder la etiqueta.
const LABEL_RE = /^((?:Placa \d+|Texto(?: principal| del posteo)?|Título|Descripción|Botón|Asunto|Sticker|Cierre|\d+-\d+ s · [^:]+)\s*:\s*)(.*)$/i;

const GOAL_EMOJI: Record<Goal, string> = { Vender: "✨", "Conseguir consultas": "💬", Lanzamiento: "🚀", Promoción: "🔥", Comunidad: "🙌", Educar: "💡" };

export function stripEmojis(text: string) {
  return text.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+|[ \t]+$/gm, "");
}

export function countEmojis(text: string) {
  return (text.match(EMOJI) ?? []).length;
}

function firstSentence(s: string) {
  const m = s.match(/^.+?[.!?…](?=\s|$)/);
  return (m ? m[0] : s).trim();
}

// Acorta: deja el gancho y el llamado a la acción; del medio, la primera oración de cada párrafo y como mucho dos párrafos.
export function shorten(body: string, cta: string): string {
  const lines = body.split("\n");
  const nonEmpty = lines.map((l, i) => ({ l, i })).filter((x) => x.l.trim());
  if (nonEmpty.length === 0) return body;
  if (lines.some((l) => LABEL_RE.test(l.trim()))) {
    return lines.map((l) => {
      const m = l.trim().match(LABEL_RE);
      return m ? m[1] + firstSentence(m[2]) : l;
    }).join("\n");
  }
  const first = nonEmpty[0].i;
  const ctaLow = cta.trim().toLowerCase();
  const isCta = (l: string) => (ctaLow && l.toLowerCase().includes(ctaLow.slice(0, 20))) || CTA_RE.test(l);
  const last = [...nonEmpty].reverse().find((x) => x.i !== first && isCta(x.l))?.i ?? -1;
  let kept = 0;
  const out: string[] = [];
  lines.forEach((l, i) => {
    if (!l.trim()) { if (out.length && out[out.length - 1] !== "") out.push(""); return; }
    if (i === first || i === last) { out.push(l); return; }
    if (i > last && last !== -1) return; // lo que queda después del llamado (la ciudad, una firma corta) sobra
    if (kept >= 2) return;
    kept++;
    out.push(firstSentence(l));
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function tidy(text: string) {
  return text
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?=[^\s\d/])/g, "$1 ")
    .replace(/([.!?])(?=[A-ZÁÉÍÓÚÑ¿¡])/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(^|[.!?…]\s+|\n)([a-záéíóúñ])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\.{4,}/g, "...")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n").map((l) => l.trimEnd()).join("\n")
    .trim();
}

export type RuleEdit = { ok: true; copy: EditCopy; summary: string } | { ok: false; error: string };

// Lo que se puede hacer sin IA. Lo demás (más vendedor, más cercano, un pedido libre) necesita la IA.
export function ruleEdit(piece: EditPiece, action: EditActionId | null, brand: Pick<BrandCtx, "tone" | "cta">): RuleEdit {
  const { body, hashtags, cta } = piece;
  const same = (summary: string, next: string, nextCta = cta): RuleEdit =>
    next.trim() === body.trim() && nextCta === cta ? { ok: false, error: summary } : { ok: true, copy: { body: next, hashtags, cta: nextCta }, summary: "" };
  switch (action) {
    case "corto": {
      const r = same("Ya está corto: no hay nada para sacar sin perder el gancho o el llamado a la acción.", shorten(body, cta));
      return r.ok ? { ...r, summary: "Dejé el gancho, lo principal y el llamado a la acción." } : r;
    }
    case "sin-emojis": {
      const r = same("No tiene emojis para sacar.", stripEmojis(body).replace(/\n{3,}/g, "\n\n").trim(), stripEmojis(cta).trim());
      return r.ok ? { ...r, summary: "Saqué los emojis." } : r;
    }
    case "emojis": {
      if (!CHANNEL_RULES[piece.channel].emojis) return { ok: false, error: `En ${piece.channel} conviene no usar emojis.` };
      if (countEmojis(body) >= 2) return { ok: false, error: "Ya tiene emojis: más le restan claridad." };
      const lines = body.split("\n");
      const i = lines.findIndex((l) => l.trim() && !LABEL_RE.test(l.trim()));
      if (i === -1) return { ok: false, error: "Es una pieza con estructura (placas, escenas o anuncio): los emojis van mejor en la imagen." };
      lines[i] = `${lines[i].trimEnd()} ${GOAL_EMOJI[piece.goal]}`;
      const ci = lines.map((l, n) => ({ l, n })).reverse().find((x) => x.n !== i && x.l.trim() && CTA_RE.test(x.l) && !LABEL_RE.test(x.l.trim()))?.n;
      if (ci !== undefined && !/^\p{Extended_Pictographic}/u.test(lines[ci].trim())) lines[ci] = `👉 ${lines[ci].trim()}`;
      return { ok: true, copy: { body: lines.join("\n"), hashtags, cta }, summary: "Sumé un emoji en el gancho y otro en el llamado a la acción." };
    }
    case "cta": {
      const want = ctaFor(brand, piece).replace(/[.!]$/, "");
      if (body.toLowerCase().includes(want.toLowerCase())) return { ok: false, error: "El llamado a la acción de la marca ya está en el texto. Para reescribirlo hace falta la IA." };
      const emoji = usesEmoji(brand, piece.channel) && countEmojis(body) > 0 ? "👉 " : "";
      return { ok: true, copy: { body: `${body.trimEnd()}\n\n${emoji}${want}.`, hashtags, cta: want }, summary: "Sumé al final el llamado a la acción de la marca." };
    }
    case "corregir": {
      const r = same("No encontré nada para corregir con las reglas. La IA revisa también la ortografía.", tidy(body));
      return r.ok ? { ...r, summary: "Ordené espacios, puntuación y mayúsculas." } : r;
    }
    default:
      return { ok: false, error: "Esto lo hace la IA, y ahora no está disponible. Sin IA podés usar Más corto, Reforzar el llamado, Sumar o Sacar emojis y Corregir." };
  }
}

// ---------- control de lo que devuelve la IA ----------

export class EditRejected extends Error {}

type Raw = { texto?: unknown; hashtags?: unknown; cta?: unknown; cambios?: unknown };

// Valida la respuesta. `source` es todo lo que la IA puede usar: la pieza, la marca y el pedido.
export function parseEdit(json: string, piece: EditPiece, source: string): { copy: EditCopy; summary: string } {
  let raw: Raw;
  try {
    raw = JSON.parse(json) as Raw;
  } catch {
    throw new EditRejected("la IA no devolvió JSON");
  }
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const body = s(raw.texto, 4000);
  if (!body) throw new EditRejected("la IA no devolvió texto");
  const nums = unbackedNumbers(body, source);
  if (nums.length) throw new EditRejected(`la IA agregó ${nums.join(", ")}, que no estaba en la pieza`);
  const max = piece.format === "Anuncio" ? 0 : CHANNEL_RULES[piece.channel].maxHashtags;
  const tags = Array.isArray(raw.hashtags) ? raw.hashtags.filter((h): h is string => typeof h === "string") : [];
  return {
    copy: { body, hashtags: max ? normalizeHashtags(tags, max) : "", cta: s(raw.cta, 200) || piece.cta },
    summary: s(raw.cambios, 200),
  };
}

// Todo lo que puede aparecer en el texto editado sin ser inventado.
export function editSource(piece: EditCopy, brand: Pick<BrandCtx, "name" | "description" | "value_prop" | "products" | "cta">, instruction: string) {
  return [piece.body, piece.hashtags, piece.cta, brand.name, brand.description, brand.value_prop, brand.products, brand.cta, instruction].join(" ");
}
