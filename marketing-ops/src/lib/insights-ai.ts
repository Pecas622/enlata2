// Análisis de resultados con IA (Claude). Corre solo en el servidor. Recibe los resultados ya calculados y devuelve
// qué funcionó, qué no y qué repetir. Nunca puede inventar números: toda cifra de la respuesta tiene que estar en los
// datos que se le pasaron (o ser un redondeo); lo que no cumple se descarta. Si no queda nada, vuelve al análisis por reglas.
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL, AI_TIMEOUT_MS, AiUnavailable } from "./generator-ai";
import { weekday } from "./calendar";
import { fmtPct, formatGroup, groupBy, rates, sum, delta, type Analysis, type Insight, type Period, type PieceResult } from "./metrics";

const DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const PUNTO = {
  type: "object",
  properties: { titulo: { type: "string" }, detalle: { type: "string" } },
  required: ["titulo", "detalle"],
  additionalProperties: false,
} as const;

const SCHEMA = {
  type: "object",
  properties: {
    resumen: { type: "string", description: "2 o 3 frases con el panorama del período." },
    funciono: { type: "array", items: PUNTO, description: "Hasta 4 cosas que funcionaron y por qué." },
    no_funciono: { type: "array", items: PUNTO, description: "Hasta 3 cosas que no funcionaron y por qué." },
    repetir: { type: "array", items: { type: "string" }, description: "Hasta 4 acciones concretas para el mes que viene." },
  },
  required: ["resumen", "funciono", "no_funciono", "repetir"],
  additionalProperties: false,
} as const;

export function systemPrompt() {
  return `Sos analista de marketing digital para pequeñas empresas y emprendimientos de Argentina. Leés los resultados de las publicaciones de un período y le explicás al dueño, en criollo, qué funcionó, qué no y qué conviene repetir el mes que viene.

Reglas:
- Español rioplatense, con voseo. Frases cortas. Nada de jerga: decí "personas alcanzadas", no "reach".
- Usá solo los números que vienen en los datos, tal cual o redondeados. No calcules números nuevos (ni promedios, ni "veces más", ni porcentajes que no estén).
- Cada punto dice qué pasó y una razón probable (formato, red, objetivo, tema, día de la semana u oferta). Si la razón es una suposición, decilo ("probablemente", "puede ser").
- Nombrá las piezas por su título entre comillas.
- Con pocas piezas, no saques conclusiones fuertes: avisalo.
- Las recomendaciones son acciones concretas para el mes que viene (qué formato, en qué red, con qué tema o qué cambiar), no consejos genéricos.`;
}

export function dataFor(rows: PieceResult[], prev: PieceResult[], period: Period) {
  const loaded = rows.filter((p) => p.results);
  const t = sum(loaded.map((p) => p.results));
  const before = sum(prev.map((p) => p.results));
  const group = (key: (p: PieceResult) => string) =>
    groupBy(loaded, key).map((g) => ({
      nombre: g.key, piezas: g.count, personas_alcanzadas: g.totals.reach, interacciones: g.totals.interactions, tasa_de_interaccion: fmtPct(g.engagement),
      consultas: g.totals.inquiries, consultas_cada_1000: g.per1000, ventas: g.totals.sales, inversion: g.totals.spend, costo_por_consulta: g.cpi,
    }));
  const dReach = delta(t.reach, before.reach);
  const dInq = delta(t.inquiries, before.inquiries);
  return {
    periodo: `${period.label} (${period.from} a ${period.to})`,
    totales: {
      piezas_publicadas: rows.length, piezas_con_resultados: loaded.length, personas_alcanzadas: t.reach, interacciones: t.interactions,
      tasa_de_interaccion: fmtPct(rates(t).engagement), clics: t.clicks, consultas: t.inquiries, ventas: t.sales, inversion: t.spend, costo_por_consulta: rates(t).cpi,
    },
    contra_el_periodo_anterior: {
      personas_alcanzadas_antes: before.reach, consultas_antes: before.inquiries,
      variacion_alcance: dReach === null ? "sin datos" : fmtPct(dReach) + (dReach >= 0 ? " más" : " menos"),
      variacion_consultas: dInq === null ? "sin datos" : fmtPct(dInq) + (dInq >= 0 ? " más" : " menos"),
    },
    por_formato: group(formatGroup),
    por_red: group((p) => p.channel),
    por_objetivo: group((p) => p.goal),
    piezas: loaded.map((p) => {
      const r = rates(p.results!);
      return {
        titulo: p.title, marca: p.brand, red: p.channel, formato: formatGroup(p), objetivo: p.goal, fecha: p.day, dia: DAYS[weekday(p.day)],
        en_campana: Boolean(p.campaign_id), personas_alcanzadas: p.results!.reach, interacciones: p.results!.interactions, tasa_de_interaccion: fmtPct(r.engagement),
        clics: p.results!.clicks, consultas: p.results!.inquiries, consultas_cada_1000: r.per1000, ventas: p.results!.sales, inversion: p.results!.spend, costo_por_consulta: r.cpi,
      };
    }),
    sin_resultados: rows.filter((p) => !p.results).map((p) => p.title),
  };
}

// ---------- control de números ----------

// "1.450" → 1450, "8,2" → 8.2, "22000" → 22000.
function toNumber(s: string) {
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export function numbersIn(text: string): number[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map(toNumber).filter((n) => Number.isFinite(n));
}

// Los números que la IA puede usar: los de los datos, con sus formas en pesos y porcentaje, y sus redondeos.
export function allowedNumbers(data: unknown): Set<number> {
  const out = new Set<number>();
  const add = (n: number) => {
    out.add(n);
    out.add(Math.round(n));
    out.add(Math.round(n * 10) / 10);
    if (n >= 1000) out.add(Math.round(n / 1000) * 1000); // "unos 22.000"
  };
  const walk = (v: unknown) => {
    if (typeof v === "number") add(v);
    else if (typeof v === "string") numbersIn(v).forEach(add);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(data);
  return out;
}

// Los números chicos (cantidad de piezas, días, "las 3 mejores") se permiten siempre.
export function inventedNumbers(text: string, allowed: Set<number>): number[] {
  return numbersIn(text).filter((n) => !(Number.isInteger(n) && n <= 31) && !allowed.has(n));
}

type Raw = { resumen?: unknown; funciono?: unknown; no_funciono?: unknown; repetir?: unknown };

export function parseAnalysis(json: string, allowed: Set<number>, missing: number): Analysis & { dropped: number } {
  let raw: Raw;
  try {
    raw = JSON.parse(json) as Raw;
  } catch {
    throw new AiUnavailable("la IA no devolvió JSON");
  }
  let dropped = 0;
  const ok = (text: string) => {
    if (inventedNumbers(text, allowed).length) {
      dropped++;
      return false;
    }
    return true;
  };
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const points = (v: unknown, max: number): Insight[] =>
    (Array.isArray(v) ? v : [])
      .map((p) => ({ title: s((p as { titulo?: unknown })?.titulo, 120), detail: s((p as { detalle?: unknown })?.detalle, 500) }))
      .filter((p) => p.title && ok(`${p.title} ${p.detail}`))
      .slice(0, max);
  const worked = points(raw.funciono, 4);
  const didnt = points(raw.no_funciono, 3);
  const next = (Array.isArray(raw.repetir) ? raw.repetir : []).map((x) => s(x, 300)).filter((x) => x && ok(x)).slice(0, 4);
  const summary = s(raw.resumen, 600);
  if (!worked.length && !didnt.length && !next.length) throw new AiUnavailable("la IA no devolvió puntos que se puedan usar");
  return { summary: summary && ok(summary) ? summary : "", worked, didnt, next, missing, dropped };
}

export async function analyzeWithClaude(rows: PieceResult[], prev: PieceResult[], period: Period, client = new Anthropic()): Promise<Analysis & { dropped: number }> {
  const data = dataFor(rows, prev, period);
  const res = await client.beta.messages.create(
    {
      model: AI_MODEL,
      max_tokens: 6000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: systemPrompt(),
      messages: [{ role: "user", content: `Resultados del período (JSON). Los montos están en pesos argentinos.\n${JSON.stringify(data, null, 2)}` }],
    },
    { signal: AbortSignal.timeout(AI_TIMEOUT_MS), maxRetries: 0 },
  );
  if (res.stop_reason === "refusal") throw new AiUnavailable("la IA no respondió (refusal)");
  if (res.stop_reason === "max_tokens") throw new AiUnavailable("respuesta cortada");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return parseAnalysis(text, allowedNumbers(data), data.sin_resultados.length);
}

