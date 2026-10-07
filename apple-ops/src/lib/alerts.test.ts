import { describe, expect, it } from "vitest";
import { lowMarginDevices, lowMarginSales, margin, saleMargin, staleDevices, type AlertDevice } from "./alerts";
import type { ReportSale } from "./reports";

const dev = (o: Partial<AlertDevice>): AlertDevice => ({ id: "d", model: "iPhone 13", capacity: 128, condition: "Usado A", entry_date: "2026-10-01", price_usd: 450, cost_usd: 370, ...o });
const sale = (o: Partial<ReportSale>): ReportSale => ({
  id: "s", number: "V-0001", at: "2026-10-04T15:00:00Z", status: "Cerrada", client_name: "Ana", seller_id: "u1", seller_name: "Mati",
  fx: 1000, total_usd: 0, discount_usd: 0, trade_in_usd: 0, lines: [], ...o,
});

describe("alertas", () => {
  it("margen sobre el precio de venta", () => {
    expect(margin(500, 400)).toBeCloseTo(0.2);
    expect(margin(0, 100)).toBe(0);
  });

  it("equipos parados desde el día configurado, los más viejos primero", () => {
    const out = staleDevices([dev({ id: "a", entry_date: "2026-09-20" }), dev({ id: "b", entry_date: "2026-08-01" }), dev({ id: "c", entry_date: "2026-10-05" })], 30, "2026-10-20");
    expect(out.map((d) => [d.id, d.days])).toEqual([["b", 80], ["a", 30]]);
  });

  it("equipos con precio por debajo del margen objetivo, sin contar los que no tienen costo", () => {
    const out = lowMarginDevices([dev({ id: "ok", price_usd: 500, cost_usd: 400 }), dev({ id: "bajo", price_usd: 420, cost_usd: 400 }), dev({ id: "pierde", price_usd: 380, cost_usd: 400 }), dev({ id: "sin", cost_usd: null })], 0.12);
    expect(out.map((d) => d.id)).toEqual(["pierde", "bajo"]);
    expect(out[0].margin).toBeLessThan(0);
  });

  it("ventas cerradas con margen bajo, con costos en pesos convertidos al dólar de la venta", () => {
    const buena = sale({ id: "buena", total_usd: 900, lines: [{ kind: "device", device_kind: "iPhone", description: "iPhone 14", qty: 1, unit_price: 900, currency: "USD", cost: { unit_cost: 700, currency: "USD" } }] });
    const floja = sale({ id: "floja", total_usd: 20, lines: [{ kind: "acc", device_kind: null, description: "Funda", qty: 2, unit_price: 10000, currency: "ARS", cost: { unit_cost: 9000, currency: "ARS" } }] });
    const anulada = sale({ id: "anulada", status: "Anulada", total_usd: 100, lines: [{ kind: "device", device_kind: "iPhone", description: "X", qty: 1, unit_price: 100, currency: "USD", cost: { unit_cost: 100, currency: "USD" } }] });
    const sinCosto = sale({ id: "sin", total_usd: 100, lines: [{ kind: "device", device_kind: "iPhone", description: "X", qty: 1, unit_price: 100, currency: "USD", cost: null }] });
    expect(saleMargin(floja)).toBeCloseTo(0.1);
    expect(saleMargin(sinCosto)).toBeNull();
    expect(lowMarginSales([buena, floja, anulada, sinCosto], 0.12).map((s) => s.id)).toEqual(["floja"]);
  });
});
