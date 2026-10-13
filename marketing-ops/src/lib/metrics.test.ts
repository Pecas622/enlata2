import { describe, expect, it } from "vitest";
import { allowedNumbers, dataFor, inventedNumbers, numbersIn, parseAnalysis } from "./insights-ai";
import { analyze, delta, fmtPct, groupBy, formatGroup, lastDays, monthPeriod, previousPeriod, rates, sum, type PieceResult, type Results } from "./metrics";

const r = (reach: number, interactions: number, inquiries = 0, spend = 0, sales = 0, clicks = 0): Results => ({ reach, interactions, clicks, inquiries, sales, spend });
let n = 0;
const piece = (title: string, p: Partial<PieceResult>, results: Results | null): PieceResult => ({
  id: String(++n), title, brand: "La Espiga", channel: "Instagram", format: "Post", goal: "Vender", day: "2026-10-05", campaign_id: null, results, ...p,
});

const rows = [
  piece("Medialunas recién salidas", {}, r(1450, 62, 4)),
  piece("Así se hace la masa madre", { format: "Reel", goal: "Comunidad" }, r(5200, 410, 9)),
  piece("Encargos para el Día de la Madre", { channel: "WhatsApp", format: "Mensaje" }, r(320, 0, 21, 0, 9)),
  piece("Tortas para mamá", { format: "Anuncio" }, r(8400, 190, 17, 22000, 6)),
  piece("Service en 48 h", { format: "Anuncio", brand: "Rodar Bikes" }, r(9800, 160, 24, 35000)),
  piece("Llegaron las urbanas", { brand: "Rodar Bikes" }, r(1300, 41, 3)),
  piece("Nuevo horario de los domingos", { channel: "Facebook" }, null),
];
const prev = [piece("Por qué usamos masa madre", {}, r(1100, 48, 1))];

describe("números", () => {
  it("formatea porcentajes en criollo", () => {
    expect(fmtPct(0.0788)).toBe("7,9 %");
    expect(fmtPct(0.12)).toBe("12 %");
    expect(fmtPct(0.03)).toBe("3 %");
    expect(fmtPct(null)).toBe("-");
  });

  it("calcula tasas sin dividir por cero", () => {
    expect(rates(r(0, 0))).toEqual({ engagement: null, per1000: null, cpi: null });
    expect(rates(r(8400, 190, 17, 22000))).toEqual({ engagement: 190 / 8400, per1000: 2, cpi: 1294 });
    expect(sum([r(1, 2, 3), null, r(10, 20, 30)])).toEqual(r(11, 22, 33));
    expect(delta(150, 100)).toBe(0.5);
    expect(delta(5, 0)).toBeNull();
  });

  it("arma los períodos y el anterior", () => {
    expect(lastDays("2026-10-13")).toEqual({ from: "2026-09-14", to: "2026-10-13", label: "Últimos 30 días" });
    expect(monthPeriod("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28", label: "febrero 2026" });
    expect(previousPeriod(monthPeriod("2026-03"))).toMatchObject({ from: "2026-01-29", to: "2026-02-28" });
  });

  it("agrupa por formato, con el email aparte del mensaje", () => {
    const g = groupBy(rows, formatGroup);
    expect(g[0]).toMatchObject({ key: "Reel", count: 1 });
    expect(g.find((x) => x.key === "Anuncio")).toMatchObject({ count: 2, totals: { spend: 57000, inquiries: 41 } });
    expect(formatGroup({ format: "Mensaje", channel: "Email" })).toBe("Email");
  });
});

describe("análisis por reglas", () => {
  const a = analyze(rows, prev);

  it("resume y compara con el período anterior", () => {
    expect(a.summary).toContain("6 piezas con resultados");
    expect(a.summary).toContain("26.470 personas alcanzadas");
    expect(a.summary).toContain("Contra el período anterior, el alcance creció mucho y las consultas crecieron mucho.");
    expect(analyze(rows, [piece("antes", {}, r(20000, 500, 60))]).summary).toContain("el alcance subió 32 % y las consultas subieron 30 %");
    expect(a.missing).toBe(1);
  });

  it("dice qué funcionó: lo que más enganchó, lo que trajo consultas, el formato y la red", () => {
    const titles = a.worked.map((w) => w.title);
    expect(titles[0]).toBe("Lo que más enganchó: “Así se hace la masa madre”");
    expect(titles).toContain("Lo que más consultas trajo: “Service en 48 h”");
    expect(titles).toContain("Los Reels enganchan más");
    expect(titles).toContain("WhatsApp trae consultas");
    expect(a.worked.find((w) => w.title === "La pauta")?.detail).toContain("41 consultas");
  });

  it("dice qué no funcionó y qué repetir", () => {
    expect(a.didnt.map((d) => d.title)).toEqual(expect.arrayContaining(["Los Posts enganchan poco", "Faltan resultados"]));
    expect(a.next[0]).toContain("Repetí Reels");
    expect(a.next.join(" ")).toContain("apoyate en WhatsApp");
    expect(a.next.join(" ")).toContain("arrancá desde “Tortas para mamá”");
  });

  it("avisa un anuncio que no trajo consultas", () => {
    const b = analyze([piece("Anuncio flojo", { format: "Anuncio" }, r(3000, 20, 0, 10000))]);
    expect(b.didnt[0].title).toBe("“Anuncio flojo” no trajo consultas");
  });

  it("sin resultados pide cargarlos", () => {
    const b = analyze([piece("x", {}, null)]);
    expect(b.summary).toContain("Todavía no hay resultados");
    expect(b.next[0]).toContain("Cargá los resultados");
    expect(analyze([]).summary).toContain("no hay piezas publicadas");
  });

  it("el análisis por reglas no usa números que no estén en los datos", () => {
    const allowed = allowedNumbers(dataFor(rows, prev, lastDays("2026-10-13")));
    const text = [a.summary, ...a.worked.map((w) => w.title + " " + w.detail), ...a.didnt.map((d) => d.title + " " + d.detail), ...a.next].join(" ");
    expect(inventedNumbers(text, allowed)).toEqual([]);
  });
});

describe("análisis con IA: control de números", () => {
  const data = dataFor(rows, prev, lastDays("2026-10-13"));
  const allowed = allowedNumbers(data);

  it("lee números en formato argentino", () => {
    expect(numbersIn("Llegó a 8.400 personas, 2,3 % y $ 22.000")).toEqual([8400, 2.3, 22000]);
  });

  it("acepta los números de los datos y sus redondeos, y detecta los inventados", () => {
    expect(inventedNumbers("El anuncio llegó a 8.400 personas con 7,9 % de interacción y costó $ 1.294 por consulta", allowed)).toEqual([]);
    expect(inventedNumbers("Las 3 piezas del lunes", allowed)).toEqual([]);
    expect(inventedNumbers("Los Reels enganchan 2,7 veces más y vas a vender 7.777 más", allowed)).toEqual([2.7, 7777]);
  });

  it("descarta los puntos con números inventados y se queda con el resto", () => {
    const json = JSON.stringify({
      resumen: "Buen mes: 26.470 personas alcanzadas.",
      funciono: [
        { titulo: "El Reel de la masa madre", detalle: "Tuvo 410 interacciones, probablemente por mostrar el proceso." },
        { titulo: "Los Reels", detalle: "Enganchan 2,7 veces más que los posts." },
      ],
      no_funciono: [],
      repetir: ["Hacé 2 Reels por semana mostrando el horno.", "Vas a duplicar las ventas a 30.000 pesos."],
    });
    const out = parseAnalysis(json, allowed, 1);
    expect(out.worked.map((w) => w.title)).toEqual(["El Reel de la masa madre"]);
    expect(out.next).toEqual(["Hacé 2 Reels por semana mostrando el horno."]);
    expect(out.summary).toBe("Buen mes: 26.470 personas alcanzadas.");
    expect(out.dropped).toBe(2);
    expect(out.missing).toBe(1);
  });

  it("si no queda nada usable, falla para volver a las reglas", () => {
    expect(() => parseAnalysis("no es json", allowed, 0)).toThrow("JSON");
    expect(() => parseAnalysis(JSON.stringify({ resumen: "", funciono: [{ titulo: "x", detalle: "subió 99,9 %" }], no_funciono: [], repetir: [] }), allowed, 0)).toThrow("puntos");
  });
});

describe("análisis con IA: llamada", () => {
  it("manda los datos calculados y devuelve lo que pasa el control", async () => {
    const { analyzeWithClaude } = await import("./insights-ai");
    let sent = "";
    const reply = { resumen: "Buen período.", funciono: [{ titulo: "“Así se hace la masa madre”", detalle: "410 interacciones con 5.200 personas alcanzadas." }], no_funciono: [], repetir: ["Repetí Reels mostrando el proceso."] };
    const fake = { beta: { messages: { create: async (body: { messages: { content: string }[] }) => { sent = body.messages[0].content; return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reply) }] }; } } } };
    const out = await analyzeWithClaude(rows, prev, lastDays("2026-10-13"), fake as never);
    expect(sent).toContain("\"personas_alcanzadas\": 5200");
    expect(sent).toContain("Nuevo horario de los domingos");
    expect(out.worked).toHaveLength(1);
    expect(out.missing).toBe(1);
    expect(out.dropped).toBe(0);
  });
});
