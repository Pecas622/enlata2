// Investigación de la marca: qué se habla del rubro, qué publica la competencia e ideas para publicar.
// Acá vive la parte pura: los tipos, el control de lo que devuelve la IA (cada punto con fuentes que la búsqueda
// encontró de verdad, ideas sin precios ni datos inventados) y las ideas por reglas para cuando no hay IA.
import { addDays, commercialDates, shortDate, type Day } from "./calendar";
import { GOALS, isValidCombo, CHANNELS, FORMATS, type Channel, type Format, type Goal } from "./channels";
import type { BrandCtx } from "./generator";
import { allowedNumbers, inventedNumbers } from "./insights-ai";

export type Source = { url: string; title: string };
export type Finding = { title: string; detail: string; sources: string[] };
export type Competitor = { name: string; detail: string; sources: string[] };
export type ResearchIdea = { topic: string; why: string; channel: Channel; format: Format; goal: Goal; sources: string[]; content_id?: string };
export type Research = { summary: string; trends: Finding[]; competitors: Competitor[]; ideas: ResearchIdea[]; sources: Source[] };

export class ResearchUnusable extends Error {}

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");

// Saca el JSON de la respuesta: puede venir en un bloque ```json, con texto antes ("Voy a buscar...") o pelado.
export function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]).reverse();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  const candidates = [...fenced, first >= 0 && last > first ? text.slice(first, last + 1) : ""];
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (v && typeof v === "object") return v;
    } catch {
      // probar el siguiente
    }
  }
  throw new ResearchUnusable("la IA no devolvió JSON");
}

// Normaliza una URL para comparar: sin barra final, sin #, sin utm.
export function normUrl(u: string) {
  try {
    const url = new URL(u.trim());
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) if (k.startsWith("utm_")) url.searchParams.delete(k);
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

// Precios, porcentajes, "2x1" y cuotas solo los puede poner la marca: una idea que los trae se descarta.
const OFFER = /\d\s*%|\$\s*\d|\b\d+\s*x\s*\d+\b|\b\d+\s*cuotas\b|\boff\b/i;
export function inventsOffer(text: string, allowed: Set<number>) {
  return OFFER.test(text) || inventedNumbers(text, allowed).length > 0;
}

type RawItem = Record<string, unknown>;
type Raw = { resumen?: unknown; tendencias?: unknown; competencia?: unknown; ideas?: unknown };

// Valida lo que devolvió la IA contra lo que encontró la búsqueda. Una tendencia o un competidor sin al menos una
// fuente real se descarta (no hay forma de saber de dónde salió). Una idea con números que no están ni en la marca
// ni en lo investigado (precios, descuentos, cuotas) también.
export function parseResearch(text: string, found: Source[], brand: BrandCtx): Research & { dropped: number } {
  const raw = extractJson(text) as Raw;
  const known = new Map(found.map((f) => [normUrl(f.url), f] as const).filter(([k]) => k));
  let dropped = 0;
  const srcs = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map((u) => normUrl(String(u))).filter((u) => known.has(u)))].slice(0, 4);
  const list = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is RawItem => Boolean(x) && typeof x === "object");

  const trends = list(raw.tendencias)
    .map((t) => ({ title: s(t.titulo, 120), detail: s(t.detalle, 500), sources: srcs(t.fuentes) }))
    .filter((t) => (t.title && t.sources.length ? true : (dropped++, false)))
    .slice(0, 6);
  const competitors = list(raw.competencia)
    .map((c) => ({ name: s(c.nombre, 80), detail: s(c.que_publica, 500), sources: srcs(c.fuentes) }))
    .filter((c) => (c.name && c.detail && c.sources.length ? true : (dropped++, false)))
    .slice(0, 6);

  const allowed = allowedNumbers([brand, trends, competitors]);
  const ideas = list(raw.ideas)
    .map((i): ResearchIdea => {
      let channel = (CHANNELS as readonly string[]).includes(String(i.red)) ? (i.red as Channel) : "Instagram";
      let format = (FORMATS as readonly string[]).includes(String(i.formato)) ? (i.formato as Format) : "Post";
      if (!isValidCombo(channel, format)) {
        channel = "Instagram";
        format = isValidCombo("Instagram", format) ? format : "Post";
      }
      const goal = (GOALS as readonly string[]).includes(String(i.objetivo)) ? (i.objetivo as Goal) : "Comunidad";
      return { topic: s(i.tema, 200), why: s(i.por_que, 400), channel, format, goal, sources: srcs(i.fuentes) };
    })
    .filter((i) => (i.topic && !inventsOffer(`${i.topic} ${i.why}`, allowed) ? true : (dropped++, false)))
    .slice(0, 6);

  if (!trends.length && !competitors.length && !ideas.length) throw new ResearchUnusable("la investigación no trajo puntos con fuentes");
  // Solo se guardan las fuentes que se usan.
  const used = new Set([...trends, ...competitors, ...ideas].flatMap((x) => x.sources));
  const sources = [...used].map((u) => ({ url: u, title: s(known.get(u)?.title, 160) || new URL(u).hostname }));
  return { summary: s(raw.resumen, 800), trends, competitors, ideas, sources, dropped };
}

// ---------- Sin IA ----------

export type RuleIdea = { topic: string; why: string; channel: Channel; format: Format; goal: Goal };

const products = (b: Pick<BrandCtx, "products">) => b.products.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);

// Ideas que no necesitan internet: las fechas comerciales de las próximas semanas y ángulos que suelen funcionar
// con lo que vende la marca. No reemplazan la investigación: la pantalla avisa que no salen de buscar en internet.
export function ruleIdeas(brand: Pick<BrandCtx, "name" | "products">, today: Day, days = 45): RuleIdea[] {
  const until = addDays(today, days);
  const year = Number(today.slice(0, 4));
  const dates = [...commercialDates(year), ...commercialDates(year + 1)].filter((d) => d.day >= today && d.day <= until).slice(0, 3);
  const out: RuleIdea[] = dates.map((d) => ({
    topic: d.topic.replace("{marca}", brand.name),
    why: `${d.name} es el ${shortDate(d.day)}${d.lead ? `: conviene publicar unos ${d.lead} días antes` : ""}.`,
    channel: "Instagram", format: d.goal === "Promoción" ? "Reel" : "Post", goal: d.goal,
  }));
  const p = products(brand);
  const main = p[0] ?? brand.name;
  const second = p[1] ?? main;
  out.push(
    { topic: `Las preguntas que más nos hacen sobre ${main.toLowerCase()}`, why: "Responder dudas reales trae consultas y se guarda.", channel: "Instagram", format: "Carrusel", goal: "Conseguir consultas" },
    { topic: `Cómo se hace: ${second.toLowerCase()} detrás de escena`, why: "Mostrar el proceso genera confianza y suele enganchar más que una foto de producto.", channel: "Instagram", format: "Reel", goal: "Comunidad" },
    { topic: `Qué tener en cuenta antes de elegir ${main.toLowerCase()}`, why: "Una guía corta posiciona a la marca como la que sabe del tema.", channel: "Instagram", format: "Carrusel", goal: "Educar" },
  );
  return out.slice(0, 6);
}
