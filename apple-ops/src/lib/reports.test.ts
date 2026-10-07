import { describe, expect, it } from "vitest";
import { addDays, last7Days, periodFrom, saleCost, salesCSVRows, salesReport, toCSV, type ReportSale } from "./reports";

const sale = (o: Partial<ReportSale>): ReportSale => ({
  id: "s", number: "V-0001", at: "2026-10-04T15:00:00Z", status: "Cerrada", client_name: "Ana", seller_id: "u1", seller_name: "Mati",
  fx: 1000, total_usd: 0, discount_usd: 0, trade_in_usd: 0, lines: [], ...o,
});

const iphone = sale({
  id: "a", total_usd: 900, trade_in_usd: 300,
  lines: [{ kind: "device", device_kind: "iPhone", description: "iPhone 14", qty: 1, unit_price: 900, currency: "USD", cost: { unit_cost: 700, currency: "USD" } }],
});
const funda = sale({
  id: "b", number: "V-0002", seller_id: "u2", seller_name: "Lucía", total_usd: 18, discount_usd: 2,
  lines: [{ kind: "acc", device_kind: null, description: "Funda", qty: 2, unit_price: 10000, currency: "ARS", cost: { unit_cost: 4000, currency: "ARS" } }],
});
const anulada = sale({ id: "c", status: "Anulada", total_usd: 5000 });
const sellers = [
  { id: "u1", name: "Mati", role: "Vendedor", commission_pct: 2 },
  { id: "u2", name: "Lucía", role: "Encargado", commission_pct: 0 },
  { id: "u3", name: "Caro", role: "Cajero", commission_pct: 0 },
];

describe("periodos", () => {
  it("cuentan días locales hacia atrás, incluido hoy", () => {
    expect(periodFrom("Hoy", "2026-10-05")).toBe("2026-10-05");
    expect(periodFrom("7 días", "2026-10-05")).toBe("2026-09-29");
    expect(periodFrom("30 días", "2026-10-05")).toBe("2026-09-06");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("salesReport", () => {
  it("factura después del descuento, pasa los pesos a USD con la cotización de la venta e ignora anuladas", () => {
    expect(saleCost(funda)).toBe(8);
    const r = salesReport([iphone, funda, anulada], sellers);
    expect(r).toMatchObject({ count: 2, rev: 918, cost: 708, profit: 210, margin: 23, avgTicket: 459, canjes: 1, canjesPct: 50 });
    expect(r.bySeller).toEqual([
      { id: "u1", name: "Mati", n: 1, rev: 900, profit: 200, commission: 18 },
      { id: "u2", name: "Lucía", n: 1, rev: 18, profit: 10, commission: 0 },
    ]);
    expect(r.byCategory).toEqual([{ k: "iPhone", v: 900, pct: 98 }, { k: "Accesorios", v: 20, pct: 2 }]);
  });

  it("sin costos (roles sin permiso) la ganancia es el total", () => {
    const sinCosto = { ...iphone, lines: iphone.lines.map((l) => ({ ...l, cost: null })) };
    expect(salesReport([sinCosto], sellers).cost).toBe(0);
  });
});

describe("last7Days", () => {
  it("agrupa por día de Argentina, no por UTC", () => {
    // 02:00 UTC del 5 es 23:00 del 4 en Mendoza.
    const late = sale({ at: "2026-10-05T02:00:00Z", total_usd: 100 });
    const days = last7Days([late], "2026-10-05");
    expect(days).toHaveLength(7);
    expect(days.find((d) => d.day === "2026-10-04")!.value).toBe(100);
    expect(days.at(-1)!.value).toBe(0);
  });
});

describe("CSV", () => {
  it("la ganancia solo sale para quien ve costos", () => {
    expect(Object.keys(salesCSVRows([iphone], false)[0])).not.toContain("GananciaUSD");
    expect(salesCSVRows([iphone], true)[0].GananciaUSD).toBe(200);
    expect(toCSV([{ a: 'x "y"', b: 1 }])).toBe('a,b\n"x ""y""","1"');
  });
});
