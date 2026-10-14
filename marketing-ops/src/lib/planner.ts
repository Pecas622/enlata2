// Plan del mes completo: cada fecha con horario sugerido, red, formato, objetivo, tema, gancho, estructura, texto,
// llamado a la acción, recursos y por qué se propone. Acá vive la parte pura: los tipos, el plan por reglas (para
// cuando no hay IA o la IA falla) y el control de lo que devuelve la IA. Las fechas salen siempre de suggestPlan,
// así el plan respeta la frecuencia de la marca, los días ocupados y las fechas comerciales.
import { longDate, monthLabel, suggestPlan, type Day, type Month, type PlanItem, type Scheduled } from "./calendar";
import { CHANNELS, CHANNEL_RULES, GOALS, checkCopy, formatLabel, isValidCombo, normalizeHashtags, unbackedNumbers, type Channel, type Format, type Goal } from "./channels";
import { generateVariants, sourceText, type BrandCtx } from "./generator";
import { inventsOffer } from "./research";

export type PlanBrand = BrandCtx & {
  goals: string;
  channels: Channel[];
  posts_per_week: number;
  ad_budget: number;
  market: string;
  visual_style: string;
};

export type PlanPiece = {
  publish_on: Day;
  post_time: string; // "HH:MM", sugerido
  channel: Channel;
  format: Format;
  goal: Goal;
  topic: string;
  title: string;
  hook: string;
  structure: string;
  body: string;
  hashtags: string;
  cta: string;
  resources: string;
  rationale: string;
  content_id?: string;
};

export type Plan = { summary: string; items: PlanPiece[] };

// ---------- Horario, estructura y recursos ----------

// Horarios de referencia para Argentina. Son un punto de partida: con resultados cargados, conviene ajustarlos.
export function suggestedTime(channel: Channel, format: Format, day: Day): string {
  const weekend = [0, 6].includes(new Date(day + "T12:00:00Z").getUTCDay());
  switch (channel) {
    case "Instagram":
    case "Facebook":
      if (format === "Historia") return "10:00";
      if (format === "Reel") return weekend ? "12:00" : "19:30";
      return weekend ? "11:00" : "13:00";
    case "TikTok": return weekend ? "13:00" : "20:00";
    case "LinkedIn": return "09:00";
    case "WhatsApp": return weekend ? "11:00" : "10:30";
    case "Email": return "09:30";
  }
}

const STRUCTURE: Record<string, string> = {
  Post: "1. Primera línea que frene el scroll.\n2. Uno o dos párrafos cortos con el dato o la historia.\n3. Llamado a la acción al final.",
  Carrusel: "Placa 1: el gancho, en pocas palabras.\nPlacas 2 a 4: un punto por placa.\nÚltima placa: qué hacer ahora (llamado a la acción).\nTexto del posteo: resume y repite el llamado.",
  Reel: "0-3 s: el gancho, hablado o en texto en pantalla.\n3-20 s: mostrar el producto o el proceso con planos cortos.\nÚltimos segundos: la marca y el llamado a la acción.",
  Historia: "Una pantalla con una frase corta, un sticker para que respondan y un cierre que lleve al mensaje o al link.",
  Anuncio: "Texto principal corto, título, descripción y botón. La imagen o el video cuentan lo mismo que el texto.",
  Mensaje: "Saludo que diga quién escribe, el motivo en dos o tres líneas y cómo responder.",
  Email: "Asunto corto, saludo, dos o tres párrafos y un único llamado a la acción con la firma.",
};

const RESOURCES: Record<string, string> = {
  Post: "Una foto o placa vertical 1080 × 1350 (4:5).",
  Carrusel: "De 4 a 7 placas 1080 × 1350 (4:5) con la misma tipografía y colores.",
  Reel: "Video vertical 9:16 de 15 a 30 segundos, grabado con el celular. Texto en pantalla grande y legible.",
  Historia: "Foto o video vertical 1080 × 1920 (9:16) y un sticker.",
  Anuncio: "Imagen 1080 × 1350 o video vertical corto, sin mucho texto encima.",
  Mensaje: "Solo texto. Si suma, una foto del producto.",
  Email: "Una imagen de cabecera opcional y el link a donde tiene que ir la persona.",
};

const group = (format: Format, channel: Channel) => (format === "Mensaje" && channel === "Email" ? "Email" : format);
export const structureFor = (format: Format, channel: Channel) => STRUCTURE[group(format, channel)];

export function resourcesFor(format: Format, channel: Channel, visualStyle = "") {
  const base = RESOURCES[group(format, channel)];
  return visualStyle.trim() ? `${base} Estilo de la marca: ${visualStyle.trim().replace(/[.]$/, "")}.` : base;
}

// La primera frase de la pieza, sin las etiquetas del formato ("Placa 1:", "0-3 s · Gancho:", "Asunto:").
export function hookOf(body: string) {
  const first = body.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return first.replace(/^(Placa 1|Texto principal|Texto|Asunto|\d+-\d+ s · Gancho)\s*:\s*/i, "").replace(/^Hola! Te escribimos de [^.]+\.\s*/, "").slice(0, 300);
}

const PURPOSE: Record<Goal, string> = {
  Vender: "empuja la venta de lo que más sale",
  "Conseguir consultas": "invita a escribir y trae consultas",
  Lanzamiento: "presenta una novedad",
  Promoción: "aprovecha la fecha para una acción comercial",
  Comunidad: "acerca la marca a su gente y suma interacción",
  Educar: "posiciona a la marca como la que sabe y se guarda",
};

// ---------- Plan por reglas ----------

export const clampPerWeek = (n: number) => Math.min(7, Math.max(1, Math.round(Number(n) || 3)));
export const brandChannels = (b: Pick<PlanBrand, "channels">): Channel[] => {
  const ok = (b.channels ?? []).filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c));
  return ok.length ? ok : ["Instagram"];
};

// Las fechas del plan: las mismas que el plan del calendario (frecuencia, días libres, fechas comerciales).
export function planSlots(brand: PlanBrand, month: Month, existing: Scheduled[], today: Day): PlanItem[] {
  return suggestPlan(brand, month, existing, { perWeek: clampPerWeek(brand.posts_per_week), channels: brandChannels(brand), today });
}

// Desarrolla una fecha con las plantillas del generador.
export function rulePiece(brand: PlanBrand, slot: PlanItem, seed = 0): PlanPiece {
  const v = generateVariants(brand, { channel: slot.channel, format: slot.format, goal: slot.goal, topic: slot.topic }, seed)[0];
  return {
    publish_on: slot.publish_on, post_time: suggestedTime(slot.channel, slot.format, slot.publish_on),
    channel: slot.channel, format: slot.format, goal: slot.goal, topic: slot.topic, title: v.title,
    hook: hookOf(v.body), structure: structureFor(slot.format, slot.channel), body: v.body, hashtags: v.hashtags, cta: v.cta,
    resources: resourcesFor(slot.format, slot.channel, brand.visual_style),
    rationale: `${slot.reason}. Esta pieza ${PURPOSE[slot.goal]}.`,
  };
}

export function planSummary(brand: Pick<PlanBrand, "name">, month: Month, items: Pick<PlanPiece, "goal" | "channel">[]) {
  if (!items.length) return "";
  const count = (g: Goal[]) => items.filter((i) => g.includes(i.goal)).length;
  const sell = count(["Vender", "Promoción", "Lanzamiento"]);
  const talk = count(["Comunidad", "Conseguir consultas"]);
  const teach = count(["Educar"]);
  const nets = [...new Set(items.map((i) => i.channel))];
  return `${items.length} ${items.length === 1 ? "pieza" : "piezas"} para ${brand.name} en ${monthLabel(month)}, en ${nets.join(", ")}: ${sell} para vender, ${talk} para conversar con la gente y ${teach} para enseñar. Las fechas comerciales van unos días antes y el resto reparte la semana para no dejar huecos.`;
}

export function rulePlan(brand: PlanBrand, month: Month, existing: Scheduled[], today: Day): Plan {
  const items = planSlots(brand, month, existing, today).map((s, i) => rulePiece(brand, s, i));
  return { summary: planSummary(brand, month, items), items };
}

// ---------- Control de lo que devuelve la IA ----------

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type Strategy = { summary: string; slots: (PlanItem & { reason: string })[] };
type RawStrategy = { resumen?: unknown; piezas?: unknown };

// Fase 1: qué va en cada fecha. Solo se aceptan las fechas que se le dieron (una pieza por fecha), redes de la
// marca, formatos que existen en esa red y temas sin precios ni números inventados. Una fecha que la IA no usó
// o que vino mal queda con la propuesta por reglas.
export function parseStrategy(json: unknown, slots: PlanItem[], channels: Channel[], allowed: Set<number>): Strategy & { fixed: number } {
  const raw = (json && typeof json === "object" ? json : {}) as RawStrategy;
  const byDay = new Map<string, Record<string, unknown>>();
  for (const p of Array.isArray(raw.piezas) ? raw.piezas : []) {
    if (p && typeof p === "object" && typeof (p as { fecha?: unknown }).fecha === "string") {
      const d = (p as { fecha: string }).fecha;
      if (!byDay.has(d)) byDay.set(d, p as Record<string, unknown>);
    }
  }
  let fixed = 0;
  const out = slots.map((slot) => {
    const p = byDay.get(slot.publish_on);
    if (!p) return (fixed++, slot);
    let channel = channels.includes(p.red as Channel) ? (p.red as Channel) : slot.channel;
    let format = isValidCombo(channel, p.formato as Format) && p.formato !== "Anuncio" ? (p.formato as Format) : slot.format;
    if (!isValidCombo(channel, format)) { channel = slot.channel; format = slot.format; }
    const goal = (GOALS as readonly string[]).includes(String(p.objetivo)) ? (p.objetivo as Goal) : slot.goal;
    const topic = str(p.tema, 200);
    const reason = str(p.por_que, 400);
    if (!topic || inventsOffer(`${topic} ${reason}`, allowed)) return (fixed++, slot);
    return { ...slot, channel, format, goal, topic, reason: reason || slot.reason };
  });
  return { summary: str(raw.resumen, 800), slots: out, fixed };
}

type RawPiece = { fecha?: unknown; titulo?: unknown; gancho?: unknown; estructura?: unknown; texto?: unknown; hashtags?: unknown; cta?: unknown; recursos?: unknown; horario?: unknown };

// Fase 2: el desarrollo de cada fecha. Si una pieza no vino, vino vacía, se pasa del largo de la red o trae
// precios o números que no están en la marca, esa fecha se escribe con las plantillas.
export function parsePieces(json: unknown, slots: (PlanItem & { reason: string })[], brand: PlanBrand): { items: PlanPiece[]; fixed: number } {
  const raw = (json && typeof json === "object" ? json : {}) as { piezas?: unknown };
  const byDay = new Map<string, RawPiece>();
  for (const p of Array.isArray(raw.piezas) ? raw.piezas : []) {
    if (p && typeof p === "object" && typeof (p as RawPiece).fecha === "string" && !byDay.has((p as { fecha: string }).fecha)) byDay.set((p as { fecha: string }).fecha, p as RawPiece);
  }
  let fixed = 0;
  const items = slots.map((slot, i) => {
    const fallback = { ...rulePiece(brand, slot, i), rationale: slot.reason };
    const p = byDay.get(slot.publish_on);
    const body = str(p?.texto, 4000);
    if (!p || !body) return (fixed++, fallback);
    const max = slot.format === "Anuncio" ? 0 : CHANNEL_RULES[slot.channel].maxHashtags;
    const tags = Array.isArray(p.hashtags) ? p.hashtags.filter((h): h is string => typeof h === "string") : [];
    const piece: PlanPiece = {
      publish_on: slot.publish_on,
      post_time: TIME.test(str(p.horario, 5)) ? str(p.horario, 5) : fallback.post_time,
      channel: slot.channel, format: slot.format, goal: slot.goal, topic: slot.topic,
      title: str(p.titulo, 80) || hookOf(body).slice(0, 60),
      hook: str(p.gancho, 300) || hookOf(body),
      structure: str(p.estructura, 3000) || fallback.structure,
      body, hashtags: max ? normalizeHashtags(tags, max) : "", cta: str(p.cta, 160) || fallback.cta,
      resources: str(p.recursos, 500) || fallback.resources,
      rationale: slot.reason,
    };
    const source = sourceText(brand, { channel: slot.channel, format: slot.format, goal: slot.goal, topic: slot.topic });
    const warnings = checkCopy(piece, slot.channel, slot.format, brand, source);
    const bad = warnings.some((w) => /caracteres y|Revisá .*no estaba|palabras que la marca evita/.test(w));
    if (bad || unbackedNumbers(`${piece.hook} ${piece.structure}`, source).length) return (fixed++, fallback);
    return piece;
  });
  return { items, fixed };
}

// Lo que se le pasa a la IA sobre cada fecha.
export const slotLine = (s: PlanItem) => ({
  fecha: s.publish_on, dia: longDate(s.publish_on), red_sugerida: s.channel, formato_sugerido: formatLabel(s.format, s.channel), objetivo_sugerido: s.goal,
  tema_sugerido: s.topic, motivo: s.reason,
});
