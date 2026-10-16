import { describe, expect, it } from "vitest";
import { analyze, monthPeriod, type PieceResult, type Results } from "./metrics";
import { buildReport, campaignResults, deltaText, reportText, reportTitle } from "./report";

const nb = (s: string) => s.replace(/\u00a0/g, " ");
const r = (reach: number, interactions: number, inquiries = 0, spend = 0, sales = 0): Results => ({ reach, interactions, clicks: 0, inquiries, sales, spend });
let n = 0;
const piece = (title: string, p: Partial<PieceResult>, results: Results | null): PieceResult & { brand_id: string } => ({
  id: String(++n), title, brand: "La Espiga", brand_id: "b1", channel: "Instagram", format: "Post", goal: "Vender", day: "2026-10-05", campaign_id: null, results, ...p,
});

const period = monthPeriod("2026-10");
const rows = [
  piece("Medialunas recién salidas", {}, r(1450, 62, 4)),
  piece("Así se hace la masa madre", { format: "Reel" }, r(5200, 410, 9)),
  piece("Encargos para el Día de la Madre", { channel: "WhatsApp", format: "Mensaje", campaign_id: "c1" }, r(320, 0, 21, 0, 9)),
  piece("Tortas para mamá", { format: "Anuncio", campaign_id: "c1" }, r(8400, 190, 17, 22000, 6)),
  piece("Nuevo horario de los domingos", { channel: "Facebook" }, null),
];
const prev = [piece("Por qué usamos masa madre", { day: "2026-09-10" }, r(10000, 300, 40))];
const campaigns = campaignResults(
  [
    { id: "c1", name: "Día de la Madre", brand_id: "b1", starts_on: "2026-10-01", ends_on: "2026-10-18" },
    { id: "c2", name: "Sin piezas", brand_id: "b1", starts_on: "2026-10-01", ends_on: "2026-10-31" },
    { id: "c3", name: "De otra marca", brand_id: "b2", starts_on: "2026-10-01", ends_on: "2026-10-31" },
  ],
  rows, period, "b1",
);
const report = buildReport({ brand: "La Espiga", preparedBy: "Agencia Norte", period, rows, prev, campaigns, analysis: analyze(rows, prev) });

describe("reporte para el cliente", () => {
  it("resultados del período con la comparación en palabras", () => {
    expect(reportTitle(report)).toBe("Reporte de La Espiga · octubre 2026");
    expect(report.published).toBe(5);
    expect(report.withResults).toBe(4);
    expect(report.kpis.map((k) => [k.label, nb(k.value), nb(k.note)])).toEqual([
      ["Personas alcanzadas", "15.370", "subió 54 % contra el período anterior"],
      ["Interacciones", "662", "4,3 % de las personas alcanzadas"],
      ["Consultas", "51", "subió 28 % contra el período anterior"],
      ["Ventas", "15", "sin datos del período anterior"],
      ["Inversión en pauta", "$ 22.000", "$ 1.294 por consulta de la pauta"],
    ]);
  });

  it("sin ventas ni pauta no muestra esos números", () => {
    const organic = buildReport({ brand: null, preparedBy: "", period, rows: [rows[0], rows[1]], prev: [], campaigns: [], analysis: analyze([rows[0], rows[1]]) });
    expect(organic.kpis.map((k) => k.key)).toEqual(["reach", "interactions", "inquiries"]);
    expect(reportTitle(organic)).toBe("Reporte · octubre 2026");
  });

  it("lo mejor: primero lo que trajo consultas", () => {
    expect(report.top.map((p) => [p.title, p.where, p.inquiries])).toEqual([
      ["Encargos para el Día de la Madre", "WhatsApp Mensaje de difusión", 21],
      ["Tortas para mamá", "Instagram Anuncio", 17],
      ["Así se hace la masa madre", "Instagram Reel", 9],
      ["Medialunas recién salidas", "Instagram Post", 4],
    ]);
    expect(report.top[2].engagement).toBe("7,9 %");
  });

  it("campañas de la marca que tienen piezas, con lo que dieron", () => {
    expect(campaigns.map((c) => [c.name, c.pieces, c.reach, c.inquiries, c.spend, c.cpi])).toEqual([["Día de la Madre", 2, 8720, 38, 22000, 579]]);
  });

  it("comparación sin base o con saltos grandes", () => {
    expect(deltaText(10, 0)).toBe("sin datos del período anterior");
    expect(deltaText(100, 100)).toBe("igual que el período anterior");
    expect(deltaText(500, 100)).toBe("mucho más que el período anterior");
    expect(deltaText(80, 100)).toBe("bajó 20 % contra el período anterior");
  });

  it("en texto para WhatsApp, con la nota y solo las partes elegidas", () => {
    const text = nb(reportText(report, "  Hola Marta, te paso cómo nos fue en octubre.  ", { analysis: false, top: true, breakdown: false, campaigns: true, next: true }));
    expect(text.split("\n").slice(0, 6)).toEqual([
      "*Reporte de La Espiga · octubre 2026*",
      "Preparado por Agencia Norte",
      "",
      "Hola Marta, te paso cómo nos fue en octubre.",
      "",
      "*Resultados*",
    ]);
    expect(text).toContain("• Personas alcanzadas: 15.370 (subió 54 % contra el período anterior)");
    expect(text).toContain("1. Encargos para el Día de la Madre (WhatsApp Mensaje de difusión): 320 alcanzadas, 0 % de interacción, 21 consultas");
    expect(text).toContain("• Día de la Madre: 8.720 alcanzadas, 38 consultas, $ 22.000 invertidos ($ 579 por consulta)");
    expect(text).toContain("*Para el mes que viene*");
    expect(text).not.toContain("*Qué funcionó*");
    expect(text).not.toContain("*Por formato*");
    expect(reportText(report)).toContain("*Qué funcionó*\n• Lo que más enganchó");
  });
});
