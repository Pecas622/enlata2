// Métricas: totales, tasas, comparación con el período anterior y el análisis de qué funcionó.
// Todo es puro. El análisis por reglas solo usa números que salen de los resultados cargados.
import type { Channel, Format, Goal } from "./channels";
import { fmtARS } from "./campaigns";
import { addDays, monthLabel, type Day, type Month } from "./calendar";

export type Results = { reach: number; interactions: number; clicks: number; inquiries: number; sales: number; spend: number };
export const EMPTY: Results = { reach: 0, interactions: 0, clicks: 0, inquiries: 0, sales: 0, spend: 0 };
export const RESULT_KEYS = ["reach", "interactions", "clicks", "inquiries", "sales", "spend"] as const;

export type PieceResult = {
  id: string;
  title: string;
  brand: string;
  channel: Channel;
  format: Format;
  goal: Goal;
  day: Day;
  campaign_id: string | null;
  results: Results | null;
};

// ---------- números ----------

const intFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
export const fmtInt = (n: number) => intFmt.format(n);

export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

// "8,2 %". Sin decimal cuando es redondo o pasa de 10.
export function fmtPct(r: number | null) {
  if (r === null) return "-";
  const v = r * 100;
  const one = Math.round(v * 10) / 10;
  const s = v >= 10 ? String(Math.round(v)) : Number.isInteger(one) ? String(one) : one.toFixed(1).replace(".", ",");
  return `${s} %`;
}

export function costPer(spend: number, n: number): number | null {
  return spend > 0 && n > 0 ? Math.round(spend / n) : null;
}

export function sum(rows: (Results | null)[]): Results {
  const out = { ...EMPTY };
  for (const r of rows) if (r) for (const k of RESULT_KEYS) out[k] += r[k];
  return out;
}

export type Rates = { engagement: number | null; per1000: number | null; cpi: number | null };
// Interacción sobre alcance, consultas cada 1.000 personas alcanzadas y costo por consulta.
export function rates(r: Results): Rates {
  const per = ratio(r.inquiries, r.reach);
  return { engagement: ratio(r.interactions, r.reach), per1000: per === null ? null : Math.round(per * 10000) / 10, cpi: costPer(r.spend, r.inquiries) };
}

// Variación contra el período anterior, en proporción (0,35 = subió 35 %). Null si antes no había nada.
export function delta(cur: number, prev: number): number | null {
  return prev > 0 ? (cur - prev) / prev : null;
}

// ---------- períodos ----------

export type Period = { from: Day; to: Day; label: string };

export function lastDays(today: Day, n = 30): Period {
  return { from: addDays(today, -(n - 1)), to: today, label: `Últimos ${n} días` };
}

export function monthPeriod(month: Month): Period {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, label: monthLabel(month) };
}

// El período anterior, del mismo largo y pegado al actual.
export function previousPeriod(p: Period): Period {
  const days = Math.round((Date.parse(p.to + "T12:00:00Z") - Date.parse(p.from + "T12:00:00Z")) / 86_400_000) + 1;
  return { from: addDays(p.from, -days), to: addDays(p.from, -1), label: "período anterior" };
}

export const inPeriod = (day: Day, p: Period) => day >= p.from && day <= p.to;

// ---------- agrupar ----------

const FORMAT_PLURAL: Record<string, string> = { Post: "Posts", Carrusel: "Carruseles", Reel: "Reels", Historia: "Historias", Anuncio: "Anuncios", Mensaje: "Mensajes", Email: "Emails" };
export const formatGroup = (p: Pick<PieceResult, "format" | "channel">) => (p.format === "Mensaje" && p.channel === "Email" ? "Email" : p.format);
export const plural = (format: string) => FORMAT_PLURAL[format] ?? format;

export type Group = { key: string; count: number; totals: Results } & Rates;

export function groupBy(rows: PieceResult[], key: (p: PieceResult) => string): Group[] {
  const map = new Map<string, PieceResult[]>();
  for (const p of rows) if (p.results) map.set(key(p), [...(map.get(key(p)) ?? []), p]);
  return [...map.entries()]
    .map(([k, ps]) => {
      const totals = sum(ps.map((p) => p.results));
      return { key: k, count: ps.length, totals, ...rates(totals) };
    })
    .sort((a, b) => (b.engagement ?? -1) - (a.engagement ?? -1) || b.totals.reach - a.totals.reach);
}

// ---------- análisis ----------

export type Insight = { title: string; detail: string };
export type Analysis = { summary: string; worked: Insight[]; didnt: Insight[]; next: string[]; missing: number };

const q = (s: string) => `“${s}”`;
const MIN_REACH = 200; // por debajo, una tasa alta es casualidad

// "subió 35 %". Un salto de más del triple se dice en palabras: con una base chica, el porcentaje confunde.
function change(d: number, plural = false) {
  if (d === 0) return plural ? "quedaron igual" : "quedó igual";
  if (Math.abs(d) > 3) return `${d > 0 ? (plural ? "crecieron" : "creció") : plural ? "cayeron" : "cayó"} mucho`;
  return `${d > 0 ? (plural ? "subieron" : "subió") : plural ? "bajaron" : "bajó"} ${fmtPct(Math.abs(d))}`;
}

export function analyze(rows: PieceResult[], prev: PieceResult[] = []): Analysis {
  const loaded = rows.filter((p) => p.results);
  const missing = rows.length - loaded.length;
  const worked: Insight[] = [];
  const didnt: Insight[] = [];
  const next: string[] = [];

  if (!loaded.length) {
    return {
      summary: rows.length ? "Todavía no hay resultados cargados en este período." : "En este período no hay piezas publicadas.",
      worked, didnt, missing,
      next: rows.length ? ["Cargá los resultados de las piezas publicadas desde cada pieza: con eso se arma el análisis."] : ["Publicá y cargá resultados para tener con qué comparar."],
    };
  }

  const t = sum(loaded.map((p) => p.results));
  const r = rates(t);
  const before = sum(prev.map((p) => p.results));
  const dReach = delta(t.reach, before.reach);
  const dInq = delta(t.inquiries, before.inquiries);
  let summary = `${loaded.length} ${loaded.length === 1 ? "pieza" : "piezas"} con resultados: ${fmtInt(t.reach)} personas alcanzadas, ${fmtInt(t.interactions)} interacciones (${fmtPct(r.engagement)}) y ${fmtInt(t.inquiries)} consultas.`;
  if (dReach !== null) summary += ` Contra el período anterior, el alcance ${change(dReach)}${dInq !== null ? ` y las consultas ${change(dInq, true)}` : ""}.`;

  // La pieza que más enganchó (con alcance suficiente para que la tasa diga algo).
  const engaging = loaded
    .filter((p) => p.results!.reach >= MIN_REACH && p.results!.interactions > 0)
    .sort((a, b) => ratio(b.results!.interactions, b.results!.reach)! - ratio(a.results!.interactions, a.results!.reach)!);
  const top = engaging[0];
  if (top) {
    const tr = top.results!;
    worked.push({
      title: `Lo que más enganchó: ${q(top.title)}`,
      detail: `${top.brand} · ${top.channel} ${formatGroup(top)}. ${fmtPct(ratio(tr.interactions, tr.reach))} de interacción: ${fmtInt(tr.interactions)} de ${fmtInt(tr.reach)} personas alcanzadas.`,
    });
  }

  // La que más consultas trajo, si no es la misma.
  const byInq = [...loaded].sort((a, b) => b.results!.inquiries - a.results!.inquiries || a.results!.spend - b.results!.spend)[0];
  if (byInq.results!.inquiries > 0 && byInq.id !== top?.id) {
    const br = byInq.results!;
    const cpi = costPer(br.spend, br.inquiries);
    worked.push({
      title: `Lo que más consultas trajo: ${q(byInq.title)}`,
      detail: `${byInq.brand} · ${byInq.channel} ${formatGroup(byInq)}. ${fmtInt(br.inquiries)} consultas${br.sales ? ` y ${fmtInt(br.sales)} ventas` : ""}${cpi ? `, a ${fmtARS(cpi)} cada consulta` : br.spend === 0 ? ", sin pagar pauta" : ""}.`,
    });
  }

  // Formatos: el que más engancha contra el que menos (orgánico, con alcance suficiente).
  const formats = groupBy(loaded.filter((p) => p.results!.spend === 0 && p.results!.reach >= MIN_REACH && p.results!.interactions > 0), formatGroup);
  const bestF = formats[0];
  const worstF = formats.at(-1);
  if (bestF && worstF && bestF !== worstF && bestF.engagement! >= worstF.engagement! * 1.5) {
    worked.push({ title: `Los ${plural(bestF.key)} enganchan más`, detail: `${fmtPct(bestF.engagement)} de interacción promedio en ${bestF.count} ${bestF.count === 1 ? "pieza" : "piezas"}, contra ${fmtPct(worstF.engagement)} de los ${plural(worstF.key)}.` });
    didnt.push({ title: `Los ${plural(worstF.key)} enganchan poco`, detail: `${fmtPct(worstF.engagement)} de interacción: ${fmtInt(worstF.totals.interactions)} interacciones con ${fmtInt(worstF.totals.reach)} personas alcanzadas.` });
    next.push(`Repetí ${plural(bestF.key)}: fueron lo que más enganchó${top && formatGroup(top) === bestF.key ? `, sobre todo ${q(top.title)}` : ""}.`);
    next.push(`A los ${plural(worstF.key)} cambiales la primera línea por una pregunta o un dato concreto, o pasá ese tiempo a ${plural(bestF.key)}.`);
  } else if (bestF) {
    next.push(`Repetí lo que mejor anduvo: ${plural(bestF.key)} con ${fmtPct(bestF.engagement)} de interacción.`);
  }

  // Redes: dónde salen más consultas por persona alcanzada.
  const channels = groupBy(loaded, (p) => p.channel).filter((g) => g.totals.inquiries > 0).sort((a, b) => (b.per1000 ?? 0) - (a.per1000 ?? 0));
  if (channels.length >= 2 && channels[0].per1000! >= channels[1].per1000! * 1.5) {
    const c = channels[0];
    worked.push({ title: `${c.key} trae consultas`, detail: `${fmtInt(c.totals.inquiries)} consultas con ${fmtInt(c.totals.reach)} personas alcanzadas: ${String(c.per1000).replace(".", ",")} cada 1.000, contra ${String(channels[1].per1000).replace(".", ",")} en ${channels[1].key}.` });
    next.push(`Para conseguir consultas, apoyate en ${c.key}.`);
  }

  // Pauta: cuánto costó cada consulta y qué anuncio rindió más.
  const paid = loaded.filter((p) => p.results!.spend > 0);
  if (paid.length) {
    const ps = sum(paid.map((p) => p.results));
    const cpi = costPer(ps.spend, ps.inquiries);
    if (cpi) worked.push({ title: "La pauta", detail: `Invertiste ${fmtARS(ps.spend)} y trajo ${fmtInt(ps.inquiries)} consultas: ${fmtARS(cpi)} por consulta.` });
    const noInq = paid.filter((p) => p.results!.inquiries === 0);
    for (const p of noInq) didnt.push({ title: `${q(p.title)} no trajo consultas`, detail: `Se invirtieron ${fmtARS(p.results!.spend)} y llegó a ${fmtInt(p.results!.reach)} personas, pero nadie escribió. Revisá el botón y la oferta.` });
    const ranked = paid.filter((p) => p.results!.inquiries > 0).sort((a, b) => costPer(a.results!.spend, a.results!.inquiries)! - costPer(b.results!.spend, b.results!.inquiries)!);
    if (ranked.length >= 2) {
      const cheap = ranked[0];
      const dear = ranked.at(-1)!;
      const cc = costPer(cheap.results!.spend, cheap.results!.inquiries)!;
      const dc = costPer(dear.results!.spend, dear.results!.inquiries)!;
      if (dc >= cc * 1.5) didnt.push({ title: `${q(dear.title)} salió cara`, detail: `${fmtARS(dc)} por consulta, contra ${fmtARS(cc)} de ${q(cheap.title)}.` });
      next.push(`Si vas a pautar, arrancá desde ${q(cheap.title)}: fue la consulta más barata (${fmtARS(cc)}).`);
    } else if (ranked.length === 1) {
      next.push(`Si vas a pautar de nuevo, partí de ${q(ranked[0].title)} y compará el costo por consulta.`);
    }
  }

  // Piezas que no movieron nada.
  for (const p of loaded) {
    const pr = p.results!;
    if (pr.spend === 0 && pr.reach >= MIN_REACH && pr.interactions === 0 && pr.inquiries === 0) {
      didnt.push({ title: `${q(p.title)} pasó de largo`, detail: `${fmtInt(pr.reach)} personas la vieron y nadie reaccionó ni escribió.` });
    }
  }

  if (missing) {
    didnt.push({ title: "Faltan resultados", detail: `${missing} ${missing === 1 ? "pieza publicada no tiene" : "piezas publicadas no tienen"} resultados cargados: el análisis no las cuenta.` });
    next.push("Cargá los resultados a los 7 días de cada publicación, así todas se comparan igual.");
  }
  if (!next.length) next.push("Seguí cargando resultados: con más piezas el análisis compara mejor.");

  return { summary, worked: worked.slice(0, 5), didnt: didnt.slice(0, 4), next: next.slice(0, 4), missing };
}

// "?mes=2026-10" muestra ese mes; sin mes (o con uno que no es válido), los últimos 30 días.
export function resolvePeriod(mes: string | undefined, today: Day): Period & { month: Month | null } {
  if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes <= today.slice(0, 7)) return { ...monthPeriod(mes), month: mes };
  return { ...lastDays(today), month: null };
}
