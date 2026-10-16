// Reporte para el cliente: lo de Métricas de un período, ordenado para mandárselo a quien no usa la app.
// Todo es puro: la página lo arma, se imprime o se guarda en PDF desde el navegador y `reportText` lo pasa a
// texto para WhatsApp o un email. Solo usa números de los resultados cargados.
import { formatLabel } from "./channels";
import { fmtARS } from "./campaigns";
import type { Day } from "./calendar";
import { delta, fmtInt, fmtPct, formatGroup, groupBy, plural, rates, sum, type Analysis, type Group, type PieceResult, type Period, type Results } from "./metrics";

export type ReportKpi = { key: string; label: string; value: string; note: string };
export type ReportPiece = { id: string; title: string; where: string; day: Day; reach: number; engagement: string; inquiries: number; sales: number };
export type ReportCampaign = { name: string; pieces: number; reach: number; inquiries: number; spend: number; cpi: number | null };
export type Report = {
  brand: string | null;
  period: Period;
  preparedBy: string;
  published: number;
  withResults: number;
  kpis: ReportKpi[];
  top: ReportPiece[];
  formats: Group[];
  channels: Group[];
  campaigns: ReportCampaign[];
  analysis: Analysis;
};

export const SECTIONS = [
  { key: "analysis", label: "Qué funcionó y qué no" },
  { key: "top", label: "Lo mejor del período" },
  { key: "breakdown", label: "Por formato y por red" },
  { key: "campaigns", label: "Campañas" },
  { key: "next", label: "Para el mes que viene" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];
export type Shown = Record<SectionKey, boolean>;
export const ALL_SHOWN: Shown = { analysis: true, top: true, breakdown: true, campaigns: true, next: true };

export const NOTE_MAX = 1500;
const TOP = 5;

// "subió 35 % contra el período anterior". Un salto de más del triple se dice en palabras.
export function deltaText(cur: number, prev: number): string {
  const d = delta(cur, prev);
  if (d === null) return "sin datos del período anterior";
  if (d === 0) return "igual que el período anterior";
  if (Math.abs(d) > 3) return `${d > 0 ? "mucho más" : "mucho menos"} que el período anterior`;
  return `${d > 0 ? "subió" : "bajó"} ${fmtPct(Math.abs(d))} contra el período anterior`;
}

// Las campañas que se cruzan con el período y tienen piezas publicadas, con lo que dieron.
export function campaignResults(
  campaigns: { id: string; name: string; brand_id: string; starts_on: string; ends_on: string }[],
  pieces: (PieceResult & { brand_id: string })[],
  period: Period,
  brandId?: string | null,
): (ReportCampaign & { id: string; loaded: number; totals: Results })[] {
  return campaigns
    .filter((c) => (!brandId || c.brand_id === brandId) && c.starts_on <= period.to && c.ends_on >= period.from)
    .map((c) => {
      const ps = pieces.filter((p) => p.campaign_id === c.id);
      const totals = sum(ps.map((p) => p.results));
      return { id: c.id, name: c.name, pieces: ps.length, loaded: ps.filter((p) => p.results).length, totals, reach: totals.reach, inquiries: totals.inquiries, spend: totals.spend, cpi: rates(totals).cpi };
    })
    .filter((x) => x.pieces > 0);
}

export function buildReport(input: {
  brand: string | null; preparedBy: string; period: Period; rows: PieceResult[]; prev: PieceResult[]; campaigns: ReportCampaign[]; analysis: Analysis;
}): Report {
  const { rows, prev } = input;
  const loaded = rows.filter((p) => p.results);
  const t = sum(loaded.map((p) => p.results));
  const b = sum(prev.map((p) => p.results));
  const r = rates(t);
  const kpis: ReportKpi[] = [
    { key: "reach", label: "Personas alcanzadas", value: fmtInt(t.reach), note: deltaText(t.reach, b.reach) },
    { key: "interactions", label: "Interacciones", value: fmtInt(t.interactions), note: r.engagement === null ? "sin alcance cargado" : `${fmtPct(r.engagement)} de las personas alcanzadas` },
    { key: "inquiries", label: "Consultas", value: fmtInt(t.inquiries), note: deltaText(t.inquiries, b.inquiries) },
  ];
  if (t.sales || b.sales) kpis.push({ key: "sales", label: "Ventas", value: fmtInt(t.sales), note: deltaText(t.sales, b.sales) });
  // El costo por consulta sale solo de las piezas con pauta: las consultas orgánicas no se pagaron.
  const paid = sum(loaded.filter((p) => p.results!.spend > 0).map((p) => p.results));
  const cpi = rates(paid).cpi;
  if (t.spend || b.spend) kpis.push({ key: "spend", label: "Inversión en pauta", value: fmtARS(t.spend), note: cpi ? `${fmtARS(cpi)} por consulta de la pauta` : "sin consultas de la pauta" });

  // Lo mejor: primero lo que trajo consultas, después lo que más enganchó.
  const top = [...loaded]
    .sort((x, y) => y.results!.inquiries - x.results!.inquiries || y.results!.interactions - x.results!.interactions || y.results!.reach - x.results!.reach)
    .slice(0, TOP)
    .map((p) => ({
      id: p.id, title: p.title, where: `${p.channel} ${formatLabel(p.format, p.channel)}`, day: p.day,
      reach: p.results!.reach, engagement: fmtPct(rates(p.results!).engagement), inquiries: p.results!.inquiries, sales: p.results!.sales,
    }));

  return {
    brand: input.brand, period: input.period, preparedBy: input.preparedBy, published: rows.length, withResults: loaded.length,
    kpis, top, formats: groupBy(loaded, formatGroup), channels: groupBy(loaded, (p) => p.channel), campaigns: input.campaigns, analysis: input.analysis,
  };
}

export const reportTitle = (r: Pick<Report, "brand" | "period">) => `Reporte${r.brand ? ` de ${r.brand}` : ""} · ${r.period.label}`;

// El reporte en texto, para pegar en WhatsApp (los *asteriscos* son negrita) o en un email.
export function reportText(r: Report, note = "", shown: Shown = ALL_SHOWN): string {
  const out: string[] = [`*${reportTitle(r)}*`];
  if (r.preparedBy) out.push(`Preparado por ${r.preparedBy}`);
  if (note.trim()) out.push("", note.trim());
  out.push("", "*Resultados*", ...r.kpis.map((k) => `• ${k.label}: ${k.value} (${k.note})`));
  out.push("", r.analysis.summary);
  if (shown.analysis && r.analysis.worked.length) out.push("", "*Qué funcionó*", ...r.analysis.worked.map((i) => `• ${i.title}. ${i.detail}`));
  if (shown.analysis && r.analysis.didnt.length) out.push("", "*Qué no funcionó*", ...r.analysis.didnt.map((i) => `• ${i.title}. ${i.detail}`));
  if (shown.top && r.top.length) {
    out.push("", "*Lo mejor del período*", ...r.top.map((p, n) => `${n + 1}. ${p.title} (${p.where}): ${fmtInt(p.reach)} alcanzadas, ${p.engagement} de interacción, ${fmtInt(p.inquiries)} consultas`));
  }
  if (shown.breakdown && r.formats.length) out.push("", "*Por formato*", ...r.formats.map((g) => `• ${plural(g.key)}: ${fmtPct(g.engagement)} de interacción en ${g.count} ${g.count === 1 ? "pieza" : "piezas"}`));
  if (shown.breakdown && r.channels.length) out.push("", "*Por red*", ...r.channels.map((g) => `• ${g.key}: ${fmtInt(g.totals.reach)} alcanzadas, ${fmtInt(g.totals.inquiries)} consultas`));
  if (shown.campaigns && r.campaigns.length) {
    out.push("", "*Campañas*", ...r.campaigns.map((c) => `• ${c.name}: ${fmtInt(c.reach)} alcanzadas, ${fmtInt(c.inquiries)} consultas${c.spend ? `, ${fmtARS(c.spend)} invertidos${c.cpi ? ` (${fmtARS(c.cpi)} por consulta)` : ""}` : ""}`));
  }
  if (shown.next && r.analysis.next.length) out.push("", "*Para el mes que viene*", ...r.analysis.next.map((n) => `• ${n}`));
  return out.join("\n");
}
